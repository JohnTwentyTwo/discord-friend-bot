const fs = require('fs');
const path = require('path');
const https = require('https');

const DB_FILE = path.join(__dirname, 'server_data.json');

// Cấu hình Cloudflare D1
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_D1_DB_ID = process.env.CLOUDFLARE_D1_DB_ID || '';

let data = {
    users: {},     // userId -> { coins, lastDaily, xp, level, messages, voiceTime, recentGame }
    giveaways: {}, // messageId -> { channelId, prize, endTime, winnersCount, participants: [] }
    jackpot: 50000000,
    txRoundId: 67412,
    txHistory: [],
    modLogs: [],
    wordChain: null
};

/**
 * Thực thi câu lệnh SQL trên Cloudflare D1 qua REST API
 */
function queryD1(sql, params = []) {
    if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DB_ID) return Promise.resolve(null);
    return new Promise((resolve) => {
        const req = https.request(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DB_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CF_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(d);
                    if (!parsed.success) return resolve(null);
                    resolve(parsed.result[0]);
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.write(JSON.stringify({ sql, params }));
        req.end();
    });
}

// 1. Đọc dữ liệu ban đầu từ local cache
function loadData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.users) data.users = parsed.users;
            if (parsed.giveaways) data.giveaways = parsed.giveaways;
            if (typeof parsed.jackpot === 'number') data.jackpot = parsed.jackpot;
            if (typeof parsed.txRoundId === 'number') data.txRoundId = parsed.txRoundId;
            if (Array.isArray(parsed.txHistory)) data.txHistory = parsed.txHistory;
            if (Array.isArray(parsed.modLogs)) data.modLogs = parsed.modLogs;
            if (parsed.wordChain) data.wordChain = parsed.wordChain;
        }
    } catch (e) {
        console.error('[DB] Lỗi khi đọc dữ liệu cục bộ:', e);
    }
}

