/**
 * MUSIC PLAYER MODULE CHO QUẢN LÝ LÊ
 * Hỗ trợ: SoundCloud (mặc định siêu mượt), YouTube (khi có Cookie), Audio stream trực tiếp
 */

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
    StreamType
} = require('@discordjs/voice');
const play = require('play-dl');
const ytdl = require('@distube/ytdl-core');
const { EmbedBuilder } = require('discord.js');

// Quản lý hàng đợi bài hát theo từng Guild (guildId -> queueObj)
const guildQueues = new Map();

// Tự động khởi tạo SoundCloud Free Client ID
let scInitialized = false;
async function initSoundCloud() {
    if (scInitialized) return;
    try {
        const clientId = await play.getFreeClientID();
        if (clientId) {
            await play.setToken({ soundcloud: { client_id: clientId } });
            scInitialized = true;
            console.log('[MUSIC] Đã khởi tạo SoundCloud Client ID thành công.');
        }
    } catch (e) {
        console.warn('[MUSIC] Lỗi khởi tạo SoundCloud:', e.message);
    }
}

// Khởi tạo YouTube Cookie nếu có trong ENV
async function initYouTubeCookie() {
    const cookie = process.env.YOUTUBE_COOKIE || process.env.YT_COOKIE;
    if (cookie && cookie.trim().length > 10) {
        try {
            await play.setToken({
                youtube: {
                    cookie: cookie.trim()
                }
            });
            console.log('[MUSIC] 🟢 Đã nạp YouTube Cookie thành công vào play-dl!');
        } catch (e) {
            console.warn('[MUSIC] ⚠️ Không thể nạp YouTube Cookie:', e.message);
        }
    }
}

// Chạy khởi tạo ban đầu
initSoundCloud();
initYouTubeCookie();

/**
 * Tìm kiếm bài hát và trả về thông tin bài
 * @param {string} query Tên bài hoặc link
 */
async function searchTrack(query) {
    await initSoundCloud();
    const isUrl = query.startsWith('http://') || query.startsWith('https://');

    // 1. Nếu là link SoundCloud
    if (isUrl && query.includes('soundcloud.com')) {
        try {
            const scInfo = await play.soundcloud(query);
            return {
                title: scInfo.name || 'SoundCloud Track',
                url: scInfo.url,
                duration: scInfo.durationInSec ? `${Math.floor(scInfo.durationInSec / 60)}:${('0' + (scInfo.durationInSec % 60)).slice(-2)}` : 'N/A',
                thumbnail: scInfo.thumbnail || null,
                source: 'soundcloud',
                raw: scInfo
            };
        } catch (e) {
            console.error('[MUSIC] Lỗi parse link SoundCloud:', e.message);
        }
    }

    // 2. Nếu là link YouTube
    if (isUrl && (query.includes('youtube.com') || query.includes('youtu.be'))) {
        try {
            const ytInfo = await play.video_basic_info(query);
            return {
                title: ytInfo.video_details.title || 'YouTube Track',
                url: ytInfo.video_details.url,
                duration: ytInfo.video_details.durationRaw || 'N/A',
                thumbnail: ytInfo.video_details.thumbnails[0]?.url || null,
                source: 'youtube',
                raw: ytInfo
            };
        } catch (e) {
            console.warn('[MUSIC] Lỗi đọc link YouTube trực tiếp:', e.message);
        }
    }

    // 3. Tìm kiếm bằng từ khóa: Ưu tiên tìm trên SoundCloud (miễn phí, không bị YouTube chặn IP)
    try {
        const scResults = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 1 });
        if (scResults && scResults.length > 0) {
            const track = scResults[0];
            return {
                title: track.name,
                url: track.url,
                duration: track.durationInSec ? `${Math.floor(track.durationInSec / 60)}:${('0' + (track.durationInSec % 60)).slice(-2)}` : 'N/A',
                thumbnail: track.thumbnail || null,
                source: 'soundcloud',
                raw: track
            };
        }
    } catch (e) {
        console.warn('[MUSIC] SC Search failed, fallback to YouTube:', e.message);
    }

    // 4. Fallback tìm kiếm YouTube nếu SoundCloud không thấy
    try {
        const ytResults = await play.search(query, { limit: 1 });
        if (ytResults && ytResults.length > 0) {
            const track = ytResults[0];
            return {
                title: track.title,
                url: track.url,
                duration: track.durationRaw || 'N/A',
                thumbnail: track.thumbnails[0]?.url || null,
                source: 'youtube',
                raw: track
            };
        }
    } catch (e) {
        console.error('[MUSIC] YT Search failed:', e.message);
    }

    return null;
}

/**
 * Lấy Audio Stream từ track
 */
