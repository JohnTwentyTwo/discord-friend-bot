require('dotenv').config();
const path = require('path');
const fs = require('fs');
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    ActivityType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    getVoiceConnection
} = require('@discordjs/voice');

const googleTTS = require('google-tts-api');
const db = require('./db');
const { renderTaiXiuResultImage, renderSoiCauChart, generateTaiXiuAnimationGif } = require('./dice_renderer');

// GuildMembers cần bật Privileged Intent trên Discord Developer Portal:
// https://discord.com/developers/applications/1547186053696327811/bot
// -> Bot -> Privileged Gateway Intents -> SERVER MEMBERS INTENT -> ON
// Sau khi bật, uncomment dòng GuildMembers bên dưới và restart bot.
const GUILD_MEMBERS_INTENT_ENABLED = (() => {
    // Thử thêm intent, nếu không được thì fallback
    try {
        // Kiểm tra bằng biến môi trường tùy chọn
        return process.env.GUILD_MEMBERS_INTENT === 'true';
    } catch { return false; }
})();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        ...(GUILD_MEMBERS_INTENT_ENABLED ? [GatewayIntentBits.GuildMembers] : [])
    ],
    // GuildMember + User partials: cần thiết để bắt member rời (partial data)
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

console.log(`[INTENT] GuildMembers intent: ${GUILD_MEMBERS_INTENT_ENABLED ? 'BẬT ✅' : 'TẮT ❌ (chưa enable trên portal)'}`);

// Cache lưu trữ các phòng voice tạm thời (channelId -> ownerId)
const tempVoiceChannels = new Map();

// Cache lưu trữ người tạo ticket (channelId -> userId)
const ticketOwners = new Map();

// Cache lưu trữ thời điểm user vào voice (userId -> timestamp)
const voiceSessions = new Map();

// Cache audio player cho từng guild (guildId -> player)
const guildPlayers = new Map();

// Cache lưu trữ các phòng game cược cộng đồng đang diễn ra (messageId -> room)
const activeGameRooms = new Map();
// Khóa đơn phiên Tài Xỉu (Chỉ cho phép duy nhất 1 phiên hoạt động cùng lúc trên server)
let activeTxSession = null;

// Kênh Nhật Ký Kỷ Luật & Vi Phạm
const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID || '1547482017380175872';

async function sendModLogEmbed(guild, { action, target, moderator, reason, duration, caseId }) {
    try {
        const channel = await guild.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const actionConfig = {
            'WARN': { title: 'CẢNH CÁO THÀNH VIÊN', color: 0xFEE75C, emoji: '⚠️' },
            'TIMEOUT': { title: 'TẠM KHÓA CHAT (TIMEOUT)', color: 0xFFA500, emoji: '⏳' },
            'UNTIMEOUT': { title: 'GỠ KHÓA CHAT (UNTIMEOUT)', color: 0x57F287, emoji: '🟢' },
            'KICK': { title: 'TRỤC XUẤT (KICK)', color: 0xED4245, emoji: '👢' },
            'BAN': { title: 'CẤM VĨNH VIỄN (BAN)', color: 0x992D22, emoji: '🔨' },
            'UNBAN': { title: 'GỠ LỆNH CẤM (UNBAN)', color: 0x5865F2, emoji: '🔓' }
        };

        const config = actionConfig[action] || { title: action, color: 0x5865F2, emoji: '🛡️' };
        const totalLogs = db.getUserWarnings(target.id);

        const embed = new EmbedBuilder()
            .setColor(config.color)
            .setAuthor({
                name: `[NHẬT KÝ KỶ LUẬT] ${config.emoji} ${config.title}`,
                iconURL: target.displayAvatarURL ? target.displayAvatarURL({ dynamic: true }) : null
            })
            .setTitle(`Án phạt: #${caseId || 'CASE-XXXX'}`)
            .addFields(
                { name: '👤 Đối Tượng Vi Phạm', value: `<@${target.id}> (\`${target.tag || target.id}\`)`, inline: true },
                { name: '👮 Người Xử Lý', value: `<@${moderator.id}> (\`${moderator.tag || moderator.id}\`)`, inline: true },
                { name: '⏱️ Mức Độ / Thời Gian', value: duration ? `**${duration}**` : 'Cố định', inline: true },
                { name: '📄 Lý Do', value: `\`\`\`${reason || 'Không có lý do cụ thể'}\`\`\``, inline: false },
                { name: '📜 Tổng Tiền Án', value: `Thành viên này hiện có **${totalLogs.length}** ghi nhận vi phạm trong hệ thống.`, inline: false }
            )
            .setFooter({ text: `ID Đối tượng: ${target.id} • Quản Lý Lê` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (e) {
        console.error('[MOD-LOG] Lỗi khi gửi log:', e.message);
    }
}

// ==========================================
// 1. ĐĂNG KÝ DANH SÁCH SLASH COMMANDS (CHUẨN MXT)
// ==========================================
const commands = [
    // --- NHÓM QUẢN TRỊ SERVER ---
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Gửi bảng điều khiển Ticket hỗ trợ vào kênh này (Chỉ Admin)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('close-ticket')
        .setDescription('Đóng ticket hiện tại'),
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Xóa hàng loạt tin nhắn rác trong kênh (Chỉ Mod/Admin)')
        .addIntegerOption(opt => 
            opt.setName('amount')
                .setDescription('Số lượng tin nhắn cần xóa (1 - 100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Tạm thời cấm chat thành viên vi phạm (Chỉ Mod/Admin)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần xử lý').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('minutes')
                .setDescription('Thời gian cấm chat (phút)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10080))
        .addStringOption(opt => opt.setName('reason').setDescription('Lý do vi phạm').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick thành viên ra khỏi server (Chỉ Admin/Mod)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Lý do').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban vĩnh viễn thành viên khỏi server (Chỉ Admin)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Lý do ban').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
    new SlashCommandBuilder()
        .setName('server-info')
        .setDescription('Xem tổng quan thông tin và thống kê server'),

    // --- NHÓM MINIGAMES & KINH TẾ (ECONOMY) ---
    // (Chỉ Admin mới có quyền nạp/rút tiền vào hệ thống)
    new SlashCommandBuilder()
        .setName('naptien')
        .setDescription('Nạp xu cho thành viên (Chỉ Admin mới có quyền dùng)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên được nạp').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('so_tien')
                .setDescription('Số lượng xu cần nạp')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do nạp (VD: Chuyển khoản, Mua gói, Thưởng event)').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('nap-tien')
        .setDescription('Nạp xu cho thành viên (Chỉ Admin)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên được nạp').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('so_tien')
                .setDescription('Số lượng xu cần nạp')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do nạp (VD: Chuyển khoản, Mua gói, Thưởng event)').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('tru-tien')
        .setDescription('Trừ / Thu hồi xu của thành viên (Chỉ Admin)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên bị trừ').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('so_tien')
                .setDescription('Số lượng xu cần trừ')
                .setRequired(true)
                .setMinValue(1))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do trừ').setRequired(false))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('set-tien')
        .setDescription('Đặt chính xác số dư ví xu cho thành viên (Chỉ Admin)')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('so_tien')
                .setDescription('Số dư xu mới')
                .setRequired(true)
                .setMinValue(0))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Xem số dư ví xu, cấp độ và kinh nghiệm của bạn')
        .addUserOption(opt => opt.setName('user').setDescription('Xem ví của người khác (tùy chọn)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('tx')
        .setDescription('Mở bàn cược Tài Xỉu cộng đồng 45s (Bấm nút & nhập tiền cược)'),
    new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('Mở bàn cược lắc xúc xắc Tài Xỉu 45s (Bấm nút & nhập tiền cược)'),
    new SlashCommandBuilder()
        .setName('bc')
        .setDescription('Mở bàn cược Bầu Cua Tôm Cá cộng đồng 45s (Bấm nút & nhập tiền cược)'),
    new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('Mở bàn cược Bầu Cua Tôm Cá 45s (Bấm nút & nhập tiền cược)'),
    new SlashCommandBuilder()
        .setName('chuyenkhoan')
        .setDescription('Chuyển xu cho bạn bè trong server')
        .addUserOption(opt => opt.setName('user').setDescription('Người nhận xu').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('tien')
                .setDescription('Số xu cần chuyển')
                .setRequired(true)
                .setMinValue(100)),
    new SlashCommandBuilder()
        .setName('top-xu')
        .setDescription('Bảng xếp hạng 10 đại gia giàu nhất server'),

    // --- NHÓM THỐNG KÊ HOẠT ĐỘNG (STATS & LEVEL) ---
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Xem thẻ thông tin cấp độ, tin nhắn chat và giờ voice')
        .addUserOption(opt => opt.setName('user').setDescription('Xem rank của thành viên khác').setRequired(false)),
    new SlashCommandBuilder()
        .setName('top-chat')
        .setDescription('Bảng xếp hạng 10 thành viên chat năng nổ nhất'),
    new SlashCommandBuilder()
        .setName('top-voice')
        .setDescription('Bảng xếp hạng 10 người treo phòng voice lâu nhất'),

    // --- NHÓM GIVEAWAY (PHÁT QUÀ) ---
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Tổ chức sự kiện quay thưởng giveaway may mắn (Chỉ Mod/Admin)')
        .addStringOption(opt => opt.setName('prize').setDescription('Phần thưởng (VD: Discord Nitro, 50k Xu, Role VIP)').setRequired(true))
        .addIntegerOption(opt => opt.setName('minutes').setDescription('Thời gian diễn ra (phút)').setRequired(true).setMinValue(1).setMaxValue(1440))
        .addIntegerOption(opt => opt.setName('winners').setDescription('Số lượng người thắng (mặc định 1)').setRequired(false).setMinValue(1).setMaxValue(10))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    // --- NHÓM TEXT-TO-SPEECH (TTS GIỌNG CHỊ GOOGLE) ---
    new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Đọc nội dung văn bản bằng giọng chị Google vào phòng voice')
        .addStringOption(opt => opt.setName('text').setDescription('Nội dung cần đọc').setRequired(true)),
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('Mời bot tham gia vào kênh voice bạn đang ở'),
    new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Rời khỏi kênh voice hiện tại'),

    // --- NHÓM SOI CẦU & THỐNG KÊ ---
    new SlashCommandBuilder()
        .setName('soicau')
        .setDescription('Xem biểu đồ 2 tầng Thống Kê Phiên Tài Xỉu'),
    new SlashCommandBuilder()
        .setName('thongke')
        .setDescription('Xem biểu đồ 2 tầng Thống Kê Phiên Tài Xỉu'),

    // --- NHÓM KỶ LUẬT & QUẢN TRỊ (MODERATION & MOD LOGS) ---
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Cảnh cáo vi phạm thành viên và ghi vào Nhật Ký Vi Phạm')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần cảnh cáo').setRequired(true))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do cảnh cáo').setRequired(true)),
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Tạm khóa chat / cách ly thành viên vi phạm')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần phạt').setRequired(true))
        .addIntegerOption(opt => opt.setName('thoi_gian').setDescription('Thời hạn timeout').setRequired(true)
            .addChoices(
                { name: '10 Phút', value: 10 },
                { name: '1 Giờ', value: 60 },
                { name: '12 Giờ', value: 720 },
                { name: '1 Ngày (24h)', value: 1440 },
                { name: '3 Ngày', value: 4320 },
                { name: '7 Ngày (1 tuần)', value: 10080 }
            ))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do phạt').setRequired(true)),
    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Gỡ phạt timeout cho thành viên')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần gỡ phạt').setRequired(true))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do gỡ phạt').setRequired(false)),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Trục xuất thành viên ra khỏi server')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần kick').setRequired(true))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do trục xuất').setRequired(true)),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Cấm vĩnh viễn thành viên khỏi server')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần ban').setRequired(true))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do cấm vĩnh viễn').setRequired(true)),
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Gỡ lệnh cấm theo ID người dùng')
        .addStringOption(opt => opt.setName('user_id').setDescription('ID của tài khoản cần gỡ cấm').setRequired(true))
        .addStringOption(opt => opt.setName('ly_do').setDescription('Lý do gỡ cấm').setRequired(false)),
    new SlashCommandBuilder()
        .setName('lich-su-vi-pham')
        .setDescription('Tra cứu hồ sơ vi phạm và các án phạt của một thành viên')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần tra cứu').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
    try {
        console.log('[BOT] Đang đăng ký đầy đủ Slash Commands...');
        
        // 1. Đăng ký toàn cầu (Global Commands)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands.map(c => c.toJSON()) }
        );

        // 2. Đăng ký trực tiếp cho từng Server (Guild Commands) -> Hiện NGAY LẬP TỨC 0 GIÂY
        for (const guild of client.guilds.cache.values()) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
                    { body: commands.map(c => c.toJSON()) }
                );
                console.log(`[BOT] ✅ Đã nạp tức thì ${commands.length} lệnh cho server: "${guild.name}" (${guild.id})!`);
            } catch (guildErr) {
                console.error(`[BOT] Lỗi khi nạp lệnh cho guild ${guild.name}:`, guildErr.message);
            }
        }
        
        console.log(`[BOT] Đã đăng ký thành công ${commands.length} Slash Commands hoàn tất!`);
    } catch (error) {
        console.error('[BOT] Lỗi khi đăng ký commands:', error);
    }
}

// Format số tiền đẹp mắt (VD: 1,000,000)
function formatNumber(num) {
    return (num || 0).toLocaleString('vi-VN');
}

// Format thời gian giây thành định dạng đọc được
function formatVoiceDuration(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} phút`;
}

// Danh mục linh vật Bầu Cua
const BC_ITEMS = [
    { key: 'Bau', label: 'Bầu', icon: '🎃' },
    { key: 'Cua', label: 'Cua', icon: '🦀' },
    { key: 'Tom', label: 'Tôm', icon: '🦐' },
    { key: 'Ca', label: 'Cá', icon: '🐟' },
    { key: 'Ga', label: 'Gà', icon: '🐔' },
    { key: 'Nai', label: 'Nai', icon: '🦌' }
];

const DICE_ICONS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// Render Embed hiển thị phòng cược Tài Xỉu (Đầy đủ 6 lựa chọn)
// Render 4 Embeds hiển thị phòng cược Tài Xỉu chuẩn mxtbot
function renderTaiXiuRoomEmbeds(room) {
    const bets = Array.isArray(room.bets) ? room.bets : Object.values(room.bets || {});

    let totalTai = 0;
    let totalXiu = 0;
    let totalChan = 0;
    let totalLe = 0;
    let totalSoVaTong = 0;

    for (const b of bets) {
        if (b.choice === 'tai') totalTai += b.amount;
        else if (b.choice === 'xiu') totalXiu += b.amount;
        else if (b.choice === 'chan') totalChan += b.amount;
        else if (b.choice === 'le') totalLe += b.amount;
        else if (b.choice === 'so' || b.choice === 'cuoc_so' || b.choice === 'tong' || b.choice === 'cuoc_tong') {
            totalSoVaTong += b.amount;
        }
    }

    const currentJackpot = db.getJackpot();
    const roundId = room.roundId || db.getTxRoundId();
    const history = db.getTxHistory();

    // Embed 1: Tỉ lệ cược (Viền vàng)
    const embed1 = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`TÀI XỈU #${roundId}`)
        .setDescription(
            `▎ __Tỉ lệ cược__\n` +
            `• **Tài - Xỉu:** x1.9\n` +
            `• **Chẵn - Lẻ:** x1.9\n` +
            `• **Cược số:** x1.9/x2.8/x3.6 (Dựa theo số lượng xúc xắc xuất hiện)\n` +
            `• **Cược tổng:**\n` +
            `  ▎ **9 tới 12:** x4.5\n` +
            `  ▎ **3 và 18:** x10.8\n` +
            `  ▎ **Còn lại:** x6.2\n` +
            `• **Nổ hũ:** Nếu kết quả ra bộ ba, hũ sẽ chia cho người cược trúng cửa của bộ ba đó.\n` +
            `• Cược theo mức cược tối thiểu được đưa ra để ăn hũ.\n\n` +
            `▎ Hãy chọn cửa và ghi số tiền cược\n` +
            `Kết thúc trong: <t:${room.expireTimestamp}:R>`
        );

    // Embed 2: Hũ Mcoin (Viền cam)
    const embed2 = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle(`${formatNumber(currentJackpot)} Mcoin`);

    // Embed 3: Tổng cược (Viền Cyan)
    const embed3 = new EmbedBuilder()
        .setColor(0x00BCD4)
        .setTitle('TỔNG CƯỢC')
        .setDescription(
            `• **Tài:** ${formatNumber(totalTai)}\n` +
            `• **Xỉu:** ${formatNumber(totalXiu)}\n` +
            `• **Chẵn:** ${formatNumber(totalChan)}\n` +
            `• **Lẻ:** ${formatNumber(totalLe)}\n` +
            `• **Cược Số/Cược Tổng:** ${formatNumber(totalSoVaTong)}`
        );

    // Embed 4: Soi Cầu Tài Xỉu (Viền tím)
    const list = [...history].slice(-20);
    while (list.length < 20) {
        const s = Math.floor(Math.random() * 16) + 3;
        list.unshift({ total: s, isTai: s >= 11, isChan: s % 2 === 0 });
    }

    const row1 = list.slice(0, 10);
    const row2 = list.slice(10, 20);

    const formatLine = (arr, fn) => {
        const p1 = arr.slice(0, 9).map(fn).join(' ');
        const p2 = arr[9] ? fn(arr[9]) : '';
        return `${p1} | ${p2}`;
    };

    const txR1 = formatLine(row1, x => x.isTai ? '⚫' : '⚪');
    const txR2 = formatLine(row2, x => x.isTai ? '⚫' : '⚪');
    const clR1 = formatLine(row1, x => x.isChan ? '🟣' : '🟡');
    const clR2 = formatLine(row2, x => x.isChan ? '🟣' : '🟡');

    const embed4 = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('SOI CẦU TÀI XỈU')
        .setDescription(`${txR1}\n${txR2}\n—\n${clR1}\n${clR2}`);

    return [embed1, embed2, embed3, embed4];
}