// 2. Đồng bộ dữ liệu mới nhất từ Cloudflare D1 khi khởi động
async function syncFromCloudflareD1() {
    try {
        console.log('[D1] 🔄 Đang đồng bộ dữ liệu từ Cloudflare D1 (friend-hub-db)...');

        // Lấy danh sách users
        const usersRes = await queryD1('SELECT * FROM bot_users;');
        if (usersRes && Array.isArray(usersRes.results) && usersRes.results.length > 0) {
            for (const r of usersRes.results) {
                let recentGame = null;
                try { if (r.recent_game) recentGame = JSON.parse(r.recent_game); } catch(e) {}
                data.users[r.id] = {
                    coins: Number(r.coins) || 0,
                    xp: Number(r.xp) || 0,
                    level: Number(r.level) || 1,
                    messages: Number(r.messages) || 0,
                    voiceTime: Number(r.voice_time) || 0,
                    lastDaily: Number(r.last_daily) || 0,
                    recentGame
                };
            }
        }

        // Lấy settings (jackpot, roundId, wordChain)
        const setRes = await queryD1('SELECT * FROM bot_settings;');
        if (setRes && Array.isArray(setRes.results)) {
            for (const r of setRes.results) {
                if (r.key === 'jackpot') data.jackpot = Number(r.value) || data.jackpot;
                if (r.key === 'txRoundId') data.txRoundId = Number(r.value) || data.txRoundId;
                if (r.key === 'wordChain') {
                    try { data.wordChain = JSON.parse(r.value); } catch(e) {}
                }
            }
        }

        // Lấy txHistory
        const txRes = await queryD1('SELECT * FROM bot_tx_history ORDER BY round_id ASC LIMIT 50;');
        if (txRes && Array.isArray(txRes.results) && txRes.results.length > 0) {
            data.txHistory = txRes.results.map(r => ({
                roundId: r.round_id,
                d1: r.d1,
                d2: r.d2,
                d3: r.d3,
                total: r.total,
                isTai: r.is_tai === 1,
                isChan: r.is_chan === 1
            }));
        }

        // Lấy modLogs
        const modRes = await queryD1('SELECT * FROM bot_mod_logs ORDER BY case_id ASC LIMIT 50;');
        if (modRes && Array.isArray(modRes.results) && modRes.results.length > 0) {
            data.modLogs = modRes.results.map(r => ({
                caseId: r.case_id,
                id: r.id_str,
                action: r.action,
                targetId: r.target_id,
                moderatorId: r.moderator_id,
                reason: r.reason,
                duration: r.duration,
                timestamp: r.timestamp
            }));
        }

        // Cập nhật snapshot local
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[D1] 🟢 Đã đồng bộ hoàn tất! Tổng cộng ${Object.keys(data.users).length} users từ Cloudflare D1.`);
    } catch (e) {
        console.error('[D1] Lỗi khi đồng bộ từ Cloudflare D1:', e.message);
    }
}

// 3. Cơ chế Debounced Sync dữ liệu từ RAM lên Cloudflare D1
let isSyncingD1 = false;
let pendingD1Sync = false;
let d1SyncTimer = null;

function scheduleSyncToD1() {
    if (d1SyncTimer) clearTimeout(d1SyncTimer);
    d1SyncTimer = setTimeout(async () => {
        if (isSyncingD1) {
            pendingD1Sync = true;
            return;
        }
        isSyncingD1 = true;
        try {
            // Cập nhật settings
            await queryD1('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?);', ['jackpot', String(data.jackpot)]);
            await queryD1('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?);', ['txRoundId', String(data.txRoundId)]);
            if (data.wordChain) {
                await queryD1('INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?);', ['wordChain', JSON.stringify(data.wordChain)]);
            }

            // Sync users
            for (const [id, u] of Object.entries(data.users)) {
                await queryD1(`
                    INSERT OR REPLACE INTO bot_users (id, coins, xp, level, messages, voice_time, recent_game, last_daily)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                `, [
                    id,
                    u.coins || 0,
                    u.xp || 0,
                    u.level || 1,
                    u.messages || 0,
                    u.voiceTime || 0,
                    u.recentGame ? JSON.stringify(u.recentGame) : null,
                    u.lastDaily || 0
                ]);
            }
        } catch (e) {
            console.error('[D1] Lỗi khi sync lên Cloudflare D1:', e.message);
        } finally {
            isSyncingD1 = false;
            if (pendingD1Sync) {
                pendingD1Sync = false;
                scheduleSyncToD1();
            }
        }
    }, 2500); // Gom nhóm các thay đổi trong 2.5 giây
}

// Lưu dữ liệu vào file cục bộ và đẩy lên Cloudflare D1
function saveData() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
        scheduleSyncToD1();
    } catch (e) {
        console.error('[DB] Lỗi khi ghi dữ liệu:', e);
    }
}

// Lấy hoặc khởi tạo dữ liệu người dùng
function getUser(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            coins: 0,
            lastDaily: 0,
            xp: 0,
            level: 1,
            messages: 0,
            voiceTime: 0,
            recentGame: null
        };
        saveData();
    }
    return data.users[userId];
}

// Cập nhật người dùng
function updateUser(userId, updater) {
    const user = getUser(userId);
    updater(user);
    saveData();
    return user;
}

// Cooldown tích lũy XP chat chống spam (mỗi user chỉ nhận XP tối đa 1 lần mỗi 60 giây)
const messageXpCooldowns = new Map();
const XP_COOLDOWN_MS = 60 * 1000;

// Tính lượng XP cần thiết để đạt cấp tiếp theo (độ dốc tăng theo cấp số mũ, tránh lên cấp dồn dập)
function getNextLevelXP(level) {
    const lvl = Math.max(1, parseInt(level, 10) || 1);
    // Level 1: 1,000 XP | Level 2: 2,740 XP | Level 3: 5,110 XP | Level 5: 11,550 XP | Level 10: 36,430 XP
    return Math.floor(500 * Math.pow(lvl, 1.8) + 500 * lvl);
}

// Tích lũy tin nhắn & XP (Có Cooldown 60s và thưởng xu khi thăng cấp)
function addMessageXP(userId) {
    const user = getUser(userId);
    user.messages = (user.messages || 0) + 1;

    const now = Date.now();
    const lastXpTime = messageXpCooldowns.get(userId) || 0;

    // Nếu chưa đủ thời gian dãn cách 60 giây, chỉ tính số lượng tin nhắn, không cộng XP
    if (now - lastXpTime < XP_COOLDOWN_MS) {
        saveData();
        return { user, leveledUp: false, rewardCoins: 0 };
    }

    messageXpCooldowns.set(userId, now);
    const earnedXP = Math.floor(Math.random() * 11) + 15; // 15 - 25 XP mỗi phút
    user.xp = (user.xp || 0) + earnedXP;

    let leveledUp = false;
    let totalReward = 0;

    while (user.xp >= getNextLevelXP(user.level)) {
        user.level = (user.level || 1) + 1;
        leveledUp = true;
        // Thưởng xu xứng đáng khi vượt mốc khó: mỗi level thưởng level * 2,000 xu
        const reward = user.level * 2000;
        user.coins = (user.coins || 0) + reward;
        totalReward += reward;
    }

    saveData();
    return { user, leveledUp, rewardCoins: totalReward };
}

// Cộng thời gian voice
function addVoiceTime(userId, seconds) {
    const user = getUser(userId);
    user.voiceTime = (user.voiceTime || 0) + seconds;
    user.xp = (user.xp || 0) + Math.floor(seconds / 60) * 5;

    let leveledUp = false;
    let totalReward = 0;
    while (user.xp >= getNextLevelXP(user.level)) {
        user.level = (user.level || 1) + 1;
        leveledUp = true;
        const reward = user.level * 2000;
        user.coins = (user.coins || 0) + reward;
        totalReward += reward;
    }

    saveData();
    return { user, leveledUp, rewardCoins: totalReward };
}

// Lấy Top BXH
function getTopUsers(field, limit = 10) {
    return Object.entries(data.users)
        .map(([id, u]) => ({ id, ...u }))
        .sort((a, b) => (b[field] || 0) - (a[field] || 0))
        .slice(0, limit);
}

// Giveaway helpers
function createGiveaway(messageId, giveawayData) {
    data.giveaways[messageId] = giveawayData;
    saveData();
}

function getGiveaway(messageId) {
    return data.giveaways[messageId];
}

function deleteGiveaway(messageId) {
    delete data.giveaways[messageId];
    saveData();
}

function getAllActiveGiveaways() {
    return data.giveaways;
}

// Jackpot (Nổ Hũ)
function getJackpot() {
    if (typeof data.jackpot !== 'number') data.jackpot = 50000000;
    return data.jackpot;
}

function addJackpot(amount) {
    if (typeof data.jackpot !== 'number') data.jackpot = 50000000;
    data.jackpot += Math.max(0, Math.floor(amount));
    saveData();
    return data.jackpot;
}

function resetJackpot(baseAmount = 50000000) {
    data.jackpot = baseAmount;
    saveData();
    return data.jackpot;
}

// Tài Xỉu Round & History
function getTxRoundId() {
    if (typeof data.txRoundId !== 'number') data.txRoundId = 67433;
    return data.txRoundId;
}

function nextTxRoundId() {
    if (typeof data.txRoundId !== 'number') data.txRoundId = 67433;
    data.txRoundId += 1;
    saveData();
    return data.txRoundId;
}

function getTxHistory() {
    if (!Array.isArray(data.txHistory)) data.txHistory = [];
    return data.txHistory;
}

function addTxHistory(record) {
    if (!Array.isArray(data.txHistory)) data.txHistory = [];
    data.txHistory.push(record);
    if (data.txHistory.length > 50) {
        data.txHistory = data.txHistory.slice(-50);
    }
    saveData();

    // Sync nhanh phiên vào Cloudflare D1
    if (record.roundId) {
        queryD1(`
            INSERT OR REPLACE INTO bot_tx_history (round_id, d1, d2, d3, total, is_tai, is_chan)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        `, [
            record.roundId,
            record.d1 || null,
            record.d2 || null,
            record.d3 || null,
            record.total || 10,
            record.isTai ? 1 : 0,
            record.isChan ? 1 : 0
        ]).catch(() => null);
    }

    return data.txHistory;
}

// Mod Logs & Quản Lý Kỷ Luật
function addModLog(logEntry) {
    if (!Array.isArray(data.modLogs)) data.modLogs = [];
    const caseId = data.modLogs.length + 1;
    const entry = {
        caseId,
        id: `CASE-${String(caseId).padStart(4, '0')}`,
        timestamp: Date.now(),
        ...logEntry
    };
    data.modLogs.push(entry);
    saveData();

    // Ghi trực tiếp án phạt vào Cloudflare D1
    queryD1(`
        INSERT OR REPLACE INTO bot_mod_logs (case_id, id_str, action, target_id, moderator_id, reason, duration, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `, [
        entry.caseId,
        entry.id,
        entry.action || 'WARN',
        entry.targetId || '',
        entry.moderatorId || '',
        entry.reason || '',
        entry.duration || null,
        entry.timestamp
    ]).catch(() => null);

    return entry;
}

function getModLogs(limit = 20) {
    if (!Array.isArray(data.modLogs)) data.modLogs = [];
    return data.modLogs.slice(-limit).reverse();
}

function getUserWarnings(userId) {
    if (!Array.isArray(data.modLogs)) return [];
    return data.modLogs.filter(l => l.targetId === userId);
}

// Ghi nhận biến động thắng thua gần đây của người chơi
function recordGameResult(userId, { net, game }) {
    const user = getUser(userId);
    user.recentGame = {
        net: Number(net) || 0,
        game: game || 'Tài Xỉu',
        timestamp: Date.now()
    };
    saveData();
    return user;
}

// Khởi chạy
loadData();
syncFromCloudflareD1();

module.exports = {
    getUser,
    updateUser,
    recordGameResult,
    addMessageXP,
    getNextLevelXP,
    addVoiceTime,
    getTopUsers,
    createGiveaway,
    getGiveaway,
    deleteGiveaway,
    getAllActiveGiveaways,
    getJackpot,
    addJackpot,
    resetJackpot,
    getTxRoundId,
    nextTxRoundId,
    getTxHistory,
    addTxHistory,
    addModLog,
    getModLogs,
    getUserWarnings,
    saveData,
    syncFromCloudflareD1,
    queryD1
};