async function getAudioStream(track) {
    // A. Nếu là SoundCloud
    if (track.source === 'soundcloud') {
        return await play.stream(track.url);
    }

    // B. Nếu là YouTube
    if (track.source === 'youtube') {
        const cookie = process.env.YOUTUBE_COOKIE || process.env.YT_COOKIE;
        // Thử với distube/ytdl-core nếu có cookie
        if (cookie && cookie.trim().length > 10) {
            try {
                const cookiesJson = cookie.split(';').map(c => {
                    const [name, ...val] = c.trim().split('=');
                    return { name, value: val.join('=') };
                });
                const agent = ytdl.createAgent(cookiesJson);
                const stream = ytdl(track.url, {
                    agent,
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                });
                return { stream, type: StreamType.Arbitrary };
            } catch (err) {
                console.warn('[MUSIC] ytdl-core với cookie lỗi, thử play-dl:', err.message);
            }
        }

        // Thử play.stream
        try {
            return await play.stream(track.url);
        } catch (e) {
            // Nếu YouTube bị chặn, tự động convert tìm bài tương tự trên SoundCloud!
            console.log(`[MUSIC] Chuyển hướng bài "${track.title}" sang SoundCloud để né chặn...`);
            const fallbackSearch = await play.search(track.title, { source: { soundcloud: 'tracks' }, limit: 1 });
            if (fallbackSearch && fallbackSearch.length > 0) {
                return await play.stream(fallbackSearch[0].url);
            }
            throw e;
        }
    }

    throw new Error('Nguồn bài hát không được hỗ trợ!');
}

/**
 * Phát bài hát tiếp theo trong Queue
 */
async function playNext(guildId) {
    const queue = guildQueues.get(guildId);
    if (!queue) return;

    if (queue.songs.length === 0) {
        queue.current = null;
        // Đặt timeout 2 phút không có nhạc sẽ tự out phòng voice
        queue.leaveTimeout = setTimeout(() => {
            const conn = getVoiceConnection(guildId);
            if (conn) conn.destroy();
            guildQueues.delete(guildId);
            if (queue.textChannel) {
                queue.textChannel.send('👋 Đã hết bài hát trong danh sách phát, Quản Lý Lê xin phép rời phòng thoại.').catch(() => {});
            }
        }, 120000);
        return;
    }

    clearTimeout(queue.leaveTimeout);
    const song = queue.songs.shift();
    queue.current = song;

    try {
        const streamData = await getAudioStream(song);
        const resource = createAudioResource(streamData.stream, {
            inputType: streamData.type || StreamType.Arbitrary,
            inlineVolume: true
        });

        if (resource.volume) {
            resource.volume.setVolume(queue.volume || 0.8);
        }

        queue.player.play(resource);

        const embed = new EmbedBuilder()
            .setColor(0x1DB954)
            .setAuthor({ name: 'Quản Lý Lê — Trình Phát Nhạc', iconURL: 'https://cdn.discordapp.com/emojis/1154674121695850556.webp?size=96&quality=lossless' })
            .setTitle(`🎶 Đang phát: ${song.title}`)
            .setURL(song.url)
            .addFields(
                { name: '⏱️ Thời lượng', value: `\`${song.duration}\``, inline: true },
                { name: '🌐 Nguồn', value: song.source === 'soundcloud' ? 'SoundCloud 🟠' : 'YouTube 🔴', inline: true },
                { name: '👤 Người yêu cầu', value: `<@${song.requesterId}>`, inline: true }
            );

        if (song.thumbnail) {
            embed.setThumbnail(song.thumbnail);
        }

        queue.textChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
        console.error('[MUSIC] Lỗi khi phát nhạc:', err);
        if (queue.textChannel) {
            queue.textChannel.send(`❌ Không thể phát bài **${song.title}** (${err.message}). Bỏ qua bài tiếp theo...`).catch(() => {});
        }
        playNext(guildId);
    }
}

/**
 * Xử lý lệnh Play chính
 */