// Tạo components đầy đủ cho phòng cược Tài Xỉu (Chuẩn giao diện mxtbot: 1 Dropdown chọn cửa)
function createTaiXiuComponents() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_room_tx_choice')
        .setPlaceholder('⚡ Chọn cửa và đặt cược tại đây!')
        .addOptions([
            {
                label: 'Tài',
                value: 'tai',
                emoji: '⚫'
            },
            {
                label: 'Xỉu',
                value: 'xiu',
                emoji: '⚪'
            },
            {
                label: 'Chẵn',
                value: 'chan',
                emoji: '🟣'
            },
            {
                label: 'Lẻ',
                value: 'le',
                emoji: '🟡'
            },
            {
                label: 'Cược Số',
                value: 'cuoc_so',
                emoji: '🎲'
            },
            {
                label: 'Cược Tổng',
                value: 'cuoc_tong',
                emoji: '❓'
            }
        ]);

    const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
    const btnSoiCau = new ButtonBuilder()
        .setCustomId('btn_view_soicau')
        .setLabel('📈 Xem Thống Kê Phiên')
        .setStyle(ButtonStyle.Secondary);
    const rowBtn = new ActionRowBuilder().addComponents(btnSoiCau);

    return [rowMenu, rowBtn];
}

// Render Embed hiển thị phòng cược Bầu Cua
function renderBauCuaRoomEmbed(room) {
    let desc = `👑 **Chủ bàn:** <@${room.creatorId}>\n` +
               `⏰ **Thời gian chốt cược:** <t:${room.expireTimestamp}:R> (<t:${room.expireTimestamp}:T>)\n\n` +
               `📋 **DANH SÁCH THÀNH VIÊN VÀO CƯỢC:**\n`;

    BC_ITEMS.forEach(item => {
        const bettors = Object.entries(room.bets).filter(([_, b]) => b.choice === item.key);
        const totalCoins = bettors.reduce((sum, [_, b]) => sum + b.amount, 0);
        const listStr = bettors.length > 0 ? bettors.map(([id, b]) => `<@${id}> (\`${formatNumber(b.amount)}\` xu)`).join(', ') : '*Chưa có ai đặt*';
        desc += `${item.icon} **${item.label}** (\`${bettors.length}\` người - \`${formatNumber(totalCoins)}\` xu): ${listStr}\n`;
    });

    desc += `\n👉 *Bấm nút linh vật bên dưới ➔ Nhập số tiền cược vào bảng form để chốt!*`;

    return new EmbedBuilder()
        .setTitle('🎲 BÀN CƯỢC BẦU CUA TÔM CÁ - CỘNG ĐỒNG')
        .setDescription(desc)
        .setColor(0xE67E22)
        .setFooter({ text: 'Trúng 1 con: x2 • Trúng 2 con: x3 • Trúng 3 con: x4' })
        .setTimestamp();
}

// Kết thúc phòng Tài Xỉu và reveal kết quả
async function finishTaiXiuRoom(messageId, channel) {
    const room = activeGameRooms.get(messageId);
    if (!room) {
        if (activeTxSession && activeTxSession.messageId === messageId) {
            activeTxSession = null;
        }
        return;
    }

    // Đánh dấu trạng thái đang lắc kết quả (không nhận cược mới, không mở phiên mới)
    room.status = 'rolling';
    if (activeTxSession && activeTxSession.messageId === messageId) {
        activeTxSession.status = 'rolling';
    }

    try {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
            console.error('[FINISH TAIXIU] Không tìm thấy tin nhắn bàn cược:', messageId);
            db.nextTxRoundId();
            activeGameRooms.delete(messageId);
            if (activeTxSession && activeTxSession.messageId === messageId) {
                activeTxSession = null;
            }
            return;
        }

        const bets = Array.isArray(room.bets) ? room.bets : Object.values(room.bets || {});
        const currentRoundId = room.roundId || db.getTxRoundId();

        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const dice3 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2 + dice3;

        // BƯỚC 1: ANIMATION XÓC VÀ MỞ BÁT (Liền mạch 1 file chuẩn xác 100% xúc xắc thật)
        let shakingAttachment;
        try {
            const animBuf = generateTaiXiuAnimationGif(dice1, dice2, dice3);
            shakingAttachment = new AttachmentBuilder(animBuf, { name: 'reveal.gif' });
        } catch (animErr) {
            console.error('[ANIMATION GEN ERROR]', animErr);
            shakingAttachment = new AttachmentBuilder(path.join(__dirname, 'shaking_bowl.gif'), { name: 'reveal.gif' });
        }

        const shakingEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setDescription(`🎲 Đang xóc bát và mở kết quả phiên **#${currentRoundId}**...`)
            .setImage('attachment://reveal.gif');

        await message.edit({
            embeds: [shakingEmbed],
            files: [shakingAttachment],
            components: []
        });

        setTimeout(async () => {
            try {
                // Điều kiện nổ hũ: Bộ 3 xúc xắc giống nhau (1-1-1 đến 6-6-6)
                const isJackpot = (dice1 === dice2 && dice2 === dice3);

                const isTai = (total >= 11 && total <= 17);
                const isXiu = (total >= 4 && total <= 10);
                const isChan = (total % 2 === 0);
                const isLe = (total % 2 !== 0);

                const totalBetsAll = bets.reduce((sum, b) => sum + b.amount, 0);
                let currentJackpot = db.getJackpot();
                let jackpotWonTotal = 0;
                let jackpotBonusPerWinner = 0;

                const winners = [];
                const losers = [];

                for (const bet of bets) {
                    let isWin = false;
                    let multiplier = 1.9;

                    if (bet.choice === 'tai') {
                        if (isTai) { isWin = true; multiplier = 1.9; }
                    } else if (bet.choice === 'xiu') {
                        if (isXiu) { isWin = true; multiplier = 1.9; }
                    } else if (bet.choice === 'chan') {
                        if (isChan) { isWin = true; multiplier = 1.9; }
                    } else if (bet.choice === 'le') {
                        if (isLe) { isWin = true; multiplier = 1.9; }
                    } else if (bet.choice === 'so' || bet.choice === 'cuoc_so') {
                        const count = [dice1, dice2, dice3].filter(d => d === bet.diceValue).length;
                        if (count === 1) { isWin = true; multiplier = 1.9; }
                        else if (count === 2) { isWin = true; multiplier = 2.8; }
                        else if (count === 3) { isWin = true; multiplier = 3.6; }
                    } else if (bet.choice === 'tong' || bet.choice === 'cuoc_tong') {
                        if (total === bet.targetTotal) {
                            isWin = true;
                            if (total >= 9 && total <= 12) multiplier = 4.5;
                            else if (total === 3 || total === 18) multiplier = 10.8;
                            else multiplier = 6.2;
                        }
                    }

                    bet.isWin = isWin;
                    bet.multiplier = multiplier;
                    if (isWin) {
                        winners.push(bet);
                    } else {
                        losers.push(bet);
                    }
                }

                // Xử lý cơ chế Nổ Hũ
                const qualifiedJackpotWinners = [];
                if (isJackpot) {
                    for (const w of winners) {
                        if (w.amount >= 4000000) {
                            qualifiedJackpotWinners.push(w);
                        }
                    }

                    if (qualifiedJackpotWinners.length > 0) {
                        jackpotWonTotal = currentJackpot;
                        jackpotBonusPerWinner = Math.floor(jackpotWonTotal / qualifiedJackpotWinners.length);

                        for (const qw of qualifiedJackpotWinners) {
                            qw.jackpotBonus = jackpotBonusPerWinner;
                        }
                        // Reset hũ về 50,000,000 Mcoin
                        db.resetJackpot(50000000);
                    } else {
                        db.addJackpot(Math.max(100000, Math.floor(totalBetsAll * 0.1)));
                    }
                } else {
                    db.addJackpot(Math.max(10000, Math.floor(totalBetsAll * 0.05)));
                }

                // Trả thưởng vào ví người dùng
                for (const w of winners) {
                    const basePayout = Math.floor(w.amount * w.multiplier);
                    const bonus = w.jackpotBonus || 0;
                    const totalPayout = basePayout + bonus;
                    w.payout = totalPayout;
                    db.updateUser(w.userId, d => { d.coins += totalPayout; });
                }

                // BƯỚC 2: TRẢ KẾT QUẢ (Chuẩn 3 Embeds)
                const DICE_EMOJIS = {
                    1: '<:mxt_dice_1:1547273008450764860>',
                    2: '<:mxt_dice_2:1547273010874949794>',
                    3: '<:mxt_dice_3:1547273013009973318>',
                    4: '<:mxt_dice_4:1547273017535504394>',
                    5: '<:mxt_dice_5:1547273021625208922>',
                    6: '<:mxt_dice_6:1547273023948587040>'
                };
                const diceStr = `${DICE_EMOJIS[dice1] || '🎲'}  ${DICE_EMOJIS[dice2] || '🎲'}  ${DICE_EMOJIS[dice3] || '🎲'}`;

                // Embed 1: Kết quả
                const embedResult1 = new EmbedBuilder()
                    .setColor(isJackpot ? 0xF1C40F : 0xED4245)
                    .setTitle(`KẾT QUẢ TÀI XỈU #${currentRoundId}`)
                    .setDescription(
                        `${diceStr}\n\n` +
                        `➮ Kết quả: **${dice1}** + **${dice2}** + **${dice3}** = **${total}**\n` +
                        `▎ Chung cuộc: **${isTai ? 'TÀI' : 'XỈU'} - ${isChan ? 'CHẴN' : 'LẺ'}**` +
                        (isJackpot ? `\n\n💥💥 **NỔ HŨ TOÀN SÒNG BẠC! BỘ BA ${dice1}-${dice2}-${dice3}** 💥💥` : '')
                    );

                // Embed 2: Hũ Tài Xỉu
                const embedResult2 = new EmbedBuilder()
                    .setColor(0xE67E22)
                    .setTitle('HŨ TÀI XỈU')
                    .setDescription(`**${formatNumber(db.getJackpot())} Mcoin**`);

                // Embed 3: Danh sách tham gia
                let betListDesc = '';
                if (bets.length > 0) {
                    const lines = [];
                    for (const bet of bets) {
                        let name = bet.userId;
                        try {
                            const member = channel.guild ? channel.guild.members.cache.get(bet.userId) : null;
                            name = member ? member.displayName : `<@${bet.userId}>`;
                        } catch {
                            name = `<@${bet.userId}>`;
                        }

                        let choiceLabel = '';
                        if (bet.choice === 'tai') choiceLabel = 'Tài';
                        else if (bet.choice === 'xiu') choiceLabel = 'Xỉu';
                        else if (bet.choice === 'chan') choiceLabel = 'Chẵn';
                        else if (bet.choice === 'le') choiceLabel = 'Lẻ';
                        else if (bet.choice === 'so' || bet.choice === 'cuoc_so') choiceLabel = `Số ${bet.diceValue}`;
                        else if (bet.choice === 'tong' || bet.choice === 'cuoc_tong') choiceLabel = `Tổng ${bet.targetTotal}`;

                        if (bet.isWin) {
                            const totalWon = bet.payout || (Math.floor(bet.amount * bet.multiplier) + (bet.jackpotBonus || 0));
                            lines.push(`**${name}** | ${choiceLabel}: **${formatNumber(bet.amount)}** | ↗️ (+**${formatNumber(totalWon)} Mcoin**)`);
                        } else {
                            lines.push(`**${name}** | ${choiceLabel}: **${formatNumber(bet.amount)}** | ❌`);
                        }
                    }
                    betListDesc = lines.join('\n');
                } else {
                    betListDesc = '*Không có ai tham gia ván này.*';
                }

                const embedResult3 = new EmbedBuilder()
                    .setColor(0xE91E63)
                    .setTitle('DANH SÁCH THAM GIA')
                    .setDescription(betListDesc);

                await message.edit({
                    embeds: [embedResult1, embedResult2, embedResult3],
                    files: [],
                    components: []
                });

                if (isJackpot && qualifiedJackpotWinners.length > 0) {
                    const winnerMentions = qualifiedJackpotWinners.map(w => `<@${w.userId}>`).join(', ');
                    await channel.send(`🚨🚨 **NỔ HŨ! NỔ HŨ!** Xin chúc mừng ${winnerMentions} đã nổ hũ thành công bộ ba **${dice1}-${dice2}-${dice3}** và ẵm trọn giải thưởng Hũ Vàng **+${formatNumber(jackpotWonTotal)} Mcoin**! 🚨🚨`);
                }

                // Lưu kết quả vào lịch sử Soi Cầu
                db.addTxHistory({
                    roundId: currentRoundId,
                    total,
                    isTai: total >= 11,
                    isChan: total % 2 === 0,
                    d1: dice1,
                    d2: dice2,
                    d3: dice3
                });

                // TĂNG SỐ PHIÊN LÊN 1 ĐƠN VỊ CHO PHIÊN KẾ TIẾP
                const nextRound = db.nextTxRoundId();
                console.log(`[TAI XIU] ✅ Hoàn tất phiên #${currentRoundId}. Phiên tiếp theo sẽ là #${nextRound}.`);
            } catch (err) {
                console.error('[FINISH TAIXIU TIMEOUT ERROR]', err);
                db.nextTxRoundId();
            } finally {
                // GIẢI PHÓNG KHÓA PHIÊN: Hết phiên mới cho phép mở phiên tiếp theo
                activeGameRooms.delete(messageId);
                if (activeTxSession && activeTxSession.messageId === messageId) {
                    activeTxSession.status = 'finished';
                    activeTxSession = null;
                }
                console.log('[TAI XIU] 🔓 Đã giải phóng phiên Tài Xỉu, sẵn sàng cho phiên tiếp theo.');
            }
        }, 9500);
    } catch (e) {
        console.error('[FINISH TAIXIU CATCH]', e);
        db.nextTxRoundId();
        activeGameRooms.delete(messageId);
        if (activeTxSession && activeTxSession.messageId === messageId) {
            activeTxSession = null;
        }
    }
}

