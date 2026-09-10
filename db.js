const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'server_data.json');

let data = {
    users: {},     // userId -> { coins, lastDaily, xp, level, messages, voiceTime }
    giveaways: {}, // messageId -> { channelId, prize, endTime, winnersCount, participants: [] }
    jackpot: 50000 // Quỹ Nổ Hũ Tài Xỉu tích lũy
};

// Đọc dữ liệu từ file
function loadData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            data = JSON.parse(raw);
            if (!data.users) data.users = {};
            if (!data.giveaways) data.giveaways = {};
            if (typeof data.jackpot !== 'number') data.jackpot = 696546956;
            if (typeof data.txRoundId !== 'number') data.txRoundId = 67412;
            if (!Array.isArray(data.modLogs)) data.modLogs = [];
            if (!Array.isArray(data.txHistory) || data.txHistory.length === 0) {
                data.txHistory = [
                    { total: 8, isTai: false, isChan: true },
                    { total: 10, isTai: false, isChan: true },
                    { total: 13, isTai: true, isChan: false },
                    { total: 15, isTai: true, isChan: false },
                    { total: 11, isTai: true, isChan: false },
                    { total: 6, isTai: false, isChan: true },
                    { total: 7, isTai: false, isChan: false },
                    { total: 14, isTai: true, isChan: true },
                    { total: 12, isTai: true, isChan: true },
                    { total: 11, isTai: true, isChan: false },
                    { total: 14, isTai: true, isChan: true },
                    { total: 9, isTai: false, isChan: false },
                    { total: 12, isTai: true, isChan: true },
                    { total: 16, isTai: true, isChan: true },
                    { total: 5, isTai: false, isChan: false },
                    { total: 8, isTai: false, isChan: true },
                    { total: 13, isTai: true, isChan: false },
                    { total: 7, isTai: false, isChan: false },
                    { total: 9, isTai: false, isChan: false },
                    { total: 6, isTai: false, isChan: true }
                ];
            }
        } else {
            saveData();
        }
    } catch (e) {
        console.error('[DB] Lỗi khi đọc dữ liệu:', e);
    }
}

// Lưu dữ liệu vào file
function saveData() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('[DB] Lỗi khi ghi dữ liệu:', e);
    }
}

// Lấy hoặc khởi tạo dữ liệu người dùng
function getUser(userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            coins: 0,             // Mặc định 0 xu (chỉ Admin mới có quyền nạp tiền)
            lastDaily: 0,
            xp: 0,
            level: 1,
            messages: 0,
            voiceTime: 0          // tính theo giây
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

// Tích lũy tin nhắn & XP
function addMessageXP(userId) {
    const user = getUser(userId);
    user.messages += 1;
    user.xp += Math.floor(Math.random() * 10) + 15; // 15 - 25 XP mỗi tin

    const nextLevelXP = user.level * 200;
    let leveledUp = false;
    if (user.xp >= nextLevelXP) {
        user.level += 1;
        leveledUp = true;
    }
    saveData();
    return { user, leveledUp };
}

// Cộng thời gian voice
function addVoiceTime(userId, seconds) {
    const user = getUser(userId);
    user.voiceTime += seconds;
    user.xp += Math.floor(seconds / 60) * 5; // 5 XP mỗi phút voice
    saveData();
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
    if (typeof data.jackpot !== 'number') data.jackpot = 50000;
    return data.jackpot;
}

function addJackpot(amount) {
    if (typeof data.jackpot !== 'number') data.jackpot = 50000;
    data.jackpot += Math.max(0, Math.floor(amount));
    saveData();
    return data.jackpot;
}

function resetJackpot(baseAmount = 10000) {
    data.jackpot = baseAmount;
    saveData();
    return data.jackpot;
}

// Tài Xỉu Round & History
function getTxRoundId() {
    if (typeof data.txRoundId !== 'number') data.txRoundId = 67412;
    return data.txRoundId;
}

function nextTxRoundId() {
    if (typeof data.txRoundId !== 'number') data.txRoundId = 67412;
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

loadData();

module.exports = {
    getUser,
    updateUser,
    addMessageXP,
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
    saveData
};

