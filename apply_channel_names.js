const path = require('path');
const nodeBotDir = 'C:/Users/quang/.gemini/antigravity-ide/scratch/discord-friend-node-bot';
require(path.join(nodeBotDir, 'node_modules/dotenv')).config({ path: path.join(nodeBotDir, '.env') });
const { Client, GatewayIntentBits } = require(path.join(nodeBotDir, 'node_modules/discord.js'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Danh sách tên channel chuẩn:
// - KHÔNG dùng emoji màu (như 💬, 📢, 🎲,...)
// - DÙNG icon ký hiệu đồ họa / Unicode symbols cao cấp (◈, ◆, ◉, ▶, ✦, ❖, ⟡, ⚡, ♫, ⚔, ⚙, 🎫,...)
// - Tiếng Việt đầy đủ dấu
const CHANNEL_UPDATES = {
    // === CHÀO MỪNG / UNTAGGED ===
    '1489596466262446080': '✦-welcome-zone',
    '874584241734819862':  '✦-chào-mừng',

    // === ◈ THÔNG TIN CHUNG ===
    '1491016986090672259': '◈-thông-báo',
    '1491018084692267171': '◈-luật-server',
    '1491031007330304112': '◈-nhận-vai-trò',
    '1529808408260247612': '◈-ủng-hộ-server',
    '1517513396126220378': '◈-lệnh-phát-nhạc',

    // === ◆ KHU VỰC TRÒ CHUYỆN ===
    '1536439301464784926': '◆-chat-tổng',
    '874584241734819864':  '◆-yêu-cầu-nhạc',
    '1513502714456178700': '◆-chia-sẻ-nhạc',
    '1494922358925033696': '◆-học-tập-chia-sẻ',
    '1497453510227398666': '◆-ăn-uống',
    '1490976362952130680': '◆-chat-không-mic',
    '1503033261310349332': '◆-tâm-sự-đêm',

    // === ▶ GIAO LƯU CỘNG ĐỒNG ===
    '1493790380842422292': '▶-hình-ảnh',
    '1495539363038236792': '▶-phim-ảnh',
    '1510295292556214292': '▶-khoảnh-khắc',
    '1489953648325824713': '▶-clip-highlight',

    // === ◈ SÒNG BẠC & GIẢI TRÍ ===
    '1489597337469845544': '❖-tài-xỉu-bầu-cua',
    '1489646696517341296': '❖-quay-số-trúng-thưởng',
    '1491402592511594506': '❖-đoán-chữ',
    '1489607647840698518': '❖-nội-tự',

    // === ║ BAN QUẢN TRỊ ===
    '1490996178777542776': '║-cài-đặt-hệ-thống',
    '1489596466262446083': '║-nội-bộ-quản-trị',
    '1547206199987019869': '║-hỗ-trợ',

    // === ◉ PHÒNG NGHỈ NGƠI (VOICE) ===
    '1493790952769454212': '◉ Phòng Nghỉ Ngơi',
    '1498311668772372551': '◉ Tâm Sự 2 Người',
    '1492208578969210931': '◉ Phòng Yên Tĩnh',

    // === ◉ KÊNH ĐÀM THOẠI (VOICE) ===
    '1505480973402505357': '◉ Phòng Jkey',
    '1495822424766414958': '◉ Phòng Của Nhã',
    '1537639353050861598': '◉ Phòng Đàm Thoại 1',
    '1502971764442005504': '◉ Phòng Tán Gẫu',
    '1522514132858048522': '◉ Phòng Đàm Thoại 2',
    '1535206489206169640': '◉ Phòng Quản Lý Lê',
    '1490731728183230574': '◉ Phòng Nem Chua',
    '1502967102955589692': '◉ Phòng Chém Gió',
    '1527590367799545978': '◉ Phòng Chơi Game 1',
    '1499834136926486761': '◉ Phòng Tự Do',
    '1507296928151507064': '◉ Phòng Chơi Game 2',
    '874584241734819868':  '◉ Chiến Valorant',
    '1530047341699137586': '◉ Góc Học Tiếng Anh',
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

client.once('ready', async () => {
    try {
        console.log(`[RENAME] Bot đăng nhập: ${client.user.tag}`);
        const guild = await client.guilds.fetch('874584241734819860');
        console.log(`[RENAME] Server: ${guild.name}`);

        let count = 0;
        for (const [id, targetName] of Object.entries(CHANNEL_UPDATES)) {
            try {
                const ch = await guild.channels.fetch(id).catch(() => null);
                if (!ch) {
                    console.log(`[SKIP] Không tìm thấy channel: ${id}`);
                    continue;
                }
                if (ch.name === targetName) {
                    console.log(`[SAME] "${ch.name}" đã đúng`);
                    continue;
                }
                const oldName = ch.name;
                await ch.setName(targetName);
                count++;
                console.log(`[OK ${count}] "${oldName}" ➔ "${targetName}"`);
                await sleep(1200);
            } catch (err) {
                console.error(`[ERR] Lỗi đổi channel ${id}:`, err.message);
                await sleep(2000);
            }
        }

        console.log(`\n[HOÀN TẤT] Đã cập nhật xong toàn bộ tên channel!`);
    } catch (e) {
        console.error('[FATAL]', e);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
