const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('vi-VN');
}

function formatShortNumber(num) {
    const abs = Math.abs(Number(num) || 0);
    const sign = Number(num) < 0 ? '-' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2).replace(/\.00$/, '') + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return sign + formatNumber(abs);
}

/**
 * Vẽ icon đồng xu vàng 3D bằng Canvas vector
 */
function drawCoinIcon(ctx, x, y, r = 11) {
    ctx.save();
    // Vành ngoài
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    grad.addColorStop(0, '#FDE047');
    grad.addColorStop(0.5, '#EAB308');
    grad.addColorStop(1, '#CA8A04');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Viền kim loại
    ctx.strokeStyle = '#FEF08A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Vành trong
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = '#A16207';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chữ C / $ ở giữa
    ctx.fillStyle = '#78350F';
    ctx.font = `bold ${Math.round(r * 1.1)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x, y + 1);

    ctx.restore();
}

/**
 * Vẽ huy hiệu Hạng 1, 2, 3 độc quyền
 */
function drawRankBadge(ctx, x, y, rankIndex) {
    ctx.save();
    const w = 48;
    const h = 28;
    const rx = x - w / 2;
    const ry = y - h / 2;

    if (rankIndex === 0) {
        // TOP 1 - VÀNG HOÀNG GIA
        const grad = ctx.createLinearGradient(rx, ry, rx + w, ry + h);
        grad.addColorStop(0, '#F59E0B');
        grad.addColorStop(1, '#D97706');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(rx, ry, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = '#FEF08A';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#451A03';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOP 1', x, y);
    } else if (rankIndex === 1) {
        // TOP 2 - BẠC ÁNH KIM
        const grad = ctx.createLinearGradient(rx, ry, rx + w, ry + h);
        grad.addColorStop(0, '#E2E8F0');
        grad.addColorStop(1, '#94A3B8');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(rx, ry, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOP 2', x, y);
    } else if (rankIndex === 2) {
        // TOP 3 - ĐỒNG
        const grad = ctx.createLinearGradient(rx, ry, rx + w, ry + h);
        grad.addColorStop(0, '#FB923C');
        grad.addColorStop(1, '#C2410C');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(rx, ry, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = '#FED7AA';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#431407';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TOP 3', x, y);
    } else {
        // TOP 4 - 10
        ctx.fillStyle = '#64748B';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rankIndex + 1}`, x, y);
    }
    ctx.restore();
}

/**
 * Render bảng xếp hạng Top 10 Đại gia kèm biến động gần đây
 * @param {Array} topUsers - Danh sách top users từ db
 * @param {Object} extraInfo - Thông tin bổ sung (jackpot, serverName)
 * @returns {Promise<Buffer>}
 */
