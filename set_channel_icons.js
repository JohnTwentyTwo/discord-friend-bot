const path = require('path');
const nodeBotDir = 'C:/Users/quang/.gemini/antigravity-ide/scratch/discord-friend-node-bot';
require(path.join(nodeBotDir, 'node_modules/dotenv')).config({ path: path.join(nodeBotDir, '.env') });
const { Client, GatewayIntentBits, REST, Routes } = require(path.join(nodeBotDir, 'node_modules/discord.js'));

const TOKEN = process.env.DISCORD_TOKEN;

// Map channelId -> emoji unicode (for Discord channel icon)
const CHANNEL_ICONS = {
    // THÔNG TIN CHUNG
    '1491016986090672259': '📢', // thông-báo
    '1491018084692267171': '📜', // luật-server
    '1491031007330304112': '🎭', // nhận-vai-trò
    '1529808408260247612': '💰', // ủng-hộ-server
    '1517513396126220378': '🎵', // lệnh-phát-nhạc

    // KHU VỰC TRÒ CHUYỆN
    '1536439301464784926': '💬', // chat-tổng
    '874584241734819864':  '🎶', // yêu-cầu-nhạc
    '1513502714456178700': '🎧', // chia-sẻ-nhạc
    '1494922358925033696': '📚', // học-tập-chia-sẻ
    '1497453510227398666': '🍜', // ăn-uống
    '1490976362952130680': '💭', // chat-không-mic
    '1503033261310349332': '🌙', // tâm-sự-đêm

    // GIAO LƯU CỘNG ĐỒNG
    '1493790380842422292': '🖼️', // hình-ảnh
    '1495539363038236792': '🎬', // phim-ảnh
    '1510295292556214292': '📸', // khoảnh-khắc
    '1489953648325824713': '🎮', // clip-highlight

    // SÒNG BẠC & GIẢI TRÍ
    '1489597337469845544': '🎲', // tài-xỉu-bầu-cua
    '1489646696517341296': '🎡', // quay-số-trúng-thưởng
    '1491402592511594506': '🔤', // đoán-chữ
    '1489607647840698518': '🔒', // nội-tự

    // BAN QUẢN TRỊ
    '1490996178777542776': '⚙️', // cài-đặt-hệ-thống
    '1489596466262446083': '🔐', // nội-bộ-quản-trị
    '1547206199987019869': '🎫', // hỗ-trợ

    // Welcome channels
    '1489596466262446080': '🏠', // welcome-zone
    '874584241734819862':  '🌸', // chào-mừng
};

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    for (const [channelId, emoji] of Object.entries(CHANNEL_ICONS)) {
        try {
            await rest.patch(Routes.channel(channelId), {
                body: { icon: emoji }
            });
            console.log(`[OK]  ${channelId}  ->  ${emoji}`);
        } catch (e) {
            console.error(`[ERR] ${channelId}  ${emoji}  :  ${e.message}`);
        }
        await sleep(500);
    }

    console.log('\nXong!');
    process.exit(0);
}

main();
