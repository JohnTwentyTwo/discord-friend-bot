require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const MOD_LOG_CHANNEL_ID = '1547482017380175872';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    try {
        const guild = await client.guilds.fetch('874584241734819860');
        const channel = await guild.channels.fetch(MOD_LOG_CHANNEL_ID);

        if (!channel) {
            console.error('Không tìm thấy channel mod log');
            process.exit(1);
        }

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setAuthor({
                name: 'Quản Lý Lê — Hệ Thống Nhật Ký Kỷ Luật',
                iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle('🛡️ HỆ THỐNG NHẬT KÝ VI PHẠM & BAN HÀNH ÁN PHẠT')
            .setDescription(
                `Kênh này được thiết lập riêng cho **Ban Quản Trị** để theo dõi, ghi nhận và lưu trữ tự động toàn bộ lịch sử vi phạm nội quy của các thành viên trong server.\n\n` +
                `*Tất cả các hành động kỷ luật (Cảnh cáo, Khóa chat, Trục xuất, Cấm vĩnh viễn) đều được đánh mã hồ sơ (#CASE-XXXX) và lưu trữ vĩnh viễn vào hệ thống.*`
            )
            .addFields(
                {
                    name: '⚖️ CÁC LỆNH KỶ LUẬT DÀNH CHO BAN QUẢN TRỊ',
                    value: (
                        `• \`/warn [user] [ly_do]\`: Cảnh cáo vi phạm (gửi thông báo riêng đến user + lưu án phạt).\n` +
                        `• \`/timeout [user] [thoi_gian] [ly_do]\`: Khóa chat thành viên (10p, 1h, 12h, 1 ngày, 3 ngày, 7 ngày).\n` +
                        `• \`/untimeout [user] [ly_do]\`: Gỡ phạt khóa chat trước hạn.\n` +
                        `• \`/kick [user] [ly_do]\`: Trục xuất thành viên ra khỏi server.\n` +
                        `• \`/ban [user] [ly_do]\`: Cấm vĩnh viễn thành viên khỏi server.\n` +
                        `• \`/unban [user_id] [ly_do]\`: Gỡ cấm cho tài khoản theo ID.\n` +
                        `• \`/lich-su-vi-pham [user]\`: Tra cứu toàn bộ tiền án tiền sự của 1 thành viên.`
                    )
                },
                {
                    name: '🔒 BẢO MẬT KÊNH',
                    value: `Kênh này hoàn toàn được ẩn đối với thành viên thường (@everyone) và chỉ hiển thị đối với Quản Trị Viên.`
                }
            )
            .setFooter({ text: 'Hệ thống Quản Trị • Quản Lý Lê' })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`[MOD-LOG] ✅ Đã gửi Embed hướng dẫn vào #${channel.name}`);
        process.exit(0);
    } catch (e) {
        console.error('[MOD-LOG] Lỗi:', e);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