async function renderLeaderboardImage(topUsers, extraInfo = {}) {
    const width = 1000;
    const rowHeight = 66;
    const gap = 12;
    const startY = 160;
    const rowCount = Math.min(topUsers.length, 10);
    const height = startY + rowCount * (rowHeight + gap) + 65;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. NỀN CHÍNH (Dark Luxury Casino Theme)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, '#090D16');
    bgGrad.addColorStop(0.5, '#0F172A');
    bgGrad.addColorStop(1, '#06090F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Hiệu ứng ánh sáng nền (Glow orbs)
    const topGlow = ctx.createRadialGradient(220, 80, 10, 220, 80, 340);
    topGlow.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
    topGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, 650, 300);

    const bottomGlow = ctx.createRadialGradient(width - 150, height - 100, 10, width - 150, height - 100, 350);
    bottomGlow.addColorStop(0, 'rgba(59, 130, 246, 0.14)');
    bottomGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(width - 600, height - 400, 600, 400);

    // Đường lưới tinh tế (Subtle tech grid)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // 2. HEADER
    // Crown Star icon bằng vector
    ctx.save();
    ctx.shadowColor = 'rgba(245, 158, 11, 0.7)';
    ctx.shadowBlur = 22;
    drawCoinIcon(ctx, 68, 62, 18);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText('BẢNG XẾP HẠNG PHÚ HÀO', 100, 72);
    ctx.restore();

    // Subtitle
    ctx.fillStyle = '#94A3B8';
    ctx.font = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Top 10 thành viên sở hữu tài sản khủng nhất & biến động thắng thua gần đây', 102, 98);

    // Chips thông tin bên phải header
    const chipY = 48;
    if (extraInfo.jackpot) {
        const jText = `Hũ Thần Tài: ${formatShortNumber(extraInfo.jackpot)} xu`;
        ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
        const jWidth = ctx.measureText(jText).width + 42;
        const jX = width - 50 - jWidth;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
        ctx.beginPath();
        ctx.roundRect(jX, chipY, jWidth, 34, 17);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        drawCoinIcon(ctx, jX + 20, chipY + 17, 8);
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(jText, jX + 34, chipY + 22);
    }

    // Đường kẻ phân cách Header
    const lineGrad = ctx.createLinearGradient(50, 125, width - 50, 125);
    lineGrad.addColorStop(0, 'rgba(245, 158, 11, 0.85)');
    lineGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.5)');
    lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, 125);
    ctx.lineTo(width - 50, 125);
    ctx.stroke();

    // Tiêu đề các cột nhỏ
    ctx.fillStyle = '#64748B';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HẠNG', 65, 148);
    ctx.fillText('THÀNH VIÊN', 170, 148);
    ctx.fillText('SỐ DƯ TÀI KHOẢN (BALANCE)', 460, 148);
    ctx.fillText('BIẾN ĐỘNG GẦN ĐÂY', width - 260, 148);

    // 3. RENDER TỪNG HÀNG
    for (let i = 0; i < rowCount; i++) {
        const user = topUsers[i];
        const y = startY + i * (rowHeight + gap);
        const cardX = 50;
        const cardW = width - 100;

        let cardBg, cardBorder, rankColor;
        if (i === 0) {
            const g = ctx.createLinearGradient(cardX, y, cardX + cardW, y);
            g.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
            g.addColorStop(0.5, 'rgba(217, 119, 6, 0.12)');
            g.addColorStop(1, 'rgba(245, 158, 11, 0.04)');
            cardBg = g;
            cardBorder = 'rgba(245, 158, 11, 0.85)';
            rankColor = '#F59E0B';
        } else if (i === 1) {
            const g = ctx.createLinearGradient(cardX, y, cardX + cardW, y);
            g.addColorStop(0, 'rgba(203, 213, 225, 0.2)');
            g.addColorStop(0.5, 'rgba(148, 163, 184, 0.1)');
            g.addColorStop(1, 'rgba(203, 213, 225, 0.03)');
            cardBg = g;
            cardBorder = 'rgba(203, 213, 225, 0.75)';
            rankColor = '#E2E8F0';
        } else if (i === 2) {
            const g = ctx.createLinearGradient(cardX, y, cardX + cardW, y);
            g.addColorStop(0, 'rgba(217, 119, 6, 0.2)');
            g.addColorStop(0.5, 'rgba(180, 83, 9, 0.09)');
            g.addColorStop(1, 'rgba(217, 119, 6, 0.03)');
            cardBg = g;
            cardBorder = 'rgba(249, 115, 22, 0.75)';
            rankColor = '#FB923C';
        } else {
            cardBg = 'rgba(17, 24, 39, 0.65)';
            cardBorder = 'rgba(55, 65, 81, 0.5)';
            rankColor = '#94A3B8';
        }

        // Vẽ hộp Card
        ctx.beginPath();
        ctx.roundRect(cardX, y, cardW, rowHeight, 14);
        ctx.fillStyle = cardBg;
        ctx.fill();
        ctx.strokeStyle = cardBorder;
        ctx.lineWidth = i < 3 ? 1.6 : 1;
        ctx.stroke();

        // 3.1 Huy hiệu Hạng
        drawRankBadge(ctx, cardX + 38, y + rowHeight / 2, i);

        // 3.2 Avatar (Tải ảnh hoặc vẽ fallback)
        const avX = cardX + 76;
        const avY = y + (rowHeight - 44) / 2;
        const avR = 22;

        ctx.save();
        ctx.beginPath();
        ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2);
        ctx.clip();

        let avatarDrawn = false;
        if (user.avatarURL) {
            try {
                const avImg = await loadImage(user.avatarURL);
                ctx.drawImage(avImg, avX, avY, avR * 2, avR * 2);
                avatarDrawn = true;
            } catch (err) {
                avatarDrawn = false;
            }
        }

        if (!avatarDrawn) {
            const avGrad = ctx.createLinearGradient(avX, avY, avX + avR * 2, avY + avR * 2);
            avGrad.addColorStop(0, i === 0 ? '#F59E0B' : '#3B82F6');
            avGrad.addColorStop(1, i === 0 ? '#B45309' : '#1E3A8A');
            ctx.fillStyle = avGrad;
            ctx.fillRect(avX, avY, avR * 2, avR * 2);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const initial = (user.displayName || user.username || 'U').charAt(0).toUpperCase();
            ctx.fillText(initial, avX + avR, avY + avR);
        }
        ctx.restore();

        // Viền Avatar
        ctx.beginPath();
        ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2);
        ctx.strokeStyle = i < 3 ? rankColor : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // 3.3 Tên & Cấp độ
        const nameX = cardX + 134;
        const name = (user.displayName || user.username || `User ${user.id.slice(0, 6)}`);
        let shortName = name;
        if (shortName.length > 16) shortName = shortName.slice(0, 15) + '…';

        ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = i === 0 ? '#FEF08A' : '#F8FAFC';
        ctx.textBaseline = 'middle';
        ctx.fillText(shortName, nameX, y + rowHeight / 2 - 10);

        // Level Pill badge
        const lvlText = `Lv.${user.level || 1}`;
        ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
        const lvlW = ctx.measureText(lvlText).width + 12;
        const lvlY = y + rowHeight / 2 + 5;

        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.beginPath();
        ctx.roundRect(nameX, lvlY, lvlW, 18, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = '#93C5FD';
        ctx.fillText(lvlText, nameX + 6, lvlY + 13);

        // 3.4 Số dư Coins (Balance)
        const coinIconX = cardX + 440;
        drawCoinIcon(ctx, coinIconX, y + rowHeight / 2, 10);

        ctx.font = 'bold 19px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#FBBF24';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(user.coins) + ' xu', coinIconX + 18, y + rowHeight / 2);

        // 3.5 Biến động gần đây (ĂN / THUA BAO NHIÊU)
        const recent = user.recentGame;
        const badgeW = 210;
        const badgeH = 34;
        const badgeX = cardX + cardW - badgeW - 16;
        const badgeY = y + (rowHeight - badgeH) / 2;

        if (recent && recent.net !== 0) {
            const isWin = recent.net > 0;
            const netAmountStr = (isWin ? '+' : '') + formatShortNumber(recent.net) + ' xu';
            const gameLabel = recent.game ? ` (${recent.game})` : '';
            const statusText = (isWin ? 'Ăn ' : 'Thua ') + netAmountStr + gameLabel;

            // Background pill
            ctx.fillStyle = isWin ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
            ctx.fill();

            // Border pill
            ctx.strokeStyle = isWin ? 'rgba(34, 197, 94, 0.65)' : 'rgba(239, 68, 68, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Vẽ mũi tên tam giác vector
            ctx.save();
            ctx.fillStyle = isWin ? '#4ADE80' : '#F87171';
            ctx.beginPath();
            const arrowX = badgeX + 18;
            const arrowY = badgeY + badgeH / 2;
            if (isWin) {
                // Mũi tên lên ▲
                ctx.moveTo(arrowX, arrowY - 6);
                ctx.lineTo(arrowX - 5, arrowY + 4);
                ctx.lineTo(arrowX + 5, arrowY + 4);
            } else {
                // Mũi tên xuống ▼
                ctx.moveTo(arrowX, arrowY + 6);
                ctx.lineTo(arrowX - 5, arrowY - 4);
                ctx.lineTo(arrowX + 5, arrowY - 4);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Text
            ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = isWin ? '#4ADE80' : '#F87171';
            ctx.textAlign = 'center';
            ctx.fillText(statusText, badgeX + (badgeW + 16) / 2, badgeY + badgeH / 2);
            ctx.textAlign = 'left'; // reset
        } else {
            // Chưa có ván gần đây
            ctx.fillStyle = 'rgba(100, 116, 139, 0.12)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = '13px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#64748B';
            ctx.textAlign = 'center';
            ctx.fillText('Chưa cược gần đây', badgeX + badgeW / 2, badgeY + badgeH / 2);
            ctx.textAlign = 'left'; // reset
        }
    }

    // 4. FOOTER
    const footerY = height - 22;
    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Hệ thống Quản Lý Lê • Dữ liệu biến động tự động cập nhật sau mỗi ván cược', 50, footerY);

    const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN');
    ctx.textAlign = 'right';
    ctx.fillText(`Cập nhật lúc: ${nowStr}`, width - 50, footerY);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    renderLeaderboardImage
};