// Kết thúc phòng Bầu Cua và reveal kết quả
async function finishBauCuaRoom(messageId, channel) {
    const room = activeGameRooms.get(messageId);
    if (!room) return;
    activeGameRooms.delete(messageId);

    try {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) return;

        const bettors = Object.entries(room.bets);
        if (bettors.length === 0) {
            const cancelEmbed = new EmbedBuilder()
                .setTitle('⏰ HẾT GIỜ ĐẶT CƯỢC BẦU CUA')
                .setDescription(`Bàn cược Bầu Cua do <@${room.creatorId}> mở đã kết thúc.\n\n*Không có thành viên nào chốt cược nên bàn cược đã bị hủy!*`)
                .setColor(0x7F8C8D)
                .setTimestamp();
            return await message.edit({ embeds: [cancelEmbed], components: [] });
        }

        // 1. Shaking Bầu Cua trong 1.8s
        const shakingEmbed = new EmbedBuilder()
            .setTitle('🎲 HẾT GIỜ CƯỢC! ĐANG MỞ BÁT BẦU CUA... ⏳')
            .setDescription(
                `⏰ **Đã đóng cổng cược!** Tổng cộng **${bettors.length} thành viên** tham gia.\n` +
                `🎲 *Đang mở đĩa Bầu Cua... Reveal đáp án sau 2 giây!*`
            )
            .setImage('https://media.giphy.com/media/26uf2JHNV0Tq3NPYs/giphy.gif')
            .setColor(0xE67E22);
        await message.edit({ embeds: [shakingEmbed], components: [] });

        setTimeout(async () => {
            try {
                const roll1 = BC_ITEMS[Math.floor(Math.random() * BC_ITEMS.length)];
                const roll2 = BC_ITEMS[Math.floor(Math.random() * BC_ITEMS.length)];
                const roll3 = BC_ITEMS[Math.floor(Math.random() * BC_ITEMS.length)];
                const rolled = [roll1, roll2, roll3];

                const winners = [];
                const losers = [];

                for (const [userId, bet] of bettors) {
                    const matchedCount = rolled.filter(r => r.key === bet.choice).length;
                    const itemInfo = BC_ITEMS.find(i => i.key === bet.choice);
                    if (matchedCount > 0) {
                        const payout = bet.amount + (bet.amount * matchedCount);
                        db.updateUser(userId, d => { d.coins += payout; });
                        winners.push({ userId, itemInfo, matchedCount, payout, betAmount: bet.amount });
                    } else {
                        losers.push({ userId, itemInfo, betAmount: bet.amount });
                    }
                }

                let resultDesc = `🎲 **Mở bát ra:**\n` +
                                 `▸ ${roll1.icon} **${roll1.label}** | ${roll2.icon} **${roll2.label}** | ${roll3.icon} **${roll3.label}**\n\n`;

                if (winners.length > 0) {
                    resultDesc += `🎉 **CHIẾN THẮNG TRÚNG LINH VẬT:**\n` +
                        winners.map(w => `▸ <@${w.userId}> cược ${w.itemInfo.icon} **${w.itemInfo.label}** (\`${formatNumber(w.betAmount)}\` xu) trúng \`${w.matchedCount}\` con ➔ Nhận **+${formatNumber(w.payout)} xu**`).join('\n') + '\n\n';
                } else {
                    resultDesc += `🏆 **CHIẾN THẮNG:** *Không có ai đoán trúng linh vật nào!*\n\n`;
                }

                if (losers.length > 0) {
                    resultDesc += `😢 **THUA CUỘC:**\n` +
                        losers.map(l => `▸ <@${l.userId}> mất \`-${formatNumber(l.betAmount)}\` xu (Cược ${l.itemInfo?.icon || ''} ${l.itemInfo?.label || ''})`).join('\n') + '\n\n';
                }

                const resultEmbed = new EmbedBuilder()
                    .setTitle('🎲 KẾT QUẢ BÀN CƯỢC BẦU CUA TÔM CÁ')
                    .setDescription(resultDesc)
                    .setImage(winners.length > 0 ? 'https://media.giphy.com/media/uyWTOgNGGWfks/giphy.gif' : 'https://media.giphy.com/media/NTur7XlVDUdqM/giphy.gif')
                    .setColor(winners.length > 0 ? 0x2ECC71 : 0xE67E22)
                    .setFooter({ text: 'Bầu Cua Tôm Cá • Chúc bạn may mắn phát tài' })
                    .setTimestamp();

                await message.edit({ embeds: [resultEmbed], components: [] });

                if (winners.length > 0) {
                    const winnerMentions = winners.map(w => `<@${w.userId}>`).join(', ');
                    await channel.send(`🎉 Chúc mừng ${winnerMentions} đã đoán trúng linh vật Bầu Cua may mắn!`);
                }
            } catch (err) {
                console.error('[FINISH BAUCUA ERROR]', err);
            }
        }, 1500);
    } catch (e) {
        console.error('[FINISH BAUCUA CATCH]', e);
    }
}

// 2. Sự kiện khi Bot sẵn sàng
client.once('ready', async () => {
    console.log(`[BOT] Đã đăng nhập với tư cách: ${client.user.tag}`);
    await registerCommands();
    client.user.setPresence({
        activities: [{
            name: 'custom',
            type: ActivityType.Custom,
            state: 'Bảo vệ, dắt xe, trông nhà'
        }],
        status: 'online'
    });

    // Vòng lặp kiểm tra Giveaway hết hạn mỗi 5 giây
    setInterval(checkGiveaways, 5000);
});

// Hàm kiểm tra và công bố kết quả Giveaway
async function checkGiveaways() {
    const active = db.getAllActiveGiveaways();
    const now = Date.now();

    for (const [messageId, g] of Object.entries(active)) {
        if (now >= g.endTime) {
            try {
                const channel = await client.channels.fetch(g.channelId).catch(() => null);
                if (!channel) {
                    db.deleteGiveaway(messageId);
                    continue;
                }

                const msg = await channel.messages.fetch(messageId).catch(() => null);
                const participants = g.participants || [];

                if (participants.length === 0) {
                    const failEmbed = new EmbedBuilder()
                        .setTitle('🎉 GIVEAWAY ĐÃ KẾT THÚC 🎉')
                        .setDescription(`**Phần thưởng:** ${g.prize}\n\n*Rất tiếc, không có ai tham gia sự kiện này!*`)
                        .setColor(0x95A5A6)
                        .setFooter({ text: 'Giveaway đã kết thúc' })
                        .setTimestamp();

                    if (msg) await msg.edit({ embeds: [failEmbed], components: [] });
                } else {
                    // Trộn ngẫu nhiên chọn người thắng
                    const shuffled = [...participants].sort(() => 0.5 - Math.random());
                    const winners = shuffled.slice(0, Math.min(g.winnersCount, participants.length));
                    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

                    const winEmbed = new EmbedBuilder()
                        .setTitle('🎉 CHÚC MỪNG CHIẾN THẮNG GIVEAWAY! 🎉')
                        .setDescription(
                            `**Phần thưởng:** 🎁 **${g.prize}**\n\n` +
                            `👑 **Người trúng thưởng:** ${winnerMentions}\n` +
                            `👥 **Tổng số người tham gia:** \`${participants.length}\` người\n\n` +
                            `*Vui lòng liên hệ Ban Quản Trị để nhận thưởng!*`
                        )
                        .setColor(0xF1C40F)
                        .setFooter({ text: 'Giveaway chính thức khép lại' })
                        .setTimestamp();

                    if (msg) await msg.edit({ embeds: [winEmbed], components: [] });
                    await channel.send(`🎉 Chúc mừng ${winnerMentions} đã trúng thưởng **${g.prize}**!`);
                }
            } catch (e) {
                console.error('[GIVEAWAY ERROR]', e);
            }
            db.deleteGiveaway(messageId);
        }
    }
}

// 3. Auto-Role khi Member mới vào
client.on('guildMemberAdd', async (member) => {
    try {
        const memberRole = member.guild.roles.cache.find(r => 
            r.name.toLowerCase() === 'member' || 
            r.name.toLowerCase() === 'thành viên' ||
            r.name.toLowerCase().includes('member')
        );
        if (memberRole) {
            await member.roles.add(memberRole);
            console.log(`[AUTO-ROLE] Đã gán role ${memberRole.name} cho ${member.user.tag}`);
        }
    } catch (err) {
        console.error('[AUTO-ROLE] Lỗi khi gán role:', err);
    }
});

// Helper đọc TTS qua Voice
async function speakTTS(voiceChannel, text) {
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    const url = googleTTS.getAudioUrl(text, {
        lang: 'vi',
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
    });

    let player = guildPlayers.get(voiceChannel.guild.id);
    if (!player) {
        player = createAudioPlayer();
        guildPlayers.set(voiceChannel.guild.id, player);
    }

    const resource = createAudioResource(url);
    player.play(resource);
    connection.subscribe(player);
}