async function handlePlayCommand(messageOrInteraction, query) {
    const isInteraction = !!messageOrInteraction.isChatInputCommand;
    const member = messageOrInteraction.member;
    const guild = messageOrInteraction.guild;
    const textChannel = isInteraction ? messageOrInteraction.channel : messageOrInteraction.channel;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
        const msg = '❌ Bạn cần phải tham gia vào một phòng thoại (Voice Channel) trước khi bật nhạc!';
        return isInteraction ? messageOrInteraction.reply({ content: msg, ephemeral: true }) : messageOrInteraction.reply(msg);
    }

    const permissions = voiceChannel.permissionsFor(guild.members.me);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
        const msg = '❌ Quản Lý Lê không có quyền tham gia hoặc phát âm thanh trong phòng thoại này!';
        return isInteraction ? messageOrInteraction.reply({ content: msg, ephemeral: true }) : messageOrInteraction.reply(msg);
    }

    if (isInteraction) {
        await messageOrInteraction.deferReply();
    } else {
        await messageOrInteraction.channel.sendTyping().catch(() => {});
    }

    // Tìm kiếm bài hát
    const track = await searchTrack(query);
    if (!track) {
        const msg = `❌ Không tìm thấy bài hát nào khớp với từ khóa: \`${query}\``;
        return isInteraction ? messageOrInteraction.editReply(msg) : messageOrInteraction.reply(msg);
    }

    track.requesterId = member.id;

    let queue = guildQueues.get(guild.id);
    if (!queue) {
        // Tạo audio player và kết nối voice
        const player = createAudioPlayer();

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        connection.subscribe(player);

        queue = {
            voiceChannel,
            textChannel,
            connection,
            player,
            songs: [],
            current: null,
            volume: 0.8,
            leaveTimeout: null
        };

        guildQueues.set(guild.id, queue);

        // Lắng nghe sự kiện kết thúc bài
        player.on(AudioPlayerStatus.Idle, () => {
            playNext(guild.id);
        });

        player.on('error', error => {
            console.error('[MUSIC PLAYER ERROR]', error.message);
            playNext(guild.id);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch (e) {
                connection.destroy();
                guildQueues.delete(guild.id);
            }
        });
    }

    // Nếu bot đang rảnh rỗi chưa phát bài nào
    if (!queue.current) {
        queue.songs.push(track);
        playNext(guild.id);
        const replyMsg = `✅ Bắt đầu phát: **${track.title}** (\`${track.duration}\`)`;
        return isInteraction ? messageOrInteraction.editReply(replyMsg) : messageOrInteraction.reply(replyMsg);
    } else {
        // Đã có bài đang phát -> Đưa vào danh sách chờ
        queue.songs.push(track);
        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('➕ Đã thêm vào hàng đợi')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: '⏱️ Thời lượng', value: `\`${track.duration}\``, inline: true },
                { name: '🔢 Vị trí trong hàng đợi', value: `#${queue.songs.length}`, inline: true },
                { name: '👤 Người yêu cầu', value: `<@${member.id}>`, inline: true }
            );
        if (track.thumbnail) embed.setThumbnail(track.thumbnail);

        return isInteraction ? messageOrInteraction.editReply({ embeds: [embed] }) : messageOrInteraction.reply({ embeds: [embed] });
    }
}

/**
 * Xử lý lệnh Skip (Bỏ qua)
 */
function handleSkipCommand(guildId) {
    const queue = guildQueues.get(guildId);
    if (!queue || !queue.current) {
        return { success: false, message: '❌ Hiện không có bài hát nào đang phát để bỏ qua!' };
    }
    const currentTitle = queue.current.title;
    queue.player.stop(); // Kích hoạt sự kiện Idle -> tự động chuyển bài tiếp theo
    return { success: true, message: `⏭️ Đã bỏ qua bài: **${currentTitle}**` };
}

/**
 * Xử lý lệnh Stop (Dừng & xóa queue)
 */
function handleStopCommand(guildId) {
    const queue = guildQueues.get(guildId);
    if (!queue) {
        return { success: false, message: '❌ Quản Lý Lê hiện không phát nhạc trong phòng thoại nào!' };
    }
    queue.songs = [];
    queue.current = null;
    queue.player.stop();
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    guildQueues.delete(guildId);
    return { success: true, message: '⏹️ Đã dừng phát nhạc, xóa hàng đợi và rời khỏi phòng thoại!' };
}

/**
 * Xử lý lệnh Pause / Resume
 */
function handlePauseResumeCommand(guildId, action) {
    const queue = guildQueues.get(guildId);
    if (!queue || !queue.current) {
        return { success: false, message: '❌ Hiện không có bài hát nào đang phát!' };
    }
    if (action === 'pause') {
        queue.player.pause();
        return { success: true, message: '⏸️ Đã tạm dừng bài hát.' };
    } else {
        queue.player.unpause();
        return { success: true, message: '▶️ Đã tiếp tục phát bài hát.' };
    }
}

/**
 * Lấy danh sách hàng đợi (Queue)
 */
function getQueueInfo(guildId) {
    const queue = guildQueues.get(guildId);
    if (!queue || (!queue.current && queue.songs.length === 0)) {
        return null;
    }
    return {
        current: queue.current,
        songs: queue.songs,
        totalSongs: queue.songs.length + (queue.current ? 1 : 0)
    };
}

module.exports = {
    handlePlayCommand,
    handleSkipCommand,
    handleStopCommand,
    handlePauseResumeCommand,
    getQueueInfo,
    initYouTubeCookie
};
