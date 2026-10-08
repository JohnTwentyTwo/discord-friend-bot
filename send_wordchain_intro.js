require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('clientReady', async () => {
    try {
        const channel = await client.channels.fetch('1489607647840698518');
        if (!channel) {
            console.error('Channel not found');
            process.exit(1);
        }

        const embed = new EmbedBuilder()
            .setTitle('📖 PHÒNG GAME NỐI TỪ TIẾNG VIỆT (WORD CHAIN)')
            .setColor(0x3498DB)
            .setDescription(
                `Chào mừng toàn thể anh em đến với sảnh game **Nối Từ Tiếng Việt** của server!\n\n` +
                `▎ **LUẬT CHƠI CỰC KỲ ĐƠN GIẢN:**\n` +
                `1. Mỗi lượt, bạn hãy gửi **cụm 2 từ tiếng Việt** có nghĩa bắt đầu bằng từ cuối của người chơi trước.\n` +
                `   *(Ví dụ: Người trước gõ "**sữa mẹ**" ➔ Bạn phải gõ "**mẹ kiếp**" hoặc "**mẹ nuôi**"...)*\n` +
                `2. Không được tự nối từ của chính mình (phải đợi người khác nối một từ rồi mới được nối tiếp).\n` +
                `3. Không lặp lại từ đã được dùng trong vòng **50 lượt gần nhất**.\n` +
                `4. Nếu bạn ra một từ "độc" khiến từ điển **hết sạch từ nối tiếp (Chiếu Tướng)**, bạn sẽ lập tức chiến thắng ván đấu!\n\n` +
                `▎ **PHẦN THƯỞNG HẤP DẪN:**\n` +
                `• Mỗi từ nối chính xác: **+100 xu** & **+15 XP** vào tài khoản.\n` +
                `• Tung đòn "Chiếu Tướng" (làm đối phương bí từ): Thưởng nóng **+500 xu**!\n\n` +
                `▎ **CÁC LỆNH TIỆN ÍCH:**\n` +
                `• \`.noitu\`: Xem từ hiện tại, lượt ai và chuỗi kỷ lục.\n` +
                `• \`.goiy\`: Nhận gợi ý 3 từ khả thi nếu bạn bị bí từ.\n` +
                `• \`.bxh-noitu\`: Bảng xếp hạng cao thủ nối từ nhiều nhất server.\n` +
                `• \`.noitu-reset\`: Khởi động lại ván đấu mới (Admin/Mod).\n\n` +
                `👉 **Ván đấu mới đã sẵn sàng!** Từ mở màn đầu tiên: **HỌC TẬP** ➔ Người tiếp theo hãy nối từ bắt đầu bằng chữ: **TẬP**!`
            )
            .setFooter({ text: 'Quản Lý Lê • Trọng tài Nối Từ Tiếng Việt tự động 24/7' })
            .setTimestamp();

        const sent = await channel.send({ embeds: [embed] });
        await sent.pin().catch(() => null);
        console.log('✅ Đã gửi và ghim Embed giới thiệu vào #❖-nối-từ');
    } catch (e) {
        console.error(e);
    } finally {
        client.destroy();
    }
});

client.login(process.env.DISCORD_TOKEN);
