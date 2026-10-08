require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const ANNOUNCEMENT_CHANNEL_ID = '1491016986090672259'; // ◈-thông-báo

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    try {
        console.log(`[BOT] Đăng nhập: ${client.user.tag}`);
        const guild = await client.guilds.fetch('874584241734819860');
        const channel = await guild.channels.fetch(ANNOUNCEMENT_CHANNEL_ID);

        if (!channel) {
            console.error('Không tìm thấy channel:', ANNOUNCEMENT_CHANNEL_ID);
            process.exit(1);
        }

        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setAuthor({
                name: 'Quản Lý Lê — Bảo vệ, dắt xe, trông nhà kiêm quản gia server',
                iconURL: guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle('📢 THÔNG BÁO QUẢN LÝ: NÂNG CẤP TIỆN ÍCH SERVER')
            .setDescription(
                `Chào toàn thể anh chị em trong **${guild.name}**,\n\n` +
                `Tôi là **Lê**, bảo vệ trực ban tại server. Dạo này thấy anh em ghé chơi đông vui, ban quản lý đã phê duyệt và cho triển khai một loạt tiện ích mới nhằm phục vụ anh em chu đáo và mượt mà hơn.`
            )
            .addFields(
                {
                    name: '🏢 1. HỆ THỐNG TRỰC XUYÊN SUỐT 24/7',
                    value: (
                        `• Từ nay tôi túc trực ngày đêm không nghỉ ca.\n` +
                        `• Bất kể anh em thức khuya cày game, tâm sự đêm muộn hay cờ bạc sáng sớm thì hệ thống vẫn luôn sẵn sàng phục vụ, hoàn toàn không lo gián đoạn hay mất kết nối.`
                    )
                },
                {
                    name: '🎙️ 2. PHÒNG THOẠI TỰ ĐỘNG (JOIN-TO-CREATE)',
                    value: (
                        `Tại danh mục **\`◉ KÊNH ĐÀM THOẠI\`**, tôi vừa bố trí thêm kênh **\`➕・Tạo phòng nhanh\`**:\n` +
                        `• **Vào là có phòng:** Nhảy vào kênh này, hệ thống sẽ tự cấp ngay một phòng voice riêng mang tên anh em và tự chuyển anh em sang đó.\n` +
                        `• **Bảng điều khiển riêng:** Trong khung chat của phòng có sẵn các nút bấm:\n` +
                        `  - 🔒 **Khóa / Mở:** Ngăn người ngoài vào phòng khi cần bàn chuyện riêng.\n` +
                        `  - 👥 **Giới hạn số lượng:** Chỉnh phòng 2 người, 4–6 người hoặc thả ga.\n` +
                        `  - ✏️ **Đổi tên:** Đặt tên phòng theo sở thích.\n` +
                        `• **Tự dọn dẹp:** Khi mọi người nói chuyện xong và giải tán, phòng sẽ tự động biến mất để server luôn ngăn nắp.`
                    )
                },
                {
                    name: '🎲 3. NÂNG CẤP SÒNG BẠC & GIẢI TRÍ',
                    value: (
                        `Khu vực **Tài Xỉu & Bầu Cua** tại kênh <#1489597337469845544> cũng vừa được đại tu:\n` +
                        `• **Hiệu ứng xóc đĩa mới:** Mỗi ván kết thúc sẽ có hình ảnh lắc bát và mở nắp trực diện cực kỳ hồi hộp, hiển thị rõ ràng xúc xắc rồi mới trả thưởng.\n` +
                        `• **Cú pháp nhanh gọn:**\n` +
                        `  - Gõ \`.tx\` để mở bàn Tài Xỉu, \`.bc\` để mở bàn Bầu Cua.\n` +
                        `  - Gõ \`.sc\` để xem biểu đồ soi cầu 2 tầng phục vụ các chuyên gia tính cầu.`
                    )
                },
                {
                    name: '📌 LỜI NHẮC TỪ QUẢN LÝ',
                    value: `Chúc anh chị em có những giờ phút sinh hoạt, chơi game và giao lưu vui vẻ. Nhớ giữ gìn trật tự và chấp hành nội quy chung của server!`
                }
            )
            .setFooter({
                text: `Hệ thống quản lý • ${guild.name}`,
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

        const sentMessage = await channel.send({ embeds: [embed] });
        console.log(`[ANNOUNCEMENT] ✅ Đã gửi thành công Embed vào #${channel.name} (${sentMessage.id})`);
        process.exit(0);
    } catch (err) {
        console.error('[ANNOUNCEMENT] Lỗi:', err);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
