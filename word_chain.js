const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// Nạp từ điển tiếng Việt
const DICT_PATH = path.join(__dirname, 'vietnamese_dict.json');
let dict = {};
try {
    if (fs.existsSync(DICT_PATH)) {
        dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
        console.log(`[WORD-CHAIN] Đã nạp từ điển: ${Object.keys(dict).length} mục từ`);
    } else {
        console.error('[WORD-CHAIN] Không tìm thấy file vietnamese_dict.json!');
    }
} catch (e) {
    console.error('[WORD-CHAIN] Lỗi khi nạp từ điển:', e);
}

// Danh sách các từ khởi đầu đẹp mắt, phong phú
const STARTER_WORDS = [
    'học tập', 'thành phố', 'phố phường', 'quê hương', 'gia đình',
    'bạn bè', 'công việc', 'phát triển', 'tương lai', 'hy vọng',
    'yêu thương', 'cuộc sống', 'thế giới', 'con người', 'văn hóa',
    'tri thức', 'thành công', 'sáng tạo', 'bình minh', 'mùa xuân',
    'hoa hồng', 'tiếng cười', 'niềm vui', 'chiến thắng', 'bầu trời'
];

/**
 * Kiểm tra xem cụm 2 từ có hợp lệ trong từ điển không
 */
function isValidWord(w1, w2) {
    w1 = w1.toLowerCase().trim();
    w2 = w2.toLowerCase().trim();
    if (!dict[w1]) return false;
    return dict[w1].includes(w2);
}

/**
 * Lấy danh sách từ nối tiếp khả thi
 */
function getFollowUps(word) {
    word = word.toLowerCase().trim();
    return dict[word] || [];
}

/**
 * Lấy từ khởi đầu ngẫu nhiên
 */
function getRandomStarter() {
    // Ưu tiên các từ quen thuộc trong STARTER_WORDS
    const filtered = STARTER_WORDS.filter(w => {
        const parts = w.split(' ');
        return isValidWord(parts[0], parts[1]) && getFollowUps(parts[1]).length >= 5;
    });
    if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
    }
    return 'học tập';
}

/**
 * Khởi tạo hoặc lấy trạng thái game nối từ
 */
function getWordChainState(db) {
    const data = db.saveData ? require('./server_data.json') : {};
    if (!data.wordChain) {
        const starter = getRandomStarter();
        const parts = starter.split(' ');
        data.wordChain = {
            currentWord: starter,
            lastWord: parts[1],
            lastUserId: null,
            streak: 0,
            highStreak: 0,
            usedWords: [starter],
            scores: {}
        };
    }
    return data.wordChain;
}

/**
 * Lưu trạng thái game
 */
function saveWordChainState(state) {
    try {
        const DB_FILE = path.join(__dirname, 'server_data.json');
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            const data = JSON.parse(raw);
            data.wordChain = state;
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }
    } catch (e) {
        console.error('[WORD-CHAIN] Lỗi khi lưu state:', e);
    }
}

/**
 * Xử lý tin nhắn trong kênh Nối Từ
 */
