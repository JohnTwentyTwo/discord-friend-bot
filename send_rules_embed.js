require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const RULES_CHANNEL_ID = '1491018084692267171'; // ◈-luật-server

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
    try {
        console.log(`[BOT] Đăng nhập: ${client.user.tag}`);
        const guild = await client.guilds.fetch('874584241734819860');
        const channel = await guild.channels.fetch(RULES_CHANNEL_ID);

        if (!channel) {
            console.error('Không tìm thấy channel:', RULES_CHANNEL_ID);
            process.exit(1);
        }

        // Xóa tin nhắn thô cũ của vinhber nếu có
        try {
            const oldMsg = await channel.messages.fetch('1511759142619189369').catch(() => null);
            if (oldMsg && oldMsg.deletable) {
                await oldMsg.delete();
                console.log('[RULES] Đã dọn dẹp tin nhắn text thô cũ.');
            }
        } catch (e) {
            console.warn('[RULES] Không xóa được tin nhắn cũ:', e.message);
        }

        // Embed 1: Header & Lời mở đầu
        const headerEmbed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setAuthor({
                name: `Ban Quản Trị — ${guild.name}`,
                iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle('📜 NỘI QUY CHÍNH THỨC — MÁY CHỦ JKEY VÀ NHỮNG ĐỨA TRẺ')
            .setDescription(
                `Chào mừng tất cả anh chị em đã ghé thăm **${guild.name}**!\n\n` +
                `Để tạo dựng một không gian giao lưu, chơi game và giải trí lành mạnh, vui vẻ và văn minh cho mọi thành viên, Ban Quản Trị ban hành bộ quy tắc ứng xử dưới đây.\n` +
                `*Việc bạn sinh hoạt trong server đồng nghĩa với việc bạn đã đọc và đồng ý chấp hành toàn bộ nội quy này.*`
            );

        // Embed 2: Chi tiết 4 điều luật chính
        const bodyEmbed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .addFields(
                {
                    name: '🤝 ĐIỀU 1: VĂN HÓA ỨNG XỬ & GIAO TIẾP',
                    value: (
                        `• **Tôn trọng lẫn nhau:** Đối xử lịch sự, hòa đồng. Không phân biệt vùng miền, tôn giáo, giới tính hay công kích cá nhân.\n` +
                        `• **Nghiêm cấm hành vi ác ý:** Tuyệt đối không đe dọa (DDoS, hack, doxxing lộ thông tin cá nhân), bôi nhọ danh dự người khác.\n` +
                        `• **Kiểm soát ngôn từ:** Hạn chế chửi thề quá mức, không cố tình gây war, khịa đểu hoặc gây mất đoàn kết nội bộ server.`
                    )
                },
                {
                    name: '🚫 ĐIỀU 2: QUY ĐỊNH VỀ NỘI DUNG & TÀI KHOẢN',
                    value: (
                        `• **Cấm nội dung NSFW:** Nghiêm cấm hoàn toàn hình ảnh, clip, văn hóa phẩm đồi trụy, khiêu dâm, bạo lực máu me tại tất cả các kênh công cộng.\n` +
                        `• **An toàn không gian mạng:** Không chia sẻ link lừa đảo (phishing), mã độc, web tặng Nitro giả.\n` +
                        `• **Cấm quảng cáo trái phép:** Không spam tin nhắn rác, không quảng cáo bán hàng hoặc lôi kéo thành viên sang server khác khi chưa có sự đồng ý của BQT.\n` +
                        `• **Hồ sơ thành viên:** Không đặt tên, avatar hoặc biệt danh mang tính chất xúc phạm, khiêu khích hoặc mạo danh người khác.`
                    )
                },
                {
                    name: '🎙️ ĐIỀU 3: NỘI QUY KÊNH THOẠI (VOICE CHANNELS)',
                    value: (
                        `• **Trật tự phòng thoại:** Không hét vào mic, không dùng voice changer gây chói tai, không bật mic rè ảnh hưởng tới người khác.\n` +
                        `• **Tôn trọng chủ phòng:** Trong các phòng voice tự tạo (\`➕・Tạo phòng nhanh\`), vui lòng tôn trọng quyền điều hành của chủ phòng.\n` +
                        `• **Soundboard có chừng mực:** Không spam âm thanh soundboard liên tục gây ức chế khi người khác đang nói chuyện hoặc chơi game.`
                    )
                },
                {
                    name: '⚖️ ĐIỀU 4: CƠ CHẾ XỬ LÝ VI PHẠM & HỖ TRỢ',
                    value: (
                        `Mọi hành vi cố tình vi phạm sẽ được xử lý nghiêm theo cấp độ:\n` +
                        `  🔹 **Mức 1:** Nhắc nhở / Cảnh cáo trực tiếp từ Quản Lý Lê.\n` +
                        `  🔸 **Mức 2:** Tạm khóa chat (Timeout 1h – 24h) hoặc cách ly vai trò.\n` +
                        `  🛑 **Mức 3 (Vi phạm nặng/Tái phạm):** Trục xuất (Kick) hoặc Cấm vĩnh viễn (Ban).\n\n` +
                        `*💡 Khi gặp sự cố hoặc cần khiếu nại, anh em hãy mở ticket tại <#1547206199987019869> (\`║-hỗ-trợ\`) để được hỗ trợ giải quyết.*`
                    )
                }
            )
            .setFooter({
                text: `Hệ thống quản lý • Quản Lý Lê kính báo`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        await channel.send({ embeds: [headerEmbed, bodyEmbed] });
        console.log(`[RULES] ✅ Đã đăng bộ Embed Nội Quy hoàn chỉnh vào #${channel.name}`);
        process.exit(0);
    } catch (err) {
        console.error('[RULES] Lỗi:', err);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