// 4. Xử lý Interaction (Slash Commands & Buttons)
client.on('interactionCreate', async (interaction) => {
    try {
        // --- XỬ LÝ SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            const { commandName, user, guild, channel } = interaction;

            // ==========================================
            // LỆNH MINIGAME & KINH TẾ (ECONOMY)
            // ==========================================

            // ==========================================
            // LỆNH QUẢN TRỊ KINH TẾ (CHỈ DÀNH CHO ADMIN)
            // ==========================================

            // ==========================================
            // LỆNH KỶ LUẬT & BAN QUẢN TRỊ (MODERATION)
            // ==========================================
            if (['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'lich-su-vi-pham'].includes(commandName)) {
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
                    interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
                    interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
                    interaction.guild.ownerId === user.id;

                if (!isAdmin && commandName !== 'lich-su-vi-pham') {
                    return interaction.reply({ content: '✕ Bạn không có quyền hạn Quản trị viên / Điều hành viên để sử dụng lệnh kỷ luật này!', ephemeral: true });
                }

                // 1. /warn
                if (commandName === 'warn') {
                    const targetUser = interaction.options.getUser('user');
                    const reason = interaction.options.getString('ly_do');

                    if (targetUser.bot) {
                        return interaction.reply({ content: '✕ Không thể xử phạt tài khoản Bot!', ephemeral: true });
                    }

                    const logEntry = db.addModLog({
                        action: 'WARN',
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        moderatorId: user.id,
                        moderatorTag: user.tag,
                        reason: reason
                    });

                    await targetUser.send(`⚠️ **CẢNH CÁO VI PHẠM TỪ SERVER [${guild.name}]:**\n• **Lý do:** ${reason}\n• **Người xử lý:** <@${user.id}>\n*Vui lòng đọc lại nội quy server để tránh bị kỷ luật nặng hơn!*`).catch(() => null);

                    await sendModLogEmbed(guild, {
                        action: 'WARN',
                        target: targetUser,
                        moderator: user,
                        reason: reason,
                        caseId: logEntry.id
                    });

                    const totalWarns = db.getUserWarnings(targetUser.id).length;
                    return interaction.reply({
                        content: `✅ **Đã ghi nhận Cảnh cáo thành viên** <@${targetUser.id}>!\n• **Mã án phạt:** \`#${logEntry.id}\`\n• **Lý do:** ${reason}\n• **Tổng số vi phạm hiện tại:** **${totalWarns}** lần.\n*(Đã lưu vào <#${MOD_LOG_CHANNEL_ID}>)*`
                    });
                }

                // 2. /timeout
                if (commandName === 'timeout') {
                    const targetUser = interaction.options.getUser('user');
                    const durationMins = interaction.options.getInteger('thoi_gian');
                    const reason = interaction.options.getString('ly_do');

                    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
                    if (!targetMember) {
                        return interaction.reply({ content: '✕ Không tìm thấy thành viên này trong server!', ephemeral: true });
                    }
                    if (targetMember.permissions.has(PermissionsBitField.Flags.Administrator) || targetUser.id === guild.ownerId) {
                        return interaction.reply({ content: '✕ Không thể timeout Quản trị viên hoặc Chủ server!', ephemeral: true });
                    }

                    const ms = durationMins * 60 * 1000;
                    await targetMember.timeout(ms, `${reason} (Bởi ${user.tag})`);

                    const logEntry = db.addModLog({
                        action: 'TIMEOUT',
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        moderatorId: user.id,
                        moderatorTag: user.tag,
                        reason: reason,
                        durationMinutes: durationMins
                    });

                    let durationText = `${durationMins} phút`;
                    if (durationMins >= 1440) durationText = `${Math.floor(durationMins / 1440)} ngày`;
                    else if (durationMins >= 60) durationText = `${Math.floor(durationMins / 60)} giờ`;

                    await targetUser.send(`⏳ **BẠN ĐÃ BỊ TẠM KHÓA CHAT (TIMEOUT) TẠI SERVER [${guild.name}]:**\n• **Thời hạn:** ${durationText}\n• **Lý do:** ${reason}\n• **Người xử lý:** <@${user.id}>`).catch(() => null);

                    await sendModLogEmbed(guild, {
                        action: 'TIMEOUT',
                        target: targetUser,
                        moderator: user,
                        reason: reason,
                        duration: durationText,
                        caseId: logEntry.id
                    });

                    return interaction.reply({
                        content: `⏳ **Đã cách ly / timeout thành viên** <@${targetUser.id}> trong **${durationText}**!\n• **Mã án phạt:** \`#${logEntry.id}\`\n• **Lý do:** ${reason}\n*(Đã lưu vào <#${MOD_LOG_CHANNEL_ID}>)*`
                    });
                }

                // 3. /untimeout
                if (commandName === 'untimeout') {
                    const targetUser = interaction.options.getUser('user');
                    const reason = interaction.options.getString('ly_do') || 'Gỡ phạt trước hạn';

                    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
                    if (!targetMember) {
                        return interaction.reply({ content: '✕ Không tìm thấy thành viên này trong server!', ephemeral: true });
                    }

                    await targetMember.timeout(null, reason);

                    const logEntry = db.addModLog({
                        action: 'UNTIMEOUT',
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        moderatorId: user.id,
                        moderatorTag: user.tag,
                        reason: reason
                    });

                    await sendModLogEmbed(guild, {
                        action: 'UNTIMEOUT',
                        target: targetUser,
                        moderator: user,
                        reason: reason,
                        caseId: logEntry.id
                    });

                    return interaction.reply({ content: `🟢 **Đã gỡ khóa chat (untimeout) cho** <@${targetUser.id}>! Lý do: ${reason}` });
                }

                // 4. /kick
                if (commandName === 'kick') {
                    const targetUser = interaction.options.getUser('user');
                    const reason = interaction.options.getString('ly_do');

                    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
                    if (!targetMember) {
                        return interaction.reply({ content: '✕ Không tìm thấy thành viên này trong server!', ephemeral: true });
                    }
                    if (!targetMember.kickable) {
                        return interaction.reply({ content: '✕ Bot không đủ quyền để trục xuất thành viên này (vai trò của họ cao hơn bot)!', ephemeral: true });
                    }

                    await targetUser.send(`👢 **BẠN ĐÃ BỊ TRỤC XUẤT (KICK) KHỎI SERVER [${guild.name}]:**\n• **Lý do:** ${reason}\n• **Người xử lý:** <@${user.id}>`).catch(() => null);
                    await targetMember.kick(`${reason} (Bởi ${user.tag})`);

                    const logEntry = db.addModLog({
                        action: 'KICK',
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        moderatorId: user.id,
                        moderatorTag: user.tag,
                        reason: reason
                    });

                    await sendModLogEmbed(guild, {
                        action: 'KICK',
                        target: targetUser,
                        moderator: user,
                        reason: reason,
                        caseId: logEntry.id
                    });

                    return interaction.reply({
                        content: `👢 **Đã trục xuất (Kick)** <@${targetUser.id}> khỏi server!\n• **Mã án phạt:** \`#${logEntry.id}\`\n• **Lý do:** ${reason}\n*(Đã lưu vào <#${MOD_LOG_CHANNEL_ID}>)*`
                    });
                }

                // 5. /ban
                if (commandName === 'ban') {
                    const targetUser = interaction.options.getUser('user');
                    const reason = interaction.options.getString('ly_do');

                    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
                    if (targetMember && !targetMember.bannable) {
                        return interaction.reply({ content: '✕ Bot không đủ quyền để cấm thành viên này (vai trò của họ cao hơn bot)!', ephemeral: true });
                    }

                    await targetUser.send(`🔨 **BẠN ĐÃ BỊ CẤM VĨNH VIỄN (BAN) KHỎI SERVER [${guild.name}]:**\n• **Lý do:** ${reason}\n• **Người xử lý:** <@${user.id}>`).catch(() => null);
                    await guild.bans.create(targetUser.id, { reason: `${reason} (Bởi ${user.tag})` });

                    const logEntry = db.addModLog({
                        action: 'BAN',
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        moderatorId: user.id,
                        moderatorTag: user.tag,
                        reason: reason
                    });

                    await sendModLogEmbed(guild, {
                        action: 'BAN',
                        target: targetUser,
                        moderator: user,
                        reason: reason,
                        caseId: logEntry.id
                    });

                    return interaction.reply({
                        content: `🔨 **Đã cấm vĩnh viễn (Ban)** <@${targetUser.id}> khỏi server!\n• **Mã án phạt:** \`#${logEntry.id}\`\n• **Lý do:** ${reason}\n*(Đã lưu vào <#${MOD_LOG_CHANNEL_ID}>)*`
                    });
                }

                // 6. /unban
                if (commandName === 'unban') {
                    const targetId = interaction.options.getString('user_id');
                    const reason = interaction.options.getString('ly_do') || 'Ân xá / Gỡ cấm';

                    try {
                        const banInfo = await guild.bans.fetch(targetId);
                        await guild.bans.remove(targetId, `${reason} (Bởi ${user.tag})`);

                        const logEntry = db.addModLog({
                            action: 'UNBAN',
                            targetId: targetId,
                            targetTag: banInfo.user.tag,
                            moderatorId: user.id,
                            moderatorTag: user.tag,
                            reason: reason
                        });

                        await sendModLogEmbed(guild, {
                            action: 'UNBAN',
                            target: banInfo.user,
                            moderator: user,
                            reason: reason,
                            caseId: logEntry.id
                        });

                        return interaction.reply({ content: `🔓 **Đã gỡ cấm (unban) thành công cho tài khoản:** **${banInfo.user.tag}** (\`${targetId}\`). Lý do: ${reason}` });
                    } catch (e) {
                        return interaction.reply({ content: `✕ Không tìm thấy lệnh cấm nào đối với ID: \`${targetId}\`!`, ephemeral: true });
                    }
                }

                // 7. /lich-su-vi-pham
                if (commandName === 'lich-su-vi-pham') {
                    const targetUser = interaction.options.getUser('user');
                    const records = db.getUserWarnings(targetUser.id);

                    const historyEmbed = new EmbedBuilder()
                        .setColor(records.length > 0 ? 0xED4245 : 0x57F287)
                        .setAuthor({
                            name: `Hồ Sơ Kỷ Luật — ${targetUser.tag}`,
                            iconURL: targetUser.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true }) : null
                        })
                        .setTitle(`📜 Tiền Án Tiền Sự Của Thành Viên`)
                        .setDescription(
                            `• **Đối tượng:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
                            `• **Tổng số lần bị xử phạt:** **${records.length}** lần\n` +
                            (records.length === 0 ? '\n✨ *Thành viên này có lý lịch hoàn toàn trong sạch, chưa từng vi phạm nội quy.*' : '')
                        );

                    if (records.length > 0) {
                        const actionEmoji = {
                            'WARN': '⚠️ Cảnh cáo',
                            'TIMEOUT': '⏳ Khóa chat',
                            'UNTIMEOUT': '🟢 Gỡ khóa',
                            'KICK': '👢 Trục xuất',
                            'BAN': '🔨 Cấm vĩnh viễn',
                            'UNBAN': '🔓 Gỡ cấm'
                        };
                        const recent = records.slice(-8).reverse();
                        recent.forEach(r => {
                            const timeStr = `<t:${Math.floor(r.timestamp / 1000)}:f>`;
                            historyEmbed.addFields({
                                name: `${actionEmoji[r.action] || r.action} • #${r.id}`,
                                value: `• **Thời điểm:** ${timeStr}\n• **Người phạt:** <@${r.moderatorId}>\n• **Lý do:** ${r.reason}`
                            });
                        });
                    }

                    historyEmbed.setFooter({ text: 'Hệ thống Quản Lý Kỷ Luật • Quản Lý Lê' }).setTimestamp();
                    return interaction.reply({ embeds: [historyEmbed] });
                }
            }

            // Lệnh: /nap-tien hoặc /naptien (Chỉ Admin)
            if (commandName === 'nap-tien' || commandName === 'naptien') {
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.guild.ownerId === user.id;
                if (!isAdmin) {
                    return interaction.reply({ content: '✕ Bạn không có quyền sử dụng lệnh này! Chỉ Quản trị viên (Admin) mới được nạp xu.', ephemeral: true });
                }

                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('so_tien');
                const reason = interaction.options.getString('ly_do') || 'Nạp tiền qua Ban Quản Trị';

                const beforeUser = db.getUser(target.id);
                const beforeCoins = beforeUser.coins;

                db.updateUser(target.id, data => {
                    data.coins += amount;
                });

                const afterUser = db.getUser(target.id);

                const embed = new EmbedBuilder()
                    .setTitle('💳 XÁC NHẬN NẠP XU THÀNH CÔNG')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: '👤 Người nhận', value: `<@${target.id}>`, inline: true },
                        { name: '👑 Admin duyệt', value: `<@${user.id}>`, inline: true },
                        { name: '💰 Số xu nạp', value: `\`+${formatNumber(amount)}\` xu`, inline: true },
                        { name: '📊 Số dư trước', value: `\`${formatNumber(beforeCoins)}\` xu`, inline: true },
                        { name: '✨ Số dư hiện tại', value: `\`${formatNumber(afterUser.coins)}\` xu`, inline: true },
                        { name: '📝 Lý do', value: `*${reason}*`, inline: false }
                    )
                    .setFooter({ text: 'Hệ thống Ngân hàng Server • Minh bạch & An toàn' })
                    .setTimestamp();

                return interaction.reply({ content: `✅ Đã nạp thành công **+${formatNumber(amount)} xu** cho <@${target.id}>!`, embeds: [embed] });
            }

            // Lệnh: /tru-tien
            if (commandName === 'tru-tien') {
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.guild.ownerId === user.id;
                if (!isAdmin) {
                    return interaction.reply({ content: '✕ Chỉ Quản trị viên mới có quyền trừ xu!', ephemeral: true });
                }

                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('so_tien');
                const reason = interaction.options.getString('ly_do') || 'Thu hồi / Xử phạt từ Admin';

                const beforeUser = db.getUser(target.id);
                const beforeCoins = beforeUser.coins;
                const deductAmount = Math.min(beforeCoins, amount);

                db.updateUser(target.id, data => {
                    data.coins = Math.max(0, data.coins - amount);
                });

                const afterUser = db.getUser(target.id);

                const embed = new EmbedBuilder()
                    .setTitle('💸 THU HỒI / TRỪ XU THÀNH CÔNG')
                    .setColor(0xE74C3C)
                    .addFields(
                        { name: '👤 Thành viên', value: `<@${target.id}>`, inline: true },
                        { name: '👑 Admin thực hiện', value: `<@${user.id}>`, inline: true },
                        { name: '💸 Số xu trừ', value: `\`-${formatNumber(deductAmount)}\` xu`, inline: true },
                        { name: '📊 Số dư trước', value: `\`${formatNumber(beforeCoins)}\` xu`, inline: true },
                        { name: '✨ Số dư còn lại', value: `\`${formatNumber(afterUser.coins)}\` xu`, inline: true },
                        { name: '📝 Lý do', value: `*${reason}*`, inline: false }
                    )
                    .setTimestamp();

                return interaction.reply({ content: `⚠️ Đã trừ **-${formatNumber(deductAmount)} xu** của <@${target.id}>!`, embeds: [embed] });
            }

            // Lệnh: /set-tien
            if (commandName === 'set-tien') {
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || interaction.guild.ownerId === user.id;
                if (!isAdmin) {
                    return interaction.reply({ content: '✕ Chỉ Quản trị viên mới có quyền đặt số dư ví!', ephemeral: true });
                }

                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('so_tien');

                db.updateUser(target.id, data => {
                    data.coins = amount;
                });

                return interaction.reply({
                    content: `✅ Đã thiết lập số dư ví của <@${target.id}> thành: **${formatNumber(amount)} xu**!`
                });
            }

            // Lệnh: /balance
            if (commandName === 'balance') {
                const target = interaction.options.getUser('user') || user;
                const u = db.getUser(target.id);
                const nextXP = u.level * 200;

                const embed = new EmbedBuilder()
                    .setTitle(`💰 VÍ TIỀN CỦA ${target.displayName.toUpperCase()}`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .setColor(0xF1C40F)
                    .addFields(
                        { name: '🪙 Số dư xu', value: `\`${formatNumber(u.coins)}\` xu`, inline: true },
                        { name: '⭐ Cấp độ (Level)', value: `Level \`${u.level}\``, inline: true },
                        { name: '✨ Điểm kinh nghiệm', value: `\`${formatNumber(u.xp)} / ${formatNumber(nextXP)}\` XP`, inline: true },
                        { name: '💬 Tin nhắn đã chat', value: `\`${formatNumber(u.messages)}\` tin`, inline: true },
                        { name: '🎙️ Thời gian voice', value: `\`${formatVoiceDuration(u.voiceTime)}\``, inline: true }
                    )
                    .setFooter({ text: 'Tham gia chat và treo voice để kiếm thêm xu & XP!' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // Lệnh: /tx hoặc /taixiu (Bàn cược Tài Xỉu Cộng Đồng chuẩn 35s)
            if (commandName === 'tx' || commandName === 'taixiu') {
                // Chỉ được dùng trong kênh #tai-xiu-bau-cua
                if (interaction.channelId !== '1489597337469845544') {
                    return interaction.reply({
                        content: '> Lệnh này chỉ được sử dụng trong <#1489597337469845544>.',
                        flags: 64 // ephemeral
                    });
                }

                // CƠ CHẾ KHÓA: DUY NHẤT 1 PHIÊN TÀI XỈU HOẠT ĐỘNG CÙNG LÚC TRÊN SERVER
                if (activeTxSession && activeTxSession.status !== 'finished') {
                    if (activeTxSession.status === 'rolling') {
                        return interaction.reply({
                            content: `> ⏳ Phiên **Tài Xỉu #${activeTxSession.roundId}** đang lắc bát trả kết quả! Vui lòng đợi kết quả hiển thị xong để mở phiên tiếp theo.`,
                            flags: 64
                        });
                    } else if (activeTxSession.status === 'starting') {
                        return interaction.reply({
                            content: `> ⏳ Phiên **Tài Xỉu #${activeTxSession.roundId}** đang được khởi tạo, vui lòng đợi trong giây lát...`,
                            flags: 64
                        });
                    } else {
                        const timeLeft = Math.max(1, activeTxSession.expireTimestamp - Math.floor(Date.now() / 1000));
                        return interaction.reply({
                            content: `> ⚠️ Đang có phiên **Tài Xỉu #${activeTxSession.roundId}** đang diễn ra! Mỗi lần chỉ được một phiên hoạt động, vui lòng chờ hết phiên hoặc tham gia đặt cược tại tin nhắn đó (còn khoảng **${timeLeft}s**).`,
                            flags: 64
                        });
                    }
                }

                const expireTimestamp = Math.floor(Date.now() / 1000) + 35;
                const roundId = db.getTxRoundId();

                // Đặt cờ khóa ngay lập tức để chặn spam lệnh /tx cùng lúc
                activeTxSession = {
                    type: 'taixiu',
                    roundId: roundId,
                    creatorId: user.id,
                    channelId: interaction.channelId,
                    expireTimestamp: expireTimestamp,
                    status: 'starting',
                    bets: [] // Mảng lưu các cược: { userId, choice, amount, diceValue, targetTotal, extra }
                };

                try {
                    const embeds = renderTaiXiuRoomEmbeds(activeTxSession);
                    const components = createTaiXiuComponents();
                    const replyMsg = await interaction.reply({ embeds, components, withResponse: true });
                    const messageObj = replyMsg.resource?.message || replyMsg;
                    const msgId = messageObj.id;

                    activeTxSession.messageId = msgId;
                    activeTxSession.status = 'betting';
                    activeGameRooms.set(msgId, activeTxSession);

                    activeTxSession.timer = setTimeout(async () => {
                        await finishTaiXiuRoom(msgId, interaction.channel);
                    }, 35000);
                } catch (err) {
                    console.error('[TX START ERROR]', err);
                    activeTxSession = null;
                    return interaction.reply({ content: '> Đã xảy ra lỗi khi tạo phiên Tài Xỉu!', flags: 64 }).catch(() => {});
                }

                return;
            }

            // Lệnh: /bc hoặc /baucua (Bàn cược Bầu Cua Tôm Cá Cộng Đồng 45s)
            if (commandName === 'bc' || commandName === 'baucua') {
                // Chỉ được dùng trong kênh #tai-xiu-bau-cua
                if (interaction.channelId !== '1489597337469845544') {
                    return interaction.reply({
                        content: '> Lệnh này chỉ được sử dụng trong <#1489597337469845544>.',
                        flags: 64 // ephemeral
                    });
                }

                const expireTimestamp = Math.floor(Date.now() / 1000) + 45;

                const room = {
                    type: 'baucua',
                    creatorId: user.id,
                    expireTimestamp: expireTimestamp,
                    bets: {} // userId -> { choice: 'Bau' | 'Cua' | ..., amount: number }
                };

                const embed = renderBauCuaRoomEmbed(room);

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_room_bc_Bau').setLabel('Bầu').setEmoji('🎃').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_room_bc_Cua').setLabel('Cua').setEmoji('🦀').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_room_bc_Tom').setLabel('Tôm').setEmoji('🦐').setStyle(ButtonStyle.Primary)
                );

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_room_bc_Ca').setLabel('Cá').setEmoji('🐟').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_room_bc_Ga').setLabel('Gà').setEmoji('🐔').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_room_bc_Nai').setLabel('Nai').setEmoji('🦌').setStyle(ButtonStyle.Success)
                );

                const replyMsg = await interaction.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });
                room.messageId = replyMsg.id;
                activeGameRooms.set(replyMsg.id, room);

                setTimeout(async () => {
                    await finishBauCuaRoom(replyMsg.id, interaction.channel);
                }, 45000);

                return;
            }

            // Lệnh: /soicau hoặc /thongke (Xem biểu đồ 2 tầng Thống Kê Phiên)
            if (commandName === 'soicau' || commandName === 'thongke') {
                const h = db.getTxHistory();
                const latest = h[h.length - 1] || {};
                const chartBuf = renderSoiCauChart(h, latest);
                const attachment = new AttachmentBuilder(chartBuf, { name: 'thongke_phien.png' });
                return interaction.reply({ files: [attachment] });
            }

            // Lệnh: /chuyenkhoan
            if (commandName === 'chuyenkhoan') {
                const target = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('tien');

                if (target.id === user.id) {
                    return interaction.reply({ content: '✕ Bạn không thể tự chuyển tiền cho chính mình!', ephemeral: true });
                }
                if (target.bot) {
                    return interaction.reply({ content: '✕ Không thể chuyển tiền cho Bot!', ephemeral: true });
                }

                const sender = db.getUser(user.id);
                if (sender.coins < amount) {
                    return interaction.reply({ content: `✕ Bạn không đủ xu! Hiện bạn có **${formatNumber(sender.coins)} xu**.`, ephemeral: true });
                }

                db.updateUser(user.id, data => { data.coins -= amount; });
                db.updateUser(target.id, data => { data.coins += amount; });

                const embed = new EmbedBuilder()
                    .setTitle('💸 CHUYỂN KHOẢN THÀNH CÔNG!')
                    .setDescription(
                        `**Người gửi:** <@${user.id}>\n` +
                        `**Người nhận:** <@${target.id}>\n` +
                        `**Số tiền:** \`${formatNumber(amount)}\` xu\n\n` +
                        `*Giao dịch đã được ghi nhận vào hệ thống ngân hàng server!*`
                    )
                    .setColor(0x3498DB)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // Lệnh: /top-xu
            if (commandName === 'top-xu') {
                const top = db.getTopUsers('coins', 10);
                let desc = '';
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

                top.forEach((u, i) => {
                    desc += `${medals[i]} <@${u.id}>: **${formatNumber(u.coins)}** xu (Level ${u.level})\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('🏆 BẢNG XẾP HẠNG ĐẠI GIA SERVER')
                    .setDescription(desc || 'Chưa có dữ liệu thành viên.')
                    .setColor(0xF1C40F)
                    .setFooter({ text: 'Cạnh tranh làm giàu cùng cộng đồng' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // ==========================================
            // LỆNH THỐNG KÊ HOẠT ĐỘNG (STATS & RANK)
            // ==========================================

            // Lệnh: /rank
            if (commandName === 'rank') {
                const target = interaction.options.getUser('user') || user;
                const u = db.getUser(target.id);
                const nextXP = u.level * 200;
                const percent = Math.min(Math.round((u.xp / nextXP) * 100), 100);

                const progressBar = '▰'.repeat(Math.floor(percent / 10)) + '▱'.repeat(10 - Math.floor(percent / 10));

                const embed = new EmbedBuilder()
                    .setTitle(`🎖️ THẺ RANK THÀNH VIÊN: ${target.displayName}`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: '⭐ Cấp độ (Level)', value: `\`Level ${u.level}\``, inline: true },
                        { name: '✨ Tiến trình XP', value: `\`${u.xp} / ${nextXP}\` (${percent}%)`, inline: true },
                        { name: '📊 Thanh tiến độ', value: `[${progressBar}]`, inline: false },
                        { name: '💬 Tin nhắn đã gửi', value: `\`${formatNumber(u.messages)}\` tin nhắn`, inline: true },
                        { name: '🎙️ Thời gian đàm thoại', value: `\`${formatVoiceDuration(u.voiceTime)}\``, inline: true },
                        { name: '💰 Ví xu hiện có', value: `\`${formatNumber(u.coins)}\` xu`, inline: true }
                    )
                    .setFooter({ text: 'Tích cực chat và đàm thoại để thăng cấp!' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // Lệnh: /top-chat
            if (commandName === 'top-chat') {
                const top = db.getTopUsers('messages', 10);
                let desc = '';
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

                top.forEach((u, i) => {
                    desc += `${medals[i]} <@${u.id}>: **${formatNumber(u.messages)}** tin nhắn\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('💬 TOP 10 THÀNH VIÊN HOẠT NGÔN NHẤT')
                    .setDescription(desc || 'Chưa có ai nhắn tin.')
                    .setColor(0x1ABC9C)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // Lệnh: /top-voice
            if (commandName === 'top-voice') {
                const top = db.getTopUsers('voiceTime', 10);
                let desc = '';
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

                top.forEach((u, i) => {
                    desc += `${medals[i]} <@${u.id}>: **${formatVoiceDuration(u.voiceTime)}**\n`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('🎙️ TOP 10 THÀNH VIÊN TREO VOICE NHIỀU NHẤT')
                    .setDescription(desc || 'Chưa có dữ liệu voice.')
                    .setColor(0xE67E22)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // ==========================================
            // LỆNH GIVEAWAY (SỰ KIỆN QUAY THƯỞNG)
            // ==========================================
            if (commandName === 'giveaway') {
                const prize = interaction.options.getString('prize');
                const minutes = interaction.options.getInteger('minutes');
                const winnersCount = interaction.options.getInteger('winners') || 1;

                const endTime = Date.now() + minutes * 60 * 1000;
                const endTimestamp = Math.floor(endTime / 1000);

                const embed = new EmbedBuilder()
                    .setTitle('🎉 SỰ KIỆN GIVEAWAY MAY MẮN 🎉')
                    .setDescription(
                        `**Phần thưởng:** 🎁 **${prize}**\n\n` +
                        `👑 **Số giải thưởng:** \`${winnersCount}\` người chiến thắng\n` +
                        `⏰ **Kết thúc lúc:** <t:${endTimestamp}:R> (<t:${endTimestamp}:f>)\n` +
                        `👤 **Chủ trì:** <@${user.id}>\n\n` +
                        `*Bấm vào nút **🎉 Tham Gia** bên dưới để có cơ hội trúng giải!*`
                    )
                    .setColor(0x9B59B6)
                    .setFooter({ text: 'Tổng số người tham gia: 0' })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_join_giveaway')
                        .setLabel('Tham Gia (0)')
                        .setEmoji('🎉')
                        .setStyle(ButtonStyle.Primary)
                );

                const sentMsg = await interaction.channel.send({ embeds: [embed], components: [row] });

                db.createGiveaway(sentMsg.id, {
                    channelId: interaction.channel.id,
                    prize: prize,
                    endTime: endTime,
                    winnersCount: winnersCount,
                    participants: []
                });

                return interaction.reply({ content: '✓ Đã tạo sự kiện Giveaway thành công!', ephemeral: true });
            }

            // ==========================================
            // LỆNH TEXT-TO-SPEECH (TTS GIỌNG NÓI TIẾNG VIỆT)
            // ==========================================
            if (commandName === 'tts') {
                const text = interaction.options.getString('text');
                const voiceChannel = interaction.member?.voice?.channel;

                if (!voiceChannel) {
                    return interaction.reply({ content: '✕ Bạn phải đang ở trong một phòng Voice để dùng lệnh này!', ephemeral: true });
                }

                if (text.length > 200) {
                    return interaction.reply({ content: '✕ Nội dung quá dài! Vui lòng nhập dưới 200 ký tự.', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                try {
                    await speakTTS(voiceChannel, text);
                    return interaction.editReply({ content: `🗣️ Đã phát giọng đọc: "${text}" vào phòng **${voiceChannel.name}**!` });
                } catch (e) {
                    console.error('[TTS ERROR]', e);
                    return interaction.editReply({ content: '✕ Không thể phát giọng nói vào phòng voice. Hãy kiểm tra quyền của bot!' });
                }
            }

            if (commandName === 'join') {
                const voiceChannel = interaction.member?.voice?.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: '✕ Bạn phải ở trong phòng Voice trước!', ephemeral: true });
                }

                joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: voiceChannel.guild.id,
                    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                });

                return interaction.reply({ content: `✓ Đã kết nối vào phòng voice **${voiceChannel.name}**!`, ephemeral: true });
            }

            if (commandName === 'leave') {
                const connection = getVoiceConnection(interaction.guild.id);
                if (connection) {
                    connection.destroy();
                    return interaction.reply({ content: '✓ Bot đã rời khỏi phòng voice.', ephemeral: true });
                }
                return interaction.reply({ content: '✕ Bot hiện không ở trong phòng voice nào!', ephemeral: true });
            }

            // ==========================================
            // LỆNH QUẢN TRỊ SERVER CŨ
            // ==========================================
            if (commandName === 'setup-ticket') {
                const embed = new EmbedBuilder()
                    .setTitle('〔 📩 〕TRUNG TÂM HỖ TRỢ THÀNH VIÊN')
                    .setDescription(
                        'Chào mừng bạn đến với kênh hỗ trợ của Server!\n\n' +
                        'Nếu bạn cần sự giúp đỡ, giải đáp thắc mắc hoặc báo cáo vấn đề, vui lòng chọn loại yêu cầu bên dưới để tạo **Ticket riêng tư** làm việc với Ban Quản Trị:\n\n' +
                        '▸ **📩 Hỗ trợ & Giải đáp:** Hỏi đáp thông tin, thắc mắc chung về server.\n' +
                        '▸ **⚠️ Khiếu nại / Báo cáo:** Báo cáo thành viên vi phạm, gian lận, toxic hoặc khiếu nại.\n' +
                        '▸ **🤝 Hợp tác & Đóng góp:** Liên hệ hợp tác, giao lưu hoặc đóng góp ý kiến phát triển server.\n\n' +
                        '*Sau khi bấm, một kênh chat riêng tư sẽ được tự động tạo cho bạn!*'
                    )
                    .setColor(0x5865F2)
                    .setFooter({ text: 'Hệ thống hỗ trợ tự động • Ban Quản Trị Server' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_support')
                        .setLabel('Hỗ trợ chung')
                        .setEmoji('📩')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ticket_report')
                        .setLabel('Khiếu nại / Báo cáo')
                        .setEmoji('⚠️')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('ticket_feedback')
                        .setLabel('Hợp tác / Góp ý')
                        .setEmoji('🤝')
                        .setStyle(ButtonStyle.Success)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return interaction.reply({ content: '✓ Đã khởi tạo bảng Ticket thành công!', ephemeral: true });
            }

            if (commandName === 'close-ticket') {
                if (!interaction.channel.name.startsWith('ticket-')) {
                    return interaction.reply({ content: '✕ Lệnh này chỉ dùng được trong kênh Ticket!', ephemeral: true });
                }
                
                const closeConfirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_confirm_close_ticket')
                        .setLabel('Xác nhận Đóng')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('btn_cancel_close_ticket')
                        .setLabel('Hủy')
                        .setStyle(ButtonStyle.Secondary)
                );

                return interaction.reply({
                    content: '⚠️ Bạn có chắc chắn muốn đóng ticket này không? Kênh sẽ tự động xóa sau khi xác nhận.',
                    components: [closeConfirmRow]
                });
            }

            if (commandName === 'clear') {
                const amount = interaction.options.getInteger('amount');
                await interaction.deferReply({ ephemeral: true });

                const deleted = await interaction.channel.bulkDelete(amount, true);
                return interaction.editReply({ content: `✓ Đã dọn dẹp sạch sẽ **${deleted.size}** tin nhắn trong kênh!` });
            }

            if (commandName === 'timeout') {
                const targetUser = interaction.options.getUser('user');
                const minutes = interaction.options.getInteger('minutes');
                const reason = interaction.options.getString('reason') || 'Không nêu lý do';

                const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!targetMember) {
                    return interaction.reply({ content: '✕ Không tìm thấy thành viên này trong server!', ephemeral: true });
                }

                if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return interaction.reply({ content: '✕ Bạn không thể phạt thành viên có vai trò ngang hoặc cao hơn bạn!', ephemeral: true });
                }

                await targetMember.timeout(minutes * 60 * 1000, reason);
                return interaction.reply({
                    content: `✓ Đã tạm dừng chat (timeout) <@${targetUser.id}> trong **${minutes} phút**.\n**Lý do:** ${reason}`
                });
            }

            if (commandName === 'kick') {
                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'Không nêu lý do';

                const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!targetMember) {
                    return interaction.reply({ content: '✕ Không tìm thấy thành viên này trong server!', ephemeral: true });
                }

                if (targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return interaction.reply({ content: '✕ Bạn không thể kick thành viên có vai trò ngang hoặc cao hơn bạn!', ephemeral: true });
                }

                await targetMember.kick(reason);
                return interaction.reply({
                    content: `👢 Đã kick thành viên <@${targetUser.id}> ra khỏi server.\n**Lý do:** ${reason}`
                });
            }

            if (commandName === 'ban') {
                const targetUser = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') || 'Không nêu lý do';

                const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (targetMember && targetMember.roles.highest.position >= interaction.member.roles.highest.position) {
                    return interaction.reply({ content: '✕ Bạn không thể ban thành viên có vai trò ngang hoặc cao hơn bạn!', ephemeral: true });
                }

                await interaction.guild.members.ban(targetUser.id, { reason });
                return interaction.reply({
                    content: `🔨 Đã cấm (ban) vĩnh viễn <@${targetUser.id}> khỏi server.\n**Lý do:** ${reason}`
                });
            }

            if (commandName === 'server-info') {
                const totalMembers = guild.memberCount;
                const channels = guild.channels.cache;
                const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
                const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
                const rolesCount = guild.roles.cache.size;

                const embed = new EmbedBuilder()
                    .setTitle(`📊 THÔNG TIN SERVER: ${guild.name}`)
                    .setThumbnail(guild.iconURL({ dynamic: true }) || null)
                    .setColor(0x5865F2)
                    .addFields(
                        { name: '👑 Chủ Server', value: `<@${guild.ownerId}>`, inline: true },
                        { name: '👥 Tổng thành viên', value: `\`${totalMembers}\``, inline: true },
                        { name: '📅 Ngày thành lập', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '💬 Kênh chat', value: `\`${textChannels}\` kênh`, inline: true },
                        { name: '🔊 Kênh đàm thoại', value: `\`${voiceChannels}\` phòng`, inline: true },
                        { name: '🛡️ Tổng số vai trò', value: `\`${rolesCount}\` roles`, inline: true }
                    )
                    .setFooter({ text: 'Quản lý Server tự động' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }
        }

        // --- XỬ LÝ NÚT BẤM (BUTTONS) ---
        if (interaction.isButton()) {
            const { customId, user, guild, channel, message } = interaction;

            // Nút điều khiển phòng voice tạm thời
            if (customId.startsWith('voice_lock_') || customId.startsWith('voice_limit_') || customId.startsWith('voice_rename_')) {
                const targetChannelId = customId.split('_')[2];
                const voiceChan = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
                if (!voiceChan) {
                    return interaction.reply({ content: '✕ Phòng voice này không còn tồn tại!', ephemeral: true });
                }

                // Kiểm tra quyền: Chỉ chủ phòng hoặc Admin mới được chỉnh
                const ownerId = tempVoiceChannels.get(targetChannelId);
                const isOwner = ownerId === user.id;
                const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
                if (!isOwner && !isAdmin) {
                    return interaction.reply({ content: '✕ Chỉ chủ sở hữu phòng thoại mới có quyền điều khiển phòng này!', ephemeral: true });
                }

                // 1. Khóa / Mở phòng
                if (customId.startsWith('voice_lock_')) {
                    const currentPerm = voiceChan.permissionOverwrites.cache.get(guild.id);
                    const isCurrentlyLocked = currentPerm && currentPerm.deny.has(PermissionsBitField.Flags.Connect);

                    if (isCurrentlyLocked) {
                        await voiceChan.permissionOverwrites.edit(guild.id, { Connect: null });
                        return interaction.reply({ content: '🔓 **Đã mở khóa phòng!** Tất cả thành viên đều có thể tham gia.', ephemeral: true });
                    } else {
                        await voiceChan.permissionOverwrites.edit(guild.id, { Connect: false });
                        return interaction.reply({ content: '🔒 **Đã khóa phòng!** Người ngoài sẽ không thể tự do vào phòng được nữa.', ephemeral: true });
                    }
                }

                // 2. Giới hạn số người trong phòng (xoay vòng: 0 -> 2 -> 4 -> 6 -> 8 -> 10 -> 0)
                if (customId.startsWith('voice_limit_')) {
                    const currentLimit = voiceChan.userLimit || 0;
                    const limits = [0, 2, 4, 6, 8, 10];
                    const currentIndex = limits.indexOf(currentLimit);
                    const nextLimit = limits[(currentIndex + 1) % limits.length];

                    await voiceChan.setUserLimit(nextLimit);
                    const limitText = nextLimit === 0 ? 'Không giới hạn' : `${nextLimit} người`;
                    return interaction.reply({ content: `👥 **Đã cập nhật giới hạn phòng:** **${limitText}**!`, ephemeral: true });
                }

                // 3. Đổi tên phòng (hiện Modal)
                if (customId.startsWith('voice_rename_')) {
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_voice_rename_${targetChannelId}`)
                        .setTitle('Đổi Tên Phòng Thoại');

                    const nameInput = new TextInputBuilder()
                        .setCustomId('input_new_voice_name')
                        .setLabel('Nhập tên phòng mới:')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Ví dụ: 🔊・Chơi Game Cùng Bạn...')
                        .setValue(voiceChan.name)
                        .setMaxLength(30)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                    return interaction.showModal(modal);
                }
            }

            // Nút tham gia Giveaway
            if (customId === 'btn_join_giveaway') {
                const g = db.getGiveaway(message.id);
                if (!g) {
                    return interaction.reply({ content: '✕ Sự kiện Giveaway này đã kết thúc!', ephemeral: true });
                }

                const index = g.participants.indexOf(user.id);
                let msgText = '';
                if (index > -1) {
                    g.participants.splice(index, 1);
                    msgText = '❌ Bạn đã hủy tham gia sự kiện Giveaway!';
                } else {
                    g.participants.push(user.id);
                    msgText = '🎉 Bạn đã tham gia sự kiện Giveaway thành công! Chúc bạn may mắn!';
                }
                db.saveData();

                // Cập nhật số người trên nút bấm
                const updatedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_join_giveaway')
                        .setLabel(`Tham Gia (${g.participants.length})`)
                        .setEmoji('🎉')
                        .setStyle(ButtonStyle.Primary)
                );

                const currentEmbed = message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(currentEmbed)
                    .setFooter({ text: `Tổng số người tham gia: ${g.participants.length}` });

                await message.edit({ embeds: [updatedEmbed], components: [updatedRow] });
                return interaction.reply({ content: msgText, ephemeral: true });
            }

            // Nút xem bảng Thống Kê Phiên (Soi Cầu dạng biểu đồ 2 tầng)
            if (customId === 'btn_view_soicau') {
                const h = db.getTxHistory();
                const latest = h[h.length - 1] || {};
                const chartBuf = renderSoiCauChart(h, latest);
                const attachment = new AttachmentBuilder(chartBuf, { name: 'thongke_phien.png' });
                return interaction.reply({
                    files: [attachment],
                    flags: 64
                });
            }

            // ==========================================
            // NÚT BẤM CHỌN CỬA TÀI XỈU ➔ HIỆN FORM NHẬP TIỀN
            // ==========================================
            if (customId === 'btn_room_tx_tai' || customId === 'btn_room_tx_xiu' || customId === 'btn_room_tx_chan' || customId === 'btn_room_tx_le') {
                const room = activeGameRooms.get(interaction.message.id);
                if (!room || room.type !== 'taixiu' || room.status !== 'betting') {
                    return interaction.reply({ content: '> ✕ Bàn cược này đã hết giờ nhận cược hoặc đang lắc kết quả!', flags: 64 });
                }

                const choice = customId.replace('btn_room_tx_', '');
                const labels = {
                    tai: '⚫ Tài (11 - 17)',
                    xiu: '⚪ Xỉu (4 - 10)',
                    chan: '🟣 Chẵn',
                    le: '🟡 Lẻ'
                };
                const choiceLabel = labels[choice] || choice;
                const u = db.getUser(user.id);
                const currentBet = room.bets[user.id] ? room.bets[user.id].amount : 0;

                const modal = new ModalBuilder()
                    .setCustomId(`modal_bet_tx_${choice}_${interaction.message.id}`)
                    .setTitle(`Đặt cược ${choiceLabel}`);

                const input = new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel(`Nhập số xu cược (Ví: ${formatNumber(u.coins)} xu)`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(currentBet > 0 ? `Đang cược: ${formatNumber(currentBet)} xu` : 'Tối thiểu 100 xu (VD: 1000)')
                    .setMinLength(1)
                    .setMaxLength(12)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            // ==========================================
            // NÚT BẤM CHỌN LINH VẬT BẦU CUA ➔ HIỆN FORM NHẬP TIỀN
            // ==========================================
            if (customId.startsWith('btn_room_bc_')) {
                const room = activeGameRooms.get(interaction.message.id);
                if (!room || room.type !== 'baucua') {
                    return interaction.reply({ content: '✕ Bàn cược này đã hết giờ hoặc không còn hiệu lực!', ephemeral: true });
                }

                const choiceKey = customId.replace('btn_room_bc_', '');
                const itemInfo = BC_ITEMS.find(i => i.key === choiceKey);
                const itemLabel = itemInfo ? `${itemInfo.icon} ${itemInfo.label}` : choiceKey;
                const u = db.getUser(user.id);
                const currentBet = room.bets[user.id] ? room.bets[user.id].amount : 0;

                const modal = new ModalBuilder()
                    .setCustomId(`modal_bet_bc_${choiceKey}_${interaction.message.id}`)
                    .setTitle(`Đặt cược ${itemInfo?.label || choiceKey}`);

                const input = new TextInputBuilder()
                    .setCustomId('bet_amount')
                    .setLabel(`Nhập số xu cược ${itemInfo?.label || ''} (Ví: ${formatNumber(u.coins)} xu)`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(currentBet > 0 ? `Đang cược: ${formatNumber(currentBet)} xu` : 'Tối thiểu 100 xu (VD: 1000)')
                    .setMinLength(1)
                    .setMaxLength(12)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            // Nút Tạo Ticket -> Mở Modal nhập lý do
            if (customId.startsWith('ticket_')) {
                let ticketType = 'Hỗ trợ chung';
                if (customId === 'ticket_report') ticketType = 'Khiếu nại / Báo cáo';
                if (customId === 'ticket_feedback') ticketType = 'Hợp tác / Góp ý';

                // Kiểm tra ticket cũ
                const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                const existingChannel = guild.channels.cache.find(
                    c => c.name === `ticket-${cleanUsername}`
                );
                if (existingChannel) {
                    return interaction.reply({
                        content: `> Bạn đã có một ticket đang mở tại <#${existingChannel.id}>. Vui lòng đóng ticket cũ trước.`,
                        flags: 64
                    });
                }

                // Mở Modal để nhập mô tả
                const modal = new ModalBuilder()
                    .setCustomId(`ticket_modal_${customId}`)
                    .setTitle(`Yêu cầu: ${ticketType}`);

                const reasonInput = new TextInputBuilder()
                    .setCustomId('ticket_reason')
                    .setLabel('Mô tả vấn đề của bạn')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Viết mô tả chi tiết về vấn đề bạn đang gặp...')
                    .setMinLength(10)
                    .setMaxLength(1000)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                return interaction.showModal(modal);
            }

            // Nút Xác nhận đóng ticket
            if (customId === 'btn_confirm_close_ticket') {
                // Chỉ chủ ticket hoặc staff mới được đóng
                const ownerId = ticketOwners.get(channel.id);
                const memberPerms = interaction.member.permissions;
                if (ownerId !== user.id && !memberPerms.has(PermissionsBitField.Flags.ManageChannels)) {
                    return interaction.reply({ content: '> Chỉ người tạo ticket hoặc quản trị viên mới được đóng ticket này.', flags: 64 });
                }

                const closeEmbed = new EmbedBuilder()
                    .setColor(0x5C5F66)
                    .setAuthor({ name: 'Quản Lý Lê — Bảo vệ, dắt xe, trông nhà', iconURL: guild.iconURL({ dynamic: true }) })
                    .setTitle('Ticket đang được đóng')
                    .setDescription(
                        `Ticket được đóng bởi <@${user.id}>\n` +
                        `Kênh sẽ tự động xóa sau **5 giây**.`
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [closeEmbed] });
                setTimeout(async () => {
                    try {
                        ticketOwners.delete(channel.id);
                        await channel.delete();
                    } catch (e) {
                        console.error('Lỗi khi xóa ticket channel:', e);
                    }
                }, 5000);
                return;
            }

            // Nút Hủy đóng ticket
            if (customId === 'btn_cancel_close_ticket') {
                await interaction.message.delete().catch(() => {});
                return interaction.reply({ content: 'Đã hủy thao tác đóng ticket.', flags: 64 });
            }
        }

        // --- XỬ LÝ MENU CHỌN (STRING SELECT MENU) ---
        if (interaction.isStringSelectMenu()) {
            const { customId, user, values, message } = interaction;

            if (customId === 'select_room_tx_choice') {
                const room = activeGameRooms.get(message.id);
                if (!room || room.type !== 'taixiu' || room.status !== 'betting') {
                    return interaction.reply({ content: '> ✕ Bàn cược này đã hết giờ nhận cược hoặc đang lắc kết quả!', flags: 64 });
                }

                const choice = values[0];
                const u = db.getUser(user.id);

                if (choice === 'tai' || choice === 'xiu' || choice === 'chan' || choice === 'le') {
                    const titles = {
                        tai: 'NHẬP SỐ TIỀN CƯỢC (TÀI)',
                        xiu: 'NHẬP SỐ TIỀN CƯỢC (XỈU)',
                        chan: 'NHẬP SỐ TIỀN CƯỢC (CHẴN)',
                        le: 'NHẬP SỐ TIỀN CƯỢC (LẺ)'
                    };

                    const modal = new ModalBuilder()
                        .setCustomId(`modal_bet_tx_${choice}_${message.id}`)
                        .setTitle(titles[choice]);

                    const input = new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel(`Mcoin của bạn: ${formatNumber(u.coins)}`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Cược tối thiểu 4,000,000 để ăn hũ.')
                        .setMinLength(1)
                        .setMaxLength(15)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (choice === 'cuoc_so') {
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_bet_tx_so_${message.id}`)
                        .setTitle('NHẬP SỐ TIỀN CƯỢC (CƯỢC SỐ)');

                    const diceInput = new TextInputBuilder()
                        .setCustomId('dice_number')
                        .setLabel('Chọn con số may mắn (1 - 6)')
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(1)
                        .setMaxLength(1)
                        .setRequired(true);

                    const amountInput = new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel(`Mcoin của bạn: ${formatNumber(u.coins)}`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Cược tối thiểu 4,000,000 để ăn hũ.')
                        .setMinLength(1)
                        .setMaxLength(15)
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(diceInput),
                        new ActionRowBuilder().addComponents(amountInput)
                    );
                    return interaction.showModal(modal);
                }

                if (choice === 'cuoc_tong') {
                    const modal = new ModalBuilder()
                        .setCustomId(`modal_bet_tx_tong_${message.id}`)
                        .setTitle('NHẬP SỐ TIỀN CƯỢC (CƯỢC TỔNG)');

                    const totalInput = new TextInputBuilder()
                        .setCustomId('target_total')
                        .setLabel('Chọn tổng điểm may mắn (3 - 18)')
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(1)
                        .setMaxLength(2)
                        .setRequired(true);

                    const amountInput = new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel(`Mcoin của bạn: ${formatNumber(u.coins)}`)
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('Cược tối thiểu 4,000,000 để ăn hũ.')
                        .setMinLength(1)
                        .setMaxLength(15)
                        .setRequired(true);

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(totalInput),
                        new ActionRowBuilder().addComponents(amountInput)
                    );
                    return interaction.showModal(modal);
                }
            }
        }

        // --- XỬ LÝ FORM NHẬP TIỀN CƯỢC (MODAL SUBMIT) ---
        if (interaction.isModalSubmit()) {
            const { customId, user, channel, guild } = interaction;

            // Modal đổi tên phòng voice
            if (customId.startsWith('modal_voice_rename_')) {
                const targetChannelId = customId.replace('modal_voice_rename_', '');
                const voiceChan = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
                if (!voiceChan) {
                    return interaction.reply({ content: '✕ Phòng voice này không còn tồn tại!', ephemeral: true });
                }

                const newName = interaction.fields.getTextInputValue('input_new_voice_name');
                await voiceChan.setName(newName).catch(() => null);
                return interaction.reply({ content: `✏️ **Đã đổi tên phòng thành:** **${newName}**`, ephemeral: true });
            }

            // Modal Ticket: ticket_modal_ticket_support | ticket_modal_ticket_report | ticket_modal_ticket_feedback
            if (customId.startsWith('ticket_modal_')) {
                await interaction.deferReply({ ephemeral: true });

                const originalCustomId = customId.replace('ticket_modal_', '');
                const reason = interaction.fields.getTextInputValue('ticket_reason');

                let ticketType = 'Hỗ trợ chung';
                if (originalCustomId === 'ticket_report') ticketType = 'Khiếu nại / Báo cáo';
                if (originalCustomId === 'ticket_feedback') ticketType = 'Hợp tác / Góp ý';

                const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '');

                // Tìm category TICKETS
                const ticketCategory = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
                );

                // Tìm staff role
                const staffRole = guild.roles.cache.find(r =>
                    r.name.toLowerCase().includes('quản trị') ||
                    r.name.toLowerCase().includes('quan tri') ||
                    r.name.toLowerCase().includes('admin') ||
                    r.name.toLowerCase().includes('mod') ||
                    r.permissions.has(PermissionsBitField.Flags.Administrator)
                );

                const permOverwrites = [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    {
                        id: user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ManageChannels
                        ]
                    }
                ];

                if (staffRole) {
                    permOverwrites.push({
                        id: staffRole.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages
                        ]
                    });
                }

                const ticketChannel = await guild.channels.create({
                    name: `ticket-${cleanUsername}`,
                    type: ChannelType.GuildText,
                    parent: ticketCategory ? ticketCategory.id : null,
                    permissionOverwrites: permOverwrites,
                    topic: `[${ticketType}] Ticket của ${user.tag}`
                });

                ticketOwners.set(ticketChannel.id, user.id);

                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x1A1A2E)
                    .setAuthor({ name: 'Quản Lý Lê — Bảo vệ, dắt xe, trông nhà', iconURL: guild.iconURL({ dynamic: true }) })
                    .setTitle(`◈ ${ticketType}`)
                    .setDescription(
                        `Xin chào <@${user.id}>, tôi là Lê, bảo vệ ở đây.\n\n` +
                        `**Loại yêu cầu:** ${ticketType}\n` +
                        `**Mô tả của bạn:**\n\`\`\`${reason}\`\`\`\n` +
                        `Ban quản trị sẽ liên lạc sớm nhất có thể. Vui lòng chờ trong giây lát.`
                    )
                    .addFields(
                        { name: '◈ Lưu ý', value: 'Chỉ người tạo ticket và ban quản trị mới thấy được kênh này.\nKhông chia sẻ link kênh cho người khác.', inline: false }
                    )
                    .setFooter({ text: `Ticket ID: ${ticketChannel.id} • Hệ thống quản lý — Jkey và những đứa trẻ` })
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_confirm_close_ticket')
                        .setLabel('Đóng Ticket')
                        .setStyle(ButtonStyle.Danger)
                );

                const mentionContent = staffRole
                    ? `<@${user.id}> | <@&${staffRole.id}>`
                    : `<@${user.id}>`;

                await ticketChannel.send({ content: mentionContent, embeds: [welcomeEmbed], components: [closeRow] });
                console.log(`[TICKET] ${user.tag} tạo ticket: ${ticketType}`);

                return interaction.editReply({ content: `✓ Đã tạo ticket thành công! Vào <#${ticketChannel.id}> để trao đổi.` });
            }


            // Modal Tài Xỉu: modal_bet_tx_${choice}_${messageId}
            if (customId.startsWith('modal_bet_tx_')) {
                const parts = customId.split('_');
                const choice = parts[3]; // 'tai' | 'xiu' | 'chan' | 'le' | 'so' | 'tong'
                const messageId = parts[4];

                const room = activeGameRooms.get(messageId);
                if (!room || room.type !== 'taixiu' || room.status !== 'betting') {
                    return interaction.reply({ content: '> Bàn cược này đã hết giờ nhận cược hoặc đã kết thúc!', flags: 64 });
                }

                const rawAmount = interaction.fields.getTextInputValue('bet_amount');
                const amount = parseInt(rawAmount.replace(/[^0-9]/g, ''), 10);

                if (isNaN(amount) || amount < 100) {
                    return interaction.reply({ content: '> Số Mcoin cược không hợp lệ! Mức cược tối thiểu là **100 Mcoin**.', ephemeral: true });
                }

                let diceValue;
                let targetTotal;
                let extraLabel = '';

                if (choice === 'so') {
                    const rawDice = interaction.fields.getTextInputValue('dice_number');
                    diceValue = parseInt(rawDice.replace(/[^0-9]/g, ''), 10);
                    if (isNaN(diceValue) || diceValue < 1 || diceValue > 6) {
                        return interaction.reply({ content: '> Số cược không hợp lệ! Vui lòng chọn 1 số từ **1 đến 6**.', ephemeral: true });
                    }
                    extraLabel = `Số ${diceValue}`;
                }

                if (choice === 'tong') {
                    const rawTotal = interaction.fields.getTextInputValue('target_total');
                    targetTotal = parseInt(rawTotal.replace(/[^0-9]/g, ''), 10);
                    if (isNaN(targetTotal) || targetTotal < 3 || targetTotal > 18) {
                        return interaction.reply({ content: '> Tổng điểm không hợp lệ! Vui lòng nhập tổng từ **3 đến 18**.', ephemeral: true });
                    }
                    extraLabel = `Tổng ${targetTotal}`;
                }

                const u = db.getUser(user.id);
                if (u.coins < amount) {
                    return interaction.reply({
                        content: `> Bạn không đủ Mcoin! Hiện bạn có **${formatNumber(u.coins)} Mcoin**, không đủ để cược **${formatNumber(amount)} Mcoin**.`,
                        ephemeral: true
                    });
                }

                // Trừ Mcoin người chơi
                db.updateUser(user.id, d => { d.coins -= amount; });

                if (!Array.isArray(room.bets)) room.bets = [];
                room.bets.push({
                    userId: user.id,
                    choice,
                    amount,
                    diceValue,
                    targetTotal,
                    extra: extraLabel
                });

                // Cập nhật Embed trên bàn cược công khai ngay tức thì
                try {
                    const targetMsg = await channel.messages.fetch(messageId).catch(() => null);
                    if (targetMsg) {
                        await targetMsg.edit({ embeds: renderTaiXiuRoomEmbeds(room) });
                    }
                } catch (e) {}

                const choiceNames = {
                    tai: '⚫ TÀI',
                    xiu: '⚪ XỈU',
                    chan: '🟣 CHẴN',
                    le: '🟡 LẺ',
                    so: `🎲 CƯỢC SỐ [ ${diceValue} ]`,
                    tong: `❓ CƯỢC TỔNG [ ${targetTotal} ]`
                };

                return interaction.reply({
                    content: `✅ Đã chốt cược thành công **${formatNumber(amount)} Mcoin** vào **${choiceNames[choice] || choice}**! (Số dư còn: \`${formatNumber(db.getUser(user.id).coins)}\` Mcoin)`,
                    ephemeral: true
                });
            }

            // Modal Bầu Cua: modal_bet_bc_${choiceKey}_${messageId}
            if (customId.startsWith('modal_bet_bc_')) {
                const parts = customId.split('_');
                const choiceKey = parts[3];
                const messageId = parts[4];

                const room = activeGameRooms.get(messageId);
                if (!room || room.type !== 'baucua') {
                    return interaction.reply({ content: '✕ Bàn cược này đã kết thúc hoặc không còn hiệu lực!', ephemeral: true });
                }

                const rawAmount = interaction.fields.getTextInputValue('bet_amount');
                const amount = parseInt(rawAmount.replace(/[^0-9]/g, ''), 10);

                if (isNaN(amount) || amount < 100) {
                    return interaction.reply({ content: '✕ Số xu cược không hợp lệ! Mức cược tối thiểu là **100 xu**.', ephemeral: true });
                }

                const u = db.getUser(user.id);
                const prevBet = room.bets[user.id];
                const refundAmount = prevBet ? prevBet.amount : 0;
                const availableCoins = u.coins + refundAmount;

                if (availableCoins < amount) {
                    return interaction.reply({
                        content: `✕ Bạn không đủ xu! Hiện bạn có **${formatNumber(u.coins)} xu**${prevBet ? ` (+ hoàn ${formatNumber(refundAmount)} xu đã cược)` : ''}, không đủ để cược **${formatNumber(amount)} xu**.`,
                        ephemeral: true
                    });
                }

                // Hoàn trả cược cũ nếu có
                if (prevBet) {
                    db.updateUser(user.id, d => { d.coins += prevBet.amount; });
                }

                // Trừ xu cược mới
                db.updateUser(user.id, d => { d.coins -= amount; });
                room.bets[user.id] = { choice: choiceKey, amount };

                // Cập nhật Embed trên bàn cược công khai
                try {
                    const targetMsg = await channel.messages.fetch(messageId).catch(() => null);
                    if (targetMsg) {
                        await targetMsg.edit({ embeds: [renderBauCuaRoomEmbed(room)] });
                    }
                } catch (e) {}

                const itemInfo = BC_ITEMS.find(i => i.key === choiceKey);
                const itemLabel = itemInfo ? `${itemInfo.icon} ${itemInfo.label}` : choiceKey;
                return interaction.reply({
                    content: `✅ Đã chốt cược thành công **${formatNumber(amount)} xu** vào linh vật **${itemLabel}**!`,
                    ephemeral: true
                });
            }
        }
    } catch (err) {
        console.error('[INTERACTION ERROR]', err);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '✕ Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại!', ephemeral: true });
            } catch (e) {}
        }
    }
});