async function handleWordChainMessage(message, db) {
    if (message.author.bot) return;

    const raw = message.content.trim();
    if (!raw) return;

    const state = getWordChainState(db);

    // 1. Lệnh tiện ích: .goiy / .hint
    if (raw.toLowerCase() === '.goiy' || raw.toLowerCase() === '.hint') {
        const followUps = getFollowUps(state.lastWord);
        // Lọc các từ chưa bị sử dụng gần đây
        const recentSet = new Set(state.usedWords.slice(-50).map(w => w.split(' ')[1]));
        const available = followUps.filter(w2 => !recentSet.has(w2));

        if (available.length > 0) {
            const sample = available.slice(0, 3).map(w2 => `\`${state.lastWord} ${w2}\``).join(', ');
            return message.reply(`💡 **Gợi ý từ tiếp theo bắt đầu bằng "${state.lastWord}":** ${sample}`);
        } else {
            return message.reply(`⚠️ Không tìm thấy từ thông dụng nào tiếp theo! Bạn có thể gõ \`.noitu-reset\` để mở ván mới.`);
        }
    }

    // 2. Lệnh xem trạng thái: .noitu / .status
    if (raw.toLowerCase() === '.noitu' || raw.toLowerCase() === '.status') {
        const embed = new EmbedBuilder()
            .setTitle('📖 TRẠNG THÁI PHÒNG NỐI TỪ')
            .setColor(0x3498DB)
            .setDescription(
                `• Từ hiện tại: **${state.currentWord}**\n` +
                `• Từ tiếp theo phải bắt đầu bằng: **${state.lastWord.toUpperCase()}**\n` +
                `• Người vừa nối: ${state.lastUserId ? `<@${state.lastUserId}>` : '*Chưa có*'}\n` +
                `• Chuỗi nối liên tiếp hiện tại: **${state.streak}** từ 🔥\n` +
                `• Kỷ lục server: **${state.highStreak || 0}** từ 🏆\n\n` +
                `*Gõ cụm 2 từ để tiếp tục (Ví dụ: "${state.lastWord} ...")*`
            )
            .setFooter({ text: 'Dùng .goiy nếu bạn bị bí từ | Mỗi từ đúng +100 xu' });
        return message.reply({ embeds: [embed] });
    }

    // 3. Lệnh reset: .noitu-reset (Chỉ Admin / Mod)
    if (raw.toLowerCase() === '.noitu-reset' || raw.toLowerCase() === '.reset-noitu') {
        const newStarter = getRandomStarter();
        const parts = newStarter.split(' ');
        state.currentWord = newStarter;
        state.lastWord = parts[1];
        state.lastUserId = null;
        state.streak = 0;
        state.usedWords = [newStarter];
        saveWordChainState(state);

        return message.reply(`🔄 **ĐÃ KHỞI ĐỘNG LẠI PHÒNG NỐI TỪ!**\n> Từ mở màn mới: **${newStarter}**\n> Người tiếp theo hãy nối từ bắt đầu bằng chữ: **${parts[1].toUpperCase()}**`);
    }

    // 4. Lệnh BXH Nối từ: .bxh-noitu / .top-noitu
    if (raw.toLowerCase() === '.bxh-noitu' || raw.toLowerCase() === '.top-noitu') {
        const scores = Object.entries(state.scores || {})
            .map(([id, count]) => ({ id, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const desc = scores.map((s, i) => `${medals[i]} <@${s.id}> — **${s.count}** từ`).join('\n') || '*Chưa có dữ liệu bảng xếp hạng.*';

        const embed = new EmbedBuilder()
            .setTitle('🏆 BẢNG XẾP HẠNG CAO THỦ NỐI TỪ')
            .setColor(0xF1C40F)
            .setDescription(desc)
            .setFooter({ text: 'Tham gia nối từ chuẩn xác để leo bảng xếp hạng!' });
        return message.reply({ embeds: [embed] });
    }

    // Bỏ qua các lệnh bot khác bắt đầu bằng dấu chấm
    if (raw.startsWith('.')) return;

    // 5. KIỂM TRA ĐỊNH DẠNG TỪ (Phải đúng 2 từ tiếng Việt)
    const cleanText = raw.toLowerCase().replace(/[-_]/g, ' ').replace(/[.,!?;:\"\'\(\)]/g, '').trim();
    const parts = cleanText.split(/\s+/).filter(Boolean);

    if (parts.length !== 2) {
        await message.react('⚠️').catch(() => null);
        return message.reply(`> ⚠️ Cụm từ nối phải gồm **đúng 2 từ tiếng Việt**! Bạn cần nối từ bắt đầu bằng chữ "**${state.lastWord}**" (VD: *${state.lastWord} ...*).`);
    }

    const [w1, w2] = parts;
    const phrase = `${w1} ${w2}`;

    // 6. KIỂM TRA LUẬT TỰ NỐI TỪ CỦA CHÍNH MÌNH
    if (state.lastUserId && message.author.id === state.lastUserId) {
        await message.react('⏳').catch(() => null);
        return message.reply(`> ⏳ <@${message.author.id}>, bạn vừa nối từ trước đó rồi! Hãy nhường lượt cho người khác nối tiếp nhé.`);
    }

    // 7. KIỂM TRA TỪ ĐẦU TIÊN CÓ TRÙNG VỚI TỪ CUỐI CỦA NGƯỜI TRƯỚC KHÔNG
    if (w1 !== state.lastWord.toLowerCase()) {
        await message.react('1547511614323036230').catch(() => message.react('❌').catch(() => null));
        return message.reply(`> <a:mxt_cross_red:1547511614323036230> **Sai chữ nối rồi!** Người trước kết thúc bằng chữ "**${state.lastWord}**", bạn phải nối từ bắt đầu bằng "**${state.lastWord}**" mới đúng.`);
    }

    // 8. KIỂM TRA TỪ CÓ TRONG TỪ ĐIỂN KHÔNG
    if (!isValidWord(w1, w2)) {
        await message.react('1547511614323036230').catch(() => message.react('❓').catch(() => null));
        return message.reply(`> <a:mxt_cross_red:1547511614323036230> Từ "**${phrase}**" không có trong từ điển tiếng Việt hoặc không phải từ ghép hợp lệ! Vui lòng chọn từ khác.`);
    }

    // 9. KIỂM TRA TỪ ĐÃ DÙNG TRONG 50 LƯỢT GẦN ĐÂY CHƯA
    const recentIndex = state.usedWords.indexOf(phrase);
    if (recentIndex !== -1) {
        const turnsAgo = state.usedWords.length - 1 - recentIndex;
        if (turnsAgo < 50) {
            const waitTurns = 50 - turnsAgo;
            await message.react('1547511614323036230').catch(() => message.react('🔁').catch(() => null));
            return message.reply(`> <a:mxt_cross_red:1547511614323036230> Từ "**${phrase}**" đã được sử dụng trong 50 lượt gần đây! Có thể dùng lại sau **${waitTurns}** lượt nữa.`);
        }
    }

    // ==========================================
    // 10. NỐI TỪ HỢP LỆ THÀNH CÔNG!
    // ==========================================
    await message.react('1547511610594173009').catch(() => message.react('✅').catch(() => null));

    state.currentWord = phrase;
    state.lastWord = w2;
    state.lastUserId = message.author.id;
    state.usedWords.push(phrase);
    if (state.usedWords.length > 100) {
        state.usedWords = state.usedWords.slice(-100);
    }
    state.streak += 1;
    if (state.streak > (state.highStreak || 0)) {
        state.highStreak = state.streak;
    }
    if (!state.scores) state.scores = {};
    state.scores[message.author.id] = (state.scores[message.author.id] || 0) + 1;

    // Cộng thưởng cho người chơi: +100 xu & +15 XP
    db.updateUser(message.author.id, u => {
        u.coins += 100;
        u.xp += 15;
    });

    saveWordChainState(state);

    // Kiểm tra xem từ vừa đưa ra có phải "CHIẾU TƯỚNG" (Không còn từ nào nối tiếp được)
    const followUps = getFollowUps(w2);
    if (followUps.length === 0) {
        // Thưởng lớn vì chiếu tướng
        db.updateUser(message.author.id, u => {
            u.coins += 500;
        });

        const newStarter = getRandomStarter();
        const newParts = newStarter.split(' ');
        state.currentWord = newStarter;
        state.lastWord = newParts[1];
        state.lastUserId = null;
        state.streak = 0;
        state.usedWords = [newStarter];
        saveWordChainState(state);

        return message.reply(
            `💥💥 **CHIẾU TƯỚNG!** <@${message.author.id}> đã chốt hạ xuất sắc với từ "**${phrase}**" (Từ điển không còn từ nào bắt đầu bằng "${w2}")!\n` +
            `🎁 Thưởng nóng **+500 xu** cho cao thủ!\n\n` +
            `🔄 **Ván mới bắt đầu!** Từ mở màn: **${newStarter}** ➔ Hãy nối từ chữ: **${newParts[1].toUpperCase()}**`
        );
    }

    // Khen ngợi cột mốc chuỗi dài
    if (state.streak % 25 === 0) {
        return message.channel.send(`🔥 **ĐẲNG CẤP!** Chuỗi nối từ server đã đạt mốc **${state.streak} TỪ LIÊN TIẾP**! Hãy tiếp tục duy trì kỷ lục nào!`);
    }
}

module.exports = {
    isValidWord,
    getFollowUps,
    getRandomStarter,
    getWordChainState,
    saveWordChainState,
    handleWordChainMessage
};
