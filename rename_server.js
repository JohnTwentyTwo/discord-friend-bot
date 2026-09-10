const path = require('path');
const nodeBotDir = 'C:/Users/quang/.gemini/antigravity-ide/scratch/discord-friend-node-bot';
require(path.join(nodeBotDir, 'node_modules/dotenv')).config({ path: path.join(nodeBotDir, '.env') });
const { Client, GatewayIntentBits } = require(path.join(nodeBotDir, 'node_modules/discord.js'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Tên channel: tiếng Việt có dấu, KHÔNG emoji, dùng Unicode symbol nếu cần
const CHANNEL_NAMES = {
    // Uncategorized
    '1489596466262446080': 'welcome-zone',
    '874584241734819862':  'chào-mừng',

    // ◈ THÔNG TIN CHUNG
    '1491016986090672259': 'thông-báo',
    '1491018084692267171': 'luật-server',
    '1491031007330304112': 'nhận-vai-trò',
    '1529808408260247612': 'ủng-hộ-server',
    '1517513396126220378': 'lệnh-phát-nhạc',

    // ◆ KHU VỰC TRÒ CHUYỆN
    '1536439301464784926': 'chat-tổng',
    '874584241734819864':  'yêu-cầu-nhạc',
    '1513502714456178700': 'chia-sẻ-nhạc',
    '1494922358925033696': 'học-tập-chia-sẻ',
    '1497453510227398666': 'ăn-uống',
    '1490976362952130680': 'chat-không-mic',
    '1503033261310349332': 'tâm-sự-đêm',

    // ▶ GIAO LƯU CỘNG ĐỒNG
    '1493790380842422292': 'hình-ảnh',
    '1495539363038236792': 'phim-ảnh',
    '1510295292556214292': 'khoảnh-khắc',
    '1489953648325824713': 'clip-highlight',

    // ◈ SÒNG BẠC & GIẢI TRÍ
    '1489597337469845544': 'tài-xỉu-bầu-cua',
    '1489646696517341296': 'quay-số-trúng-thưởng',
    '1491402592511594506': 'đoán-chữ',
    '1489607647840698518': 'nội-tự',

    // ◉ PHÒNG NGHỈ NGƠI (Voice)
    '1493790952769454212': '◉ Phòng Nghỉ Ngơi',
    '1498311668772372551': '◉ Tâm Sự 2 Người',
    '1492208578969210931': '◉ Phòng Yên Tĩnh',

    // ◉ KÊNH ĐÀM THOẠI (Voice)
    '1505480973402505357': '◉ Phòng Jkey',
    '1495822424766414958': '◉ Phòng Của Nhà',
    '1537639353050861598': '◉ Phòng Đàm Thoại 1',
    '1502971764442005504': '◉ Phòng Tán Gẫu',
    '1522514132858048522': '◉ Phòng Đàm Thoại 2',
    '1535206489206169640': '◉ Phòng Quản Lý Lê',
    '1490731728183230574': '◉ Phòng Ném Chua',
    '1502967102955589692': '◉ Phòng Chém Gió',
    '1527590367799545978': '◉ Phòng Chơi Game 1',
    '1499834136926486761': '◉ Phòng Tự Do',
    '1507296928151507064': '◉ Phòng Chơi Game 2',
    '874584241734819868':  '◉ Chiến Valorant',
    '1530047341699137586': '◉ Góc Học Tiếng Anh',

    // ║ BAN QUẢN TRỊ
    '1490996178777542776': 'cài-đặt-hệ-thống',
    '1489596466262446083': 'nội-bộ-quản-trị',
    '1547206199987019869': 'hỗ-trợ',
};

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.get('874584241734819860') || client.guilds.cache.first();
        console.log(`\nServer: ${guild.name}\n`);

        for (const [id, newName] of Object.entries(CHANNEL_NAMES)) {
            const ch = await guild.channels.fetch(id).catch(() => null);
            if (!ch) { console.log(`  [SKIP] ${id}`); continue; }
            if (ch.name === newName) { console.log(`  [OK]   ${newName}`); continue; }
            console.log(`  [→]    "${ch.name}"  →  "${newName}"`);
            await ch.setName(newName).catch(e => console.error(`  [ERR]  ${e.message}`));
            await sleep(600);
        }

        console.log('\n✅ Hoàn tất!');
    } catch (e) { console.error('Lỗi:', e); }
    finally { process.exit(0); }
});

client.login(process.env.DISCORD_TOKEN);