// 5. Hệ thống Voice tự động (Join-to-Create & Tính thời gian treo Voice)
client.on('voiceStateUpdate', async (oldState, newState) => {
    const { member, guild } = newState;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const now = Date.now();

    // A. Bắt đầu vào Voice -> Ghi nhận mốc thời gian
    if (!oldState.channelId && newState.channelId) {
        voiceSessions.set(userId, now);
    }
    // B. Rời khỏi Voice -> Tính tổng giây và cộng vào DB
    else if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceSessions.get(userId);
        if (joinTime) {
            const durationSec = Math.floor((now - joinTime) / 1000);
            if (durationSec > 0) {
                db.addVoiceTime(userId, durationSec);
            }
            voiceSessions.delete(userId);
        }
    }

    // C. Người dùng tham gia vào phòng "Tạo phòng nhanh"
    const newChan = newState.channel || (newState.channelId ? await guild.channels.fetch(newState.channelId).catch(() => null) : null);
    const oldChan = oldState.channel || (oldState.channelId ? await (oldState.guild || guild).channels.fetch(oldState.channelId).catch(() => null) : null);

    if (newChan && (newChan.name.includes('Tạo phòng nhanh') || newChan.name.includes('Tạo phòng') || newChan.id === '1547480185237016639')) {
        try {
            const tempChannel = await guild.channels.create({
                name: `🔊・Phòng của ${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: newChan.parentId,
                permissionOverwrites: [
                    {
                        id: guild.id, // @everyone
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak
                        ]
                    },
                    {
                        id: member.id, // Chủ phòng có toàn quyền
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.Speak,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.MuteMembers,
                            PermissionsBitField.Flags.DeafenMembers,
                            PermissionsBitField.Flags.PrioritySpeaker
                        ]
                    }
                ]
            });

            await member.voice.setChannel(tempChannel);
            tempVoiceChannels.set(tempChannel.id, member.id);
            console.log(`[TEMP-VOICE] ✅ Đã tạo phòng riêng cho ${member.displayName} (${tempChannel.id})`);

            // Gửi bảng điều khiển phòng thoại vào box chat của phòng voice
            const controlEmbed = new EmbedBuilder()
                .setColor(0x00FF7F)
                .setAuthor({ name: 'Quản Lý Lê — Quản Lý Phòng Thoại', iconURL: guild.iconURL({ dynamic: true }) })
                .setTitle(`🎙️ Bảng điều khiển: ${tempChannel.name}`)
                .setDescription(
                    `Xin chào <@${member.id}>! Bạn là chủ sở hữu của phòng voice này.\n\n` +
                    `• 🔒 **Khóa / Mở phòng:** Bật/tắt quyền tham gia của mọi người.\n` +
                    `• 👥 **Giới hạn người:** Giới hạn số thành viên (2, 4, 6, 8, Không giới hạn).\n` +
                    `• ✏️ **Đổi tên:** Đổi tên phòng theo sở thích của bạn.\n\n` +
                    `*💡 Phòng sẽ tự động được dọn dẹp sạch sẽ khi tất cả mọi người rời đi.*`
                )
                .setFooter({ text: 'Hệ thống Voice Tự Động • Quản Lý Lê' })
                .setTimestamp();

            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`voice_lock_${tempChannel.id}`).setLabel('Khóa/Mở').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`voice_limit_${tempChannel.id}`).setLabel('Giới Hạn').setEmoji('👥').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`voice_rename_${tempChannel.id}`).setLabel('Đổi Tên').setEmoji('✏️').setStyle(ButtonStyle.Success)
            );

            await tempChannel.send({ content: `<@${member.id}>`, embeds: [controlEmbed], components: [controlRow] }).catch(() => null);
        } catch (err) {
            console.error('[TEMP-VOICE] Lỗi khi tạo phòng:', err.message);
        }
    }

    // D. Người dùng rời khỏi phòng voice tạm thời -> Nếu phòng trống thì xóa
    if (oldState.channelId) {
        const isTracked = tempVoiceChannels.has(oldState.channelId);
        const chanToCheck = oldChan;
        // Kiểm tra nếu là phòng theo dõi hoặc phòng có tiền tố "🔊・Phòng của" mà trống người
        if (chanToCheck && (isTracked || (chanToCheck.name && chanToCheck.name.startsWith('🔊・Phòng của')))) {
            if (chanToCheck.members.size === 0) {
                tempVoiceChannels.delete(oldState.channelId);
                try {
                    await chanToCheck.delete('Phòng tạm đã trống, tự động dọn dẹp.');
                    console.log(`[TEMP-VOICE] 🗑️ Đã xóa phòng trống: ${chanToCheck.name}`);
                } catch (err) {
                    console.error('[TEMP-VOICE] Lỗi khi xóa phòng:', err.message);
                }
            }
        }
    }
});

// 6. Hệ thống Tích Lũy XP Chat & Auto-Moderation
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const { member, channel, guild, content } = message;
    if (!member) return;

    // A. Tích lũy tin nhắn và XP (Hệ thống Level)
    const { user, leveledUp } = db.addMessageXP(message.author.id);
    if (leveledUp) {
        channel.send(`🎉 Chúc mừng <@${message.author.id}> đã đạt **Level ${user.level}**! Nhận ngay **+${formatNumber(user.level * 500)} xu** thưởng.`);
    }

    // ==========================================
    // CÚ PHÁP LỆNH DẤU CHẤM (.) THAY VÌ (/)
    // ==========================================
    if (content.startsWith('.')) {
        const args = content.slice(1).trim().split(/ +/);
        const cmd = args.shift().toLowerCase();

        // 1. Lệnh .tx hoặc .taixiu (Mở phiên Tài Xỉu)
        if (cmd === 'tx' || cmd === 'taixiu') {
            if (channel.id !== '1489597337469845544') {
                return message.reply('> Lệnh này chỉ được sử dụng trong <#1489597337469845544>.');
            }

            if (activeTxSession && activeTxSession.status !== 'finished') {
                if (activeTxSession.status === 'rolling') {
                    return message.reply(`> ⏳ Phiên **Tài Xỉu #${activeTxSession.roundId}** đang lắc bát trả kết quả! Vui lòng đợi kết quả hiển thị xong để mở phiên tiếp theo.`);
                } else if (activeTxSession.status === 'starting') {
                    return message.reply(`> ⏳ Phiên **Tài Xỉu #${activeTxSession.roundId}** đang được khởi tạo, vui lòng đợi trong giây lát...`);
                } else {
                    const timeLeft = Math.max(1, activeTxSession.expireTimestamp - Math.floor(Date.now() / 1000));
                    return message.reply(`> ⚠️ Đang có phiên **Tài Xỉu #${activeTxSession.roundId}** đang diễn ra! Mỗi lần chỉ được một phiên hoạt động, vui lòng chờ hết phiên hoặc tham gia đặt cược tại tin nhắn đó (còn khoảng **${timeLeft}s**).`);
                }
            }

            const expireTimestamp = Math.floor(Date.now() / 1000) + 35;
            const roundId = db.getTxRoundId();

            activeTxSession = {
                type: 'taixiu',
                roundId: roundId,
                creatorId: message.author.id,
                channelId: channel.id,
                expireTimestamp: expireTimestamp,
                status: 'starting',
                bets: []
            };

            try {
                const embeds = renderTaiXiuRoomEmbeds(activeTxSession);
                const components = createTaiXiuComponents();
                const tableMsg = await channel.send({ embeds, components });

                activeTxSession.messageId = tableMsg.id;
                activeTxSession.status = 'betting';
                activeGameRooms.set(tableMsg.id, activeTxSession);

                activeTxSession.timer = setTimeout(async () => {
                    await finishTaiXiuRoom(tableMsg.id, channel);
                }, 35000);
            } catch (err) {
                console.error('[PREFIX .TX ERROR]', err);
                activeTxSession = null;
                return message.reply('> Đã xảy ra lỗi khi tạo phiên Tài Xỉu!').catch(() => {});
            }
            return;
        }

        // 2. Lệnh .bc hoặc .baucua (Mở bàn Bầu Cua)
        if (cmd === 'bc' || cmd === 'baucua') {
            if (channel.id !== '1489597337469845544') {
                return message.reply('> Lệnh này chỉ được sử dụng trong <#1489597337469845544>.');
            }

            const existingRoom = Array.from(activeGameRooms.values()).find(r => r.type === 'baucua' && r.channelId === channel.id);
            if (existingRoom) {
                return message.reply('> Đang có một bàn cược Bầu Cua đang diễn ra! Hãy tham gia đặt cược tại tin nhắn đó.');
            }

            const expireTimestamp = Math.floor(Date.now() / 1000) + 45;
            const room = {
                type: 'baucua',
                creatorId: message.author.id,
                channelId: channel.id,
                expireTimestamp: expireTimestamp,
                bets: {}
            };

            const embed = renderBauCuaRoomEmbed(room);
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_room_bc_Bau').setLabel('Bầu').setEmoji('🎃').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_room_bc_Cua').setLabel('Cua').setEmoji('🦀').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_room_bc_Tom').setLabel('Tôm').setEmoji('🦐').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_room_bc_Ca').setLabel('Cá').setEmoji('🐟').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_room_bc_Ga').setLabel('Gà').setEmoji('🐔').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('btn_room_bc_Nai').setLabel('Nai').setEmoji('🦌').setStyle(ButtonStyle.Success)
            );

            try {
                const tableMsg = await channel.send({ embeds: [embed], components: [row1, row2] });
                room.messageId = tableMsg.id;
                activeGameRooms.set(tableMsg.id, room);

                setTimeout(async () => {
                    await finishBauCuaRoom(tableMsg.id, channel);
                }, 45000);
            } catch (err) {
                console.error('[PREFIX .BC ERROR]', err);
                return message.reply('> Đã xảy ra lỗi khi tạo bàn Bầu Cua!').catch(() => {});
            }
            return;
        }

        // 3. Lệnh .balance / .bal / .xu / .vi / .tien
        if (cmd === 'balance' || cmd === 'bal' || cmd === 'xu' || cmd === 'vi' || cmd === 'tien') {
            const target = message.mentions.users.first() || message.author;
            const u = db.getUser(target.id);
            const nextXP = u.level * 200;

            const embed = new EmbedBuilder()
                .setTitle(`💰 VÍ TIỀN CỦA ${(target.displayName || target.username).toUpperCase()}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setColor(0xF1C40F)
                .addFields(
                    { name: '🪙 Số dư xu', value: `\`${formatNumber(u.coins)}\` xu`, inline: true },
                    { name: '⭐ Cấp độ (Level)', value: `Level \`${u.level}\``, inline: true },
                    { name: '✨ Điểm kinh nghiệm', value: `\`${formatNumber(u.xp)} / ${formatNumber(nextXP)}\` XP`, inline: true },
                    { name: '💬 Tin nhắn đã chat', value: `\`${formatNumber(u.messages)}\` tin`, inline: true },
                    { name: '🎙️ Thời gian voice', value: `\`${formatVoiceDuration(u.voiceTime)}\``, inline: true }
                )
                .setFooter({ text: 'Tham gia chat và treo voice để kiếm thêm xu & XP!' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 4. Lệnh .chuyenkhoan / .ck / .pay
        if (cmd === 'chuyenkhoan' || cmd === 'ck' || cmd === 'pay') {
            const target = message.mentions.users.first();
            if (!target) {
                return message.reply('> Vui lòng tag người nhận xu! (VD: `.ck @username 5000`)');
            }
            if (target.id === message.author.id) {
                return message.reply('> Bạn không thể tự chuyển xu cho chính mình!');
            }
            if (target.bot) {
                return message.reply('> Không thể chuyển xu cho Bot!');
            }

            const amountArg = args.find(a => !a.startsWith('<@') && /^\d+$/.test(a.replace(/[^0-9]/g, '')));
            const amount = amountArg ? parseInt(amountArg.replace(/[^0-9]/g, ''), 10) : 0;
            if (!amount || amount < 100) {
                return message.reply('> Số xu chuyển không hợp lệ! Mức tối thiểu là **100 xu**.');
            }

            const sender = db.getUser(message.author.id);
            if (sender.coins < amount) {
                return message.reply(`> Bạn không đủ xu! Hiện bạn có **${formatNumber(sender.coins)} xu**, không đủ để chuyển **${formatNumber(amount)} xu**.`);
            }

            db.updateUser(message.author.id, d => { d.coins -= amount; });
            db.updateUser(target.id, d => { d.coins += amount; });

            const embed = new EmbedBuilder()
                .setTitle('💸 GIAO DỊCH CHUYỂN TIỀN THÀNH CÔNG')
                .setColor(0x2ECC71)
                .addFields(
                    { name: '👤 Người gửi', value: `<@${message.author.id}>`, inline: true },
                    { name: '📥 Người nhận', value: `<@${target.id}>`, inline: true },
                    { name: '🪙 Số xu chuyển', value: `\`${formatNumber(amount)}\` xu`, inline: true },
                    { name: '✨ Số dư còn lại', value: `\`${formatNumber(db.getUser(message.author.id).coins)}\` xu`, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 5. Lệnh .top-xu / .topxu / .top
        if (cmd === 'top-xu' || cmd === 'topxu' || cmd === 'top') {
            const topUsers = db.getTopUsers('coins', 10);
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const list = topUsers.map((u, i) => `${medals[i]} <@${u.id}> — **${formatNumber(u.coins)}** xu (Level ${u.level})`).join('\n') || '*Chưa có dữ liệu.*';

            const embed = new EmbedBuilder()
                .setTitle('🏆 TOP 10 ĐẠI GIA GIÀU NHẤT SERVER')
                .setColor(0xF1C40F)
                .setDescription(list)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 6. Lệnh .rank
        if (cmd === 'rank') {
            const target = message.mentions.users.first() || message.author;
            const u = db.getUser(target.id);
            const nextXP = u.level * 200;

            const embed = new EmbedBuilder()
                .setTitle(`⭐ THẺ THÀNH VIÊN: ${(target.displayName || target.username).toUpperCase()}`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setColor(0x3498DB)
                .addFields(
                    { name: '⭐ Cấp độ (Level)', value: `Level \`${u.level}\``, inline: true },
                    { name: '✨ Điểm kinh nghiệm', value: `\`${formatNumber(u.xp)} / ${formatNumber(nextXP)}\` XP`, inline: true },
                    { name: '🪙 Số dư ví', value: `\`${formatNumber(u.coins)}\` xu`, inline: true },
                    { name: '💬 Tin nhắn đã chat', value: `\`${formatNumber(u.messages)}\` tin`, inline: true },
                    { name: '🎙️ Thời gian voice', value: `\`${formatVoiceDuration(u.voiceTime)}\``, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 7. Lệnh .top-chat / .topchat
        if (cmd === 'top-chat' || cmd === 'topchat') {
            const topUsers = db.getTopUsers('messages', 10);
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const list = topUsers.map((u, i) => `${medals[i]} <@${u.id}> — **${formatNumber(u.messages)}** tin nhắn`).join('\n') || '*Chưa có dữ liệu.*';

            const embed = new EmbedBuilder()
                .setTitle('💬 TOP 10 THÀNH VIÊN CHAT NHIỀU NHẤT')
                .setColor(0x9B59B6)
                .setDescription(list)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 8. Lệnh .top-voice / .topvoice
        if (cmd === 'top-voice' || cmd === 'topvoice') {
            const topUsers = db.getTopUsers('voiceTime', 10);
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
            const list = topUsers.map((u, i) => `${medals[i]} <@${u.id}> — **${formatVoiceDuration(u.voiceTime)}**`).join('\n') || '*Chưa có dữ liệu.*';

            const embed = new EmbedBuilder()
                .setTitle('🎙️ TOP 10 THÀNH VIÊN TREO VOICE LÂU NHẤT')
                .setColor(0x1ABC9C)
                .setDescription(list)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 9. Lệnh .clear / .xoa (Mod/Admin)
        if (cmd === 'clear' || cmd === 'xoa') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return message.reply('> Bạn không có quyền xóa tin nhắn!');
            }
            const count = Math.min(100, Math.max(1, parseInt(args[0], 10) || 10));
            await channel.bulkDelete(count + 1, true).catch(() => {});
            const tempMsg = await channel.send(`> 🧹 Đã xóa sạch **${count}** tin nhắn!`);
            setTimeout(() => tempMsg.delete().catch(() => {}), 4000);
            return;
        }

        // 10. Lệnh .tts
        if (cmd === 'tts') {
            const text = args.join(' ');
            if (!text) {
                return message.reply('> Vui lòng nhập nội dung cần đọc! (VD: `.tts xin chào mọi người`)');
            }
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) {
                return message.reply('> Bạn cần tham gia vào một kênh thoại voice trước!');
            }
            await message.react('🗣️').catch(() => {});
            await speakTTS(voiceChannel, text);
            return;
        }

        // 11. Lệnh .join / .leave
        if (cmd === 'join') {
            const voiceChannel = member.voice.channel;
            if (!voiceChannel) return message.reply('> Bạn phải ở trong một kênh voice!');
            joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator
            });
            return message.reply(`✅ Đã tham gia phòng thoại **${voiceChannel.name}**!`);
        }
        if (cmd === 'leave') {
            const conn = getVoiceConnection(guild.id);
            if (conn) {
                conn.destroy();
                return message.reply('👋 Đã rời khỏi phòng thoại voice!');
            }
            return message.reply('> Bot hiện không ở trong phòng voice nào.');
        }

        // 12. Lệnh .naptien (Admin)
        if (cmd === 'naptien') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
            const target = message.mentions.users.first();
            const amountArg = args.find(a => !a.startsWith('<@') && /^\d+$/.test(a));
            const amount = amountArg ? parseInt(amountArg, 10) : 0;
            if (!target || !amount) {
                return message.reply('> Cú pháp: `.naptien @user [số xu]`');
            }
            db.updateUser(target.id, d => { d.coins += amount; });
            return message.reply(`✅ Đã nạp thành công **+${formatNumber(amount)} xu** cho <@${target.id}>!`);
        }

        // 13. Lệnh .soicau / .thongke / .tk / .sc (Hiển thị biểu đồ 2 tầng Thống Kê Phiên)
        if (cmd === 'soicau' || cmd === 'thongke' || cmd === 'tk' || cmd === 'sc') {
            const h = db.getTxHistory();
            const latest = h[h.length - 1] || {};
            const chartBuf = renderSoiCauChart(h, latest);
            const attachment = new AttachmentBuilder(chartBuf, { name: 'thongke_phien.png' });
            return message.reply({ files: [attachment] });
        }

        // 14. Lệnh .lichsu / .ls (Xem danh sách các phiên gần đây)
        if (cmd === 'lichsu' || cmd === 'ls') {
            const h = db.getTxHistory().slice(-10).reverse();
            if (h.length === 0) {
                return message.reply('> Hiện chưa có lịch sử phiên cược nào được ghi nhận.');
            }

            const lines = h.map((item) => {
                const rTitle = item.roundId ? `Phiên **#${item.roundId}**` : `Ván gần đây`;
                const dStr = (item.d1 && item.d2 && item.d3) ? `(${item.d1} + ${item.d2} + ${item.d3}) = ` : '';
                const outcome = `${item.isTai ? '⚫ TÀI' : '⚪ XỈU'} - ${item.isChan ? '🟣 CHẴN' : '🟡 LẺ'}`;
                return `• ${rTitle}: ${dStr}**${item.total}** ➔ **${outcome}**`;
            });

            const embed = new EmbedBuilder()
                .setTitle('📊 LỊCH SỬ CÁC PHIÊN TÀI XỈU THỰC TẾ GẦN ĐÂY')
                .setColor(0x9B59B6)
                .setDescription(lines.join('\n'))
                .setFooter({ text: 'Gõ .sc hoặc bấm nút "📈 Xem Thống Kê Phiên" trên bàn cược để xem biểu đồ cầu!' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // 15. Lệnh .help / .lenh / .menu
        if (cmd === 'help' || cmd === 'lenh' || cmd === 'menu') {
            const embed = new EmbedBuilder()
                .setTitle('📜 BẢNG LỆNH CÚ PHÁP DẤU CHẤM (.)')
                .setColor(0x2ECC71)
                .setDescription(
                    `▎ **MINIGAMES BÀN CƯỢC**\n` +
                    `• \`.tx\`: Mở bàn cược Tài Xỉu cộng đồng 35s\n` +
                    `• \`.bc\`: Mở bàn cược Bầu Cua Tôm Cá 45s\n` +
                    `• \`.sc\` (hoặc \`.soicau\`, \`.thongke\`): Xem biểu đồ 2 tầng Thống Kê Phiên\n` +
                    `• \`.ls\` (hoặc \`.lichsu\`): Xem danh sách kết quả 10 phiên gần nhất\n\n` +
                    `▎ **KINH TẾ & VÍ TIỀN**\n` +
                    `• \`.bal\` / \`.xu\` / \`.vi\`: Xem số dư ví và level\n` +
                    `• \`.ck @user [số xu]\`: Chuyển xu cho bạn bè\n` +
                    `• \`.top-xu\`: Top 10 đại gia giàu nhất server\n\n` +
                    `▎ **TIỆN ÍCH KHÁC**\n` +
                    `• \`.rank [@user]\`: Thẻ thành viên (Level, XP, Chat, Voice)\n` +
                    `• \`.tts [nội dung]\`: Đọc giọng chị Google vào voice\n` +
                    `• \`.join\` / \`.leave\`: Mời / cho bot rời phòng voice\n` +
                    `• \`.clear [số lượng]\`: Xóa nhanh tin nhắn (Mod/Admin)`
                )
                .setFooter({ text: 'Gõ .tx, .bc, .sc cực kỳ nhanh gọn!' });

            return message.reply({ embeds: [embed] });
        }
    }

    // B. Bỏ qua Quản trị viên và Moderator cho Auto-Mod
    const isStaff = member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                    member.roles.cache.some(r => r.name.toLowerCase().includes('moderator') || r.name.toLowerCase().includes('admin') || r.name.toLowerCase().includes('owner'));

    if (isStaff) return;

    let violationReason = null;
    let autoTimeoutDuration = 0;

    // 1. Chống link mời server Discord lạ (Anti-Invite)
    const inviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
    if (inviteRegex.test(content)) {
        violationReason = 'Gửi liên kết mời Server khác (Anti-Invite)';
    }

    // 2. Chống link lừa đảo / Scam Phishing
    const scamRegex = /(discorcl|dlscord|discord-app|discord-gift|free-nitro|steamcommunlty|steamcommunyt|nitro-free)/i;
    if (!violationReason && scamRegex.test(content)) {
        violationReason = 'Gửi liên kết nghi vấn lừa đảo / Phishing';
        autoTimeoutDuration = 15 * 60 * 1000;
    }

    // 3. Chống Mass Mention (@everyone, @here, hoặc tag quá 4 người)
    if (!violationReason) {
        if (message.mentions.everyone || message.mentions.users.size > 4) {
            violationReason = 'Tag hàng loạt thành viên (Mass Mention)';
            autoTimeoutDuration = 10 * 60 * 1000;
        }
    }

    // 4. Chống Spam / Flood tin nhắn liên tục (quá 5 tin nhắn trong 4 giây)
    if (!violationReason) {
        const now = Date.now();
        const userTimestamps = spamTracker.get(message.author.id) || [];
        const recentTimestamps = userTimestamps.filter(t => now - t < 4000);
        recentTimestamps.push(now);
        spamTracker.set(message.author.id, recentTimestamps);

        if (recentTimestamps.length >= 5) {
            violationReason = 'Spam tin nhắn quá nhanh (Flood)';
            autoTimeoutDuration = 5 * 60 * 1000;
        }
    }

    // 5. Chống ngôn từ thô tục / Toxic / Xúc phạm nặng
    if (!violationReason) {
        const toxicRegex = /\b(đm|đcm|đmm|dcm|đkm|vcl|vcll|clm|lồn|buồi|cặc|địt|đụ m|ngu lồn|súc vật|bắc kỳ|nam kỳ)\b/i;
        if (toxicRegex.test(content)) {
            violationReason = 'Ngôn từ xúc phạm / Không phù hợp';
        }
    }

    // Xử lý vi phạm nếu có
    if (violationReason) {
        try {
            await message.delete();
        } catch (e) {
            console.error('[AUTO-MOD] Không thể xóa tin nhắn:', e.message);
        }

        const warnData = userWarnings.get(message.author.id) || { count: 0, lastWarn: 0 };
        warnData.count += 1;
        warnData.lastWarn = Date.now();
        userWarnings.set(message.author.id, warnData);

        let actionTaken = `Cảnh báo lần ${warnData.count}/3`;

        if (autoTimeoutDuration > 0 || warnData.count >= 2) {
            const timeoutMs = autoTimeoutDuration > 0 ? autoTimeoutDuration : (warnData.count === 2 ? 5 * 60 * 1000 : 60 * 60 * 1000);
            const timeoutMins = Math.round(timeoutMs / 60000);
            try {
                await member.timeout(timeoutMs, `Auto-Mod: ${violationReason}`);
                actionTaken = `Tạm dừng chat (Timeout) ${timeoutMins} phút`;
            } catch (e) {
                console.error('[AUTO-MOD] Lỗi khi timeout member:', e.message);
            }
        }

        try {
            const warnMsg = await channel.send(`⚠️ <@${message.author.id}>, tin nhắn đã bị thu hồi do vi phạm: **${violationReason}** (${actionTaken}).`);
            setTimeout(() => {
                warnMsg.delete().catch(() => {});
            }, 5000);
        } catch (e) {}

        try {
            const modLogCh = guild.channels.cache.find(c => c.name.includes('mod-logs'));
            if (modLogCh) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('〔 CẢNH BÁO VI PHẠM TỰ ĐỘNG 〕')
                    .setColor(0xFF4655)
                    .addFields(
                        { name: '▸ Người vi phạm', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                        { name: '▸ Kênh chat', value: `<#${channel.id}>`, inline: true },
                        { name: '▸ Vi phạm', value: `\`${violationReason}\``, inline: false },
                        { name: '▸ Xử lý', value: `**${actionTaken}** (Tổng cảnh báo: ${warnData.count})`, inline: true },
                        { name: '▸ Nội dung bị chặn', value: `\`\`\`${content ? content.slice(0, 800) : '[Không có nội dung văn bản]'}\`\`\``, inline: false }
                    )
                    .setFooter({ text: 'Community Auto-Moderation' })
                    .setTimestamp();

                await modLogCh.send({ embeds: [logEmbed] });
            }
        } catch (e) {
            console.error('[AUTO-MOD] Lỗi ghi log:', e.message);
        }
    }
});

// ==========================================
// WELCOME & GOODBYE — QUẢN LÝ LÊ
// ==========================================
const WELCOME_CHANNEL_ID = '874584241734819862'; // #chao-mung (system channel)

function buildWelcomeEmbed(member) {
    const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 256 });
    const memberCount = member.guild.memberCount;
    return new EmbedBuilder()
        .setColor(0x2B2D31)
        .setAuthor({ name: 'Quản Lý Lê — Bảo vệ, dắt xe, trông nhà', iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTitle('Chào mừng thành viên mới!')
        .setDescription(
            `Xin chào <@${member.id}>, tôi là Lê, bảo vệ ở đây.\n\n` +
            `Anh/chị vừa bước vào **${member.guild.name}**. Mời đọc nội quy và giữ trật tự nhé.\n` +
            `Có gì cần thì gõ ticket, tôi xem xét.`
        )
        .setThumbnail(avatarUrl)
        .addFields(
            { name: 'Thành viên thứ', value: `**${memberCount}**`, inline: true },
            { name: 'Tài khoản tạo lúc', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Hệ thống quản lý — Jkey và những đứa trẻ' })
        .setTimestamp();
}

function buildGoodbyeEmbed(member) {
    const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 256 });
    const memberCount = member.guild.memberCount;
    return new EmbedBuilder()
        .setColor(0x5C5F66)
        .setAuthor({ name: 'Quản Lý Lê — Bảo vệ, dắt xe, trông nhà', iconURL: member.guild.iconURL({ dynamic: true }) })
        .setTitle('Thành viên đã rời đi')
        .setDescription(
            `**${member.user.tag}** đã rời khỏi server.\n\n` +
            `Tôi đã ghi nhận. Chúc lên đường bình an.`
        )
        .setThumbnail(avatarUrl)
        .addFields(
            { name: 'Còn lại', value: `**${memberCount}** thành viên`, inline: true }
        )
        .setFooter({ text: 'Hệ thống quản lý — Jkey và những đứa trẻ' })
        .setTimestamp();
}

// Event: thành viên mới tham gia
client.on('guildMemberAdd', async (member) => {
    try {
        const ch = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!ch) return;
        await ch.send({ embeds: [buildWelcomeEmbed(member)] });
        console.log(`[WELCOME] ${member.user.tag} vào server.`);
    } catch (e) {
        console.error('[WELCOME] Lỗi:', e.message);
    }
});

// Event: thành viên rời server
client.on('guildMemberRemove', async (member) => {
    try {
        // Partial member: fetch để đảm bảo có đủ user data
        if (member.partial) {
            try { await member.fetch(); } catch (_) {}
        }
        if (!member.user) {
            console.warn('[GOODBYE] Không lấy được user data (partial), bỏ qua.');
            return;
        }
        const ch = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!ch) return;
        await ch.send({ embeds: [buildGoodbyeEmbed(member)] });
        console.log(`[GOODBYE] ${member.user.tag} rời server.`);
    } catch (e) {
        console.error('[GOODBYE] Lỗi:', e.message);
    }
});

// Fallback: b\u1eaft system message type 7 (Discord t\u1ef1 g\u1eedi khi c\u00f3 ng\u01b0\u1eddi join)
// Ho\u1ea1t \u0111\u1ed9ng ngay c\u1ea3 khi ch\u01b0a b\u1eadt GuildMembers intent
client.on('messageCreate', async (message) => {
    try {
        // MessageType.UserJoin = 7
        if (message.type !== 7) return;
        if (message.channelId !== WELCOME_CHANNEL_ID) {
            // Ch\u00faa th\u00f4ng b\u00e1o v\u00e0o \u0111\u00fang channel
            const ch = await message.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
            if (!ch) return;
            const memberCount = message.guild.memberCount;
            const embed = new EmbedBuilder()
                .setColor(0x2B2D31)
                .setAuthor({ name: 'Qu\u1ea3n L\u00fd L\u00ea \u2014 B\u1ea3o v\u1ec7, d\u1eaft xe, tr\u00f4ng nh\u00e0', iconURL: message.guild.iconURL({ dynamic: true }) })
                .setTitle('Ch\u00e0o m\u1eebng th\u00e0nh vi\u00ean m\u1edbi!')
                .setDescription(
                    `Xin ch\u00e0o <@${message.author.id}>, t\u00f4i l\u00e0 L\u00ea, b\u1ea3o v\u1ec7 \u1edf \u0111\u00e2y.\n\n` +
                    `Anh/ch\u1ecb v\u1eeba b\u01b0\u1edbc v\u00e0o **${message.guild.name}**. M\u1eddi \u0111\u1ecdc n\u1ed9i quy v\u00e0 gi\u1eef tr\u1eadt t\u1ef1 nh\u00e9.\n` +
                    `C\u00f3 g\u00ec c\u1ea7n th\u00ec g\u00f5 ticket, t\u00f4i xem x\u00e9t.`
                )
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: 'Th\u00e0nh vi\u00ean th\u1ee9', value: `**${memberCount}**`, inline: true },
                    { name: 'T\u00e0i kho\u1ea3n t\u1ea1o l\u00fac', value: `<t:${Math.floor(message.author.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'H\u1ec7 th\u1ed1ng qu\u1ea3n l\u00fd \u2014 Jkey v\u00e0 nh\u1eefng \u0111\u1ee9a tr\u1ebb' })
                .setTimestamp();
            await ch.send({ embeds: [embed] });
        } else {
            // System message \u0111\u00e3 n\u1eb1m \u0111\u00fang trong WELCOME_CHANNEL_ID, g\u1eedi lu\u00f4n
            const memberCount = message.guild.memberCount;
            const embed = new EmbedBuilder()
                .setColor(0x2B2D31)
                .setAuthor({ name: 'Qu\u1ea3n L\u00fd L\u00ea \u2014 B\u1ea3o v\u1ec7, d\u1eaft xe, tr\u00f4ng nh\u00e0', iconURL: message.guild.iconURL({ dynamic: true }) })
                .setTitle('Ch\u00e0o m\u1eebng th\u00e0nh vi\u00ean m\u1edbi!')
                .setDescription(
                    `Xin ch\u00e0o <@${message.author.id}>, t\u00f4i l\u00e0 L\u00ea, b\u1ea3o v\u1ec7 \u1edf \u0111\u00e2y.\n\n` +
                    `Anh/ch\u1ecb v\u1eeba b\u01b0\u1edbc v\u00e0o **${message.guild.name}**. M\u1eddi \u0111\u1ecdc n\u1ed9i quy v\u00e0 gi\u1eef tr\u1eadt t\u1ef1 nh\u00e9.\n` +
                    `C\u00f3 g\u00ec c\u1ea7n th\u00ec g\u00f5 ticket, t\u00f4i xem x\u00e9t.`
                )
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: 'Th\u00e0nh vi\u00ean th\u1ee9', value: `**${memberCount}**`, inline: true },
                    { name: 'T\u00e0i kho\u1ea3n t\u1ea1o l\u00fac', value: `<t:${Math.floor(message.author.createdTimestamp / 1000)}:R>`, inline: true }
                )
                .setFooter({ text: 'H\u1ec7 th\u1ed1ng qu\u1ea3n l\u00fd \u2014 Jkey v\u00e0 nh\u1eefng \u0111\u1ee9a tr\u1ebb' })
                .setTimestamp();
            await message.channel.send({ embeds: [embed] });
        }
        console.log(`[WELCOME-FALLBACK] ${message.author.tag} v\u00e0o server (qua type-7).`);
    } catch (e) {
        console.error('[WELCOME-FALLBACK] Lỗi:', e.message);
    }
});

// ==========================================
// HỆ THỐNG GIÁM SÁT KẾT NỐI & TỰ ĐỘNG PHỤC HỒI
// ==========================================
client.on('error', err => {
    console.error('[CLIENT ERROR]', err.message);
});

client.on('shardError', (error, shardId) => {
    console.error(`[SHARD ERROR] Shard ${shardId} gặp lỗi:`, error.message);
});

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[SHARD DISCONNECT] Shard ${shardId} ngắt kết nối (code: ${event.code}). Đang chờ tự động reconnect...`);
});

client.on('shardReconnecting', shardId => {
    console.log(`[SHARD RECONNECTING] Shard ${shardId} đang thử kết nối lại Discord Gateway...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[SHARD RESUME] Shard ${shardId} đã phục hồi phiên kết nối (${replayedEvents} sự kiện).`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', err => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});

// Web Healthcheck Server cho Render/Cloud Hosting
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot Discord Online 24/7!');
}).listen(PORT, () => {
    console.log(`[HTTP SERVER] Healthcheck listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
