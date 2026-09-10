const { createCanvas } = require('@napi-rs/canvas');
const omggif = require('omggif');
const fs = require('fs');
const path = require('path');

/**
 * Vẽ một quân xúc xắc 3D casino chân thực
 */
function drawSingleDice(ctx, x, y, size, value, rotationDeg = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rotationDeg * Math.PI) / 180);

    const radius = size * 0.18;
    const half = size / 2;

    // Bóng đổ của quân xúc xắc
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 8;
    ctx.shadowOffsetY = 12;

    // Mặt xúc xắc (Màu ngà voi với gradient nhẹ 3D)
    ctx.beginPath();
    ctx.roundRect(-half, -half, size, size, radius);
    const diceGrad = ctx.createLinearGradient(-half, -half, half, half);
    diceGrad.addColorStop(0, '#FFFFFF');
    diceGrad.addColorStop(0.7, '#F8F9FA');
    diceGrad.addColorStop(1, '#E2E8F0');
    ctx.fillStyle = diceGrad;
    ctx.fill();

    // Viền nhẹ nổi khối
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vị trí các chấm (pips)
    // Con 1 và con 4 mang màu đỏ theo văn hóa xúc xắc truyền thống châu Á
    const isRed = (value === 1 || value === 4);
    const pipColor = isRed ? '#E11D48' : '#1E293B';
    const pipSecondary = isRed ? '#BE123C' : '#0F172A';

    function drawPip(px, py, r) {
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        const pipGrad = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        pipGrad.addColorStop(0, pipColor);
        pipGrad.addColorStop(1, pipSecondary);
        ctx.fillStyle = pipGrad;
        ctx.fill();
    }

    const pipRadius = value === 1 ? size * 0.16 : size * 0.095;
    const offset = size * 0.26;

    switch (value) {
        case 1:
            drawPip(0, 0, pipRadius);
            break;
        case 2:
            drawPip(-offset, -offset, pipRadius);
            drawPip(offset, offset, pipRadius);
            break;
        case 3:
            drawPip(-offset, -offset, pipRadius);
            drawPip(0, 0, pipRadius);
            drawPip(offset, offset, pipRadius);
            break;
        case 4:
            drawPip(-offset, -offset, pipRadius);
            drawPip(offset, -offset, pipRadius);
            drawPip(-offset, offset, pipRadius);
            drawPip(offset, offset, pipRadius);
            break;
        case 5:
            drawPip(-offset, -offset, pipRadius);
            drawPip(offset, -offset, pipRadius);
            drawPip(0, 0, pipRadius);
            drawPip(-offset, offset, pipRadius);
            drawPip(offset, offset, pipRadius);
            break;
        case 6:
            drawPip(-offset, -offset * 1.1, pipRadius);
            drawPip(offset, -offset * 1.1, pipRadius);
            drawPip(-offset, 0, pipRadius);
            drawPip(offset, 0, pipRadius);
            drawPip(-offset, offset * 1.1, pipRadius);
            drawPip(offset, offset * 1.1, pipRadius);
            break;
    }

    ctx.restore();
}

/**
 * Render toàn bộ khung hình kết quả Tài Xỉu
 * @param {number} d1 - Xúc xắc 1 (1-6)
 * @param {number} d2 - Xúc xắc 2 (1-6)
 * @param {number} d3 - Xúc xắc 3 (1-6)
 * @param {boolean} isJackpot - Có nổ hũ không
 * @returns {Buffer} Buffer ảnh PNG
 */
function renderTaiXiuResultImage(d1, d2, d3, isJackpot = false) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const total = d1 + d2 + d3;
    const isTai = total >= 11 && total <= 17;

    // 1. Nền bàn sòng bạc cao cấp (Radial Gradient sang trọng)
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, 450);
    bgGrad.addColorStop(0, '#1E293B');
    bgGrad.addColorStop(0.6, '#0F172A');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Đường viền vàng kim loại sòng bạc
    ctx.strokeStyle = isJackpot ? '#F59E0B' : (isTai ? '#EF4444' : '#3B82F6');
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // 2. Chiếc đĩa bạc / vàng mở bát ở giữa
    const plateX = width / 2;
    const plateY = height / 2 + 10;
    const plateRadius = 155;

    // Đổ bóng của đĩa
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.arc(plateX, plateY, plateRadius + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#0B0F19';
    ctx.fill();

    // Vành đĩa kim loại bóng bẩy
    ctx.shadowColor = 'transparent';
    const plateRim = ctx.createLinearGradient(plateX - plateRadius, plateY - plateRadius, plateX + plateRadius, plateY + plateRadius);
    plateRim.addColorStop(0, isJackpot ? '#FDE047' : '#94A3B8');
    plateRim.addColorStop(0.5, isJackpot ? '#B45309' : '#334155');
    plateRim.addColorStop(1, isJackpot ? '#FBBF24' : '#64748B');
    ctx.beginPath();
    ctx.arc(plateX, plateY, plateRadius, 0, Math.PI * 2);
    ctx.fillStyle = plateRim;
    ctx.fill();

    // Lòng đĩa nhung sẫm màu
    const innerPlate = ctx.createRadialGradient(plateX, plateY, 20, plateX, plateY, plateRadius - 14);
    innerPlate.addColorStop(0, '#1E293B');
    innerPlate.addColorStop(1, '#090D16');
    ctx.beginPath();
    ctx.arc(plateX, plateY, plateRadius - 14, 0, Math.PI * 2);
    ctx.fillStyle = innerPlate;
    ctx.fill();

    // 3. Vẽ 3 quân xúc xắc tự nhiên trên đĩa
    const diceSize = 72;
    // Bố trí hình tam giác tự nhiên với góc xoay nhẹ
    drawSingleDice(ctx, plateX - 48, plateY - 18, diceSize, d1, -12);
    drawSingleDice(ctx, plateX + 48, plateY - 14, diceSize, d2, 16);
    drawSingleDice(ctx, plateX, plateY + 48, diceSize, d3, -4);

    // 4. Thanh Header hiển thị Kết Quả (Huy hiệu Casino cao cấp)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isJackpot) {
        // Tag NỔ HŨ viền vàng ánh kim
        const tagW = 420;
        const tagH = 50;
        const tagX = (width - tagW) / 2;
        const tagY = 25;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 25);
        ctx.fill();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#FDE047';
        ctx.font = 'bold 26px "Segoe UI", Arial';
        ctx.fillText('JACKPOT - NỔ HŨ TOÀN SÒNG BẠC', width / 2, tagY + tagH / 2);

        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 18px "Segoe UI", Arial';
        ctx.fillText(`BỘ BA ĐỒNG NHẤT [ ${d1} - ${d2} - ${d3} ]  •  TỔNG ${total} ĐIỂM`, width / 2, 100);
    } else {
        const tagText = isTai ? 'TÀI' : 'XỈU';
        const tagColor = isTai ? '#EF4444' : '#38BDF8';
        const tagBg = isTai ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)';

        // Vẽ thẻ kết quả (Pill Tag)
        const tagW = 260;
        const tagH = 52;
        const tagX = (width - tagW) / 2;
        const tagY = 25;

        ctx.fillStyle = tagBg;
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 26);
        ctx.fill();
        ctx.strokeStyle = tagColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = tagColor;
        ctx.font = '900 32px "Segoe UI", Arial';
        ctx.fillText(`${tagText}  •  ${total} ĐIỂM`, width / 2, tagY + tagH / 2);

        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 16px "Segoe UI", Arial';
        ctx.fillText(`Kết quả 3 xúc xắc: ${d1} + ${d2} + ${d3} = ${total}`, width / 2, 102);
    }

    // 5. Footer thông tin
    ctx.fillStyle = '#64748B';
    ctx.font = '500 13px "Segoe UI", Arial';
    ctx.fillText('HỆ THỐNG SÒNG BẠC QUẢN LÝ LÊ • MINH BẠCH & CÔNG BẰNG', width / 2, height - 24);

    return canvas.toBuffer('image/png');
}

/**
 * Render bảng Thống Kê Phiên (Soi Cầu trực quan 2 tầng biểu đồ chuẩn mxtbot)
 */
function renderSoiCauChart(historyList, latestInfo = {}) {
    const width = 1000;
    const height = 620;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Background
    ctx.fillStyle = '#1C1A24';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 16);
    ctx.fill();

    // Viền ngoài
    ctx.strokeStyle = '#2D293E';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 2. Header
    ctx.fillStyle = '#F1C40F';
    ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THỐNG KÊ PHIÊN', 45, 48);

    const rId = latestInfo.roundId || (latestInfo.total ? 'Gần nhất' : 67417);
    const rType = latestInfo.isTai ? 'TAI' : 'XIU';
    const d1 = latestInfo.d1 || 1;
    const d2 = latestInfo.d2 || 1;
    const d3 = latestInfo.d3 || 1;
    const subText = `Phiên gần nhất: #${rId} ${rType} (${d1}-${d2}-${d3})`;

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 16px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(subText, width - 45, 48);

    // Chuẩn bị đúng 20 điểm dữ liệu
    const points = [...historyList].slice(-20);
    while (points.length < 20) {
        const d_1 = Math.floor(Math.random() * 6) + 1;
        const d_2 = Math.floor(Math.random() * 6) + 1;
        const d_3 = Math.floor(Math.random() * 6) + 1;
        const tot = d_1 + d_2 + d_3;
        points.unshift({ total: tot, isTai: tot >= 11, d1: d_1, d2: d_2, d3: d_3 });
    }

    const boxX = 45;
    const boxW = width - 90; // 910
    const plotLeft = boxX + 45;
    const plotW = boxW - 65; // 845
    const stepX = plotW / (points.length - 1);

    const getX = (idx) => plotLeft + idx * stepX;

    // --- BIỂU ĐỒ 1: TỔNG ĐIỂM (TOP CHART) ---
    const box1Y = 75;
    const box1H = 205;
    const plot1Top = box1Y + 25;
    const plot1Bottom = box1Y + box1H - 25;
    const plot1H = plot1Bottom - plot1Top;

    ctx.fillStyle = '#14121B';
    ctx.beginPath();
    ctx.roundRect(boxX, box1Y, boxW, box1H, 10);
    ctx.fill();
    ctx.strokeStyle = '#2B273A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Trục Y biểu đồ 1 (3, 6, 9, 12, 15, 18)
    const yVals1 = [18, 15, 12, 9, 6, 3];
    const getY1 = (val) => {
        const norm = (val - 3) / (18 - 3);
        return plot1Bottom - norm * plot1H;
    };

    ctx.font = '600 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    for (const v of yVals1) {
        const y = getY1(v);
        ctx.fillStyle = '#6B7280';
        ctx.fillText(v.toString(), boxX + 35, y + 4);

        ctx.beginPath();
        ctx.moveTo(boxX + 45, y);
        ctx.lineTo(boxX + boxW - 15, y);
        ctx.strokeStyle = '#23202E';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Lưới dọc biểu đồ 1
    for (let i = 0; i < points.length; i++) {
        const x = getX(i);
        ctx.beginPath();
        ctx.moveTo(x, plot1Top - 10);
        ctx.lineTo(x, plot1Bottom + 10);
        ctx.strokeStyle = '#201D2A';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Vẽ đường nối biểu đồ 1
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const x = getX(i);
        const y = getY1(points[i].total);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Vẽ các nốt tròn chứa số tổng điểm
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = getX(i);
        const y = getY1(p.total);
        const isTai = p.total >= 11;
        const r = 13;

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = isTai ? '#121118' : '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = isTai ? '#FFFFFF' : '#121118';
        ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.total.toString(), x, y + 4);
    }

    // --- CHÚ THÍCH (LEGEND GIỮA 2 BIỂU ĐỒ) ---
    const legY = 315;
    const legends = [
        { label: 'Xí Ngầu 1', color: '#3B82F6' },
        { label: 'Xí Ngầu 2', color: '#10B981' },
        { label: 'Xí Ngầu 3', color: '#A855F7' }
    ];

    const startLegX = width / 2 - 170;
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px "Segoe UI", Arial, sans-serif';
    legends.forEach((item, idx) => {
        const curX = startLegX + idx * 135;
        ctx.beginPath();
        ctx.arc(curX, legY, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();

        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(item.label, curX + 16, legY + 5);
    });

    // --- BIỂU ĐỒ 2: CHI TIẾT 3 XÚC XẮC (BOTTOM CHART) ---
    const box2Y = 345;
    const box2H = 235;
    const plot2Top = box2Y + 25;
    const plot2Bottom = box2Y + box2H - 25;
    const plot2H = plot2Bottom - plot2Top;

    ctx.fillStyle = '#14121B';
    ctx.beginPath();
    ctx.roundRect(boxX, box2Y, boxW, box2H, 10);
    ctx.fill();
    ctx.strokeStyle = '#2B273A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Trục Y biểu đồ 2 (1, 2, 3, 4, 5, 6)
    const yVals2 = [6, 5, 4, 3, 2, 1];
    const getY2 = (val) => {
        const norm = (val - 1) / (6 - 1);
        return plot2Bottom - norm * plot2H;
    };

    ctx.font = '600 13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'right';
    for (const v of yVals2) {
        const y = getY2(v);
        ctx.fillStyle = '#6B7280';
        ctx.fillText(v.toString(), boxX + 35, y + 4);

        ctx.beginPath();
        ctx.moveTo(boxX + 45, y);
        ctx.lineTo(boxX + boxW - 15, y);
        ctx.strokeStyle = '#23202E';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // Lưới dọc biểu đồ 2
    for (let i = 0; i < points.length; i++) {
        const x = getX(i);
        ctx.beginPath();
        ctx.moveTo(x, plot2Top - 10);
        ctx.lineTo(x, plot2Bottom + 10);
        ctx.strokeStyle = '#201D2A';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 3 đường xúc xắc
    const diceKeys = [
        { key: 'd1', color: '#3B82F6' },
        { key: 'd2', color: '#10B981' },
        { key: 'd3', color: '#A855F7' }
    ];

    diceKeys.forEach(dk => {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const val = points[i][dk.key] || 1;
            const x = getX(i);
            const y = getY2(val);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = dk.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Nốt tròn
        for (let i = 0; i < points.length; i++) {
            const val = points[i][dk.key] || 1;
            const x = getX(i);
            const y = getY2(val);
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = dk.color;
            ctx.fill();
        }
    });

    return canvas.toBuffer('image/png');
}

/**
 * Tạo Animation GIF Top-Down 2D phẳng: Bát lắc dồn dập rồi trượt mở hé lộ chính xác 3 xúc xắc của ván
 * @param {number} d1 - Xúc xắc 1 (1-6)
 * @param {number} d2 - Xúc xắc 2 (1-6)
 * @param {number} d3 - Xúc xắc 3 (1-6)
 * @returns {Buffer} Buffer Animated GIF
 */
function generateTaiXiuAnimationGif(d1 = 1, d2 = 6, d3 = 5) {
    const w = 480;
    const h = 270;
    // Tổng 72 frames @ 110ms = ~8.0 giây:
    // • 0s -> 3.5s (Frames 0-32): Lắc dồn dập
    // • 3.5s -> 4.0s (Frames 32-37): Khựng lại nín thở
    // • 4.0s -> 5.5s (Frames 37-50): Trượt mở bát sang phải
    // • 5.5s -> 8.0s (Frames 50-71): GIỮ NGUYÊN trạng thái mở bát để người chơi ngắm trọn vẹn 3 xúc xắc!
    const totalFrames = 72;
    const outBuf = Buffer.alloc(w * h * totalFrames * 4);
    const gifWriter = new omggif.GifWriter(outBuf, w, h, { loop: 0 });

    const cx = w / 2;
    const cy = h / 2;

    const PALETTE = [
        0x000000, 0x1E1F22, 0x2B2D31, 0x3F444E, 0x4E525C,
        0xD1D5DB, 0xE5E7EB, 0x9CA3AF, 0xFFFFFF, 0xE11D48,
        0x1E293B, 0xF8FAFC, 0xE2E8F0, 0xF59E0B, 0xD97706, 0x000000
    ];
    while (PALETTE.length < 256) PALETTE.push(0);

    for (let f = 0; f < totalFrames; f++) {
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');

        // Nền phẳng Discord Dark Theme #1E1F22
        ctx.fillStyle = '#1E1F22';
        ctx.fillRect(0, 0, w, h);

        // Vòng tròn bàn cược phẳng 2D
        ctx.beginPath();
        ctx.arc(cx, cy, 125, 0, Math.PI * 2);
        ctx.fillStyle = '#2B2D31';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3F444E';
        ctx.stroke();

        // Đĩa tròn 2D phẳng
        ctx.beginPath();
        ctx.arc(cx, cy, 105, 0, Math.PI * 2);
        ctx.fillStyle = '#D1D5DB';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#9CA3AF';
        ctx.stroke();

        // Lòng đĩa 2D phẳng
        ctx.beginPath();
        ctx.arc(cx, cy, 95, 0, Math.PI * 2);
        ctx.fillStyle = '#E5E7EB';
        ctx.fill();

        function draw2DDice(dx, dy, rot, val) {
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(rot);

            const size = 38;
            const half = size / 2;

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.roundRect(-half, -half, size, size, 6);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#374151';
            ctx.stroke();

            function dot(px, py, r, color) {
                ctx.beginPath();
                ctx.arc(px, py, r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }

            const red = '#E11D48';
            const black = '#1E293B';
            const offset = size * 0.26;
            const pipRadius = val === 1 ? size * 0.17 : size * 0.095;

            switch (val) {
                case 1:
                    dot(0, 0, pipRadius, red);
                    break;
                case 2:
                    dot(-offset, -offset, pipRadius, black);
                    dot(offset, offset, pipRadius, black);
                    break;
                case 3:
                    dot(-offset, -offset, pipRadius, black);
                    dot(0, 0, pipRadius, black);
                    dot(offset, offset, pipRadius, black);
                    break;
                case 4:
                    dot(-offset, -offset, pipRadius, red);
                    dot(offset, -offset, pipRadius, red);
                    dot(-offset, offset, pipRadius, red);
                    dot(offset, offset, pipRadius, red);
                    break;
                case 5:
                    dot(-offset, -offset, pipRadius, black);
                    dot(offset, -offset, pipRadius, black);
                    dot(0, 0, pipRadius, black);
                    dot(-offset, offset, pipRadius, black);
                    dot(offset, offset, pipRadius, black);
                    break;
                case 6:
                    dot(-offset, -offset * 1.05, pipRadius, black);
                    dot(offset, -offset * 1.05, pipRadius, black);
                    dot(-offset, 0, pipRadius, black);
                    dot(offset, 0, pipRadius, black);
                    dot(-offset, offset * 1.05, pipRadius, black);
                    dot(offset, offset * 1.05, pipRadius, black);
                    break;
            }
            ctx.restore();
        }

        // Vẽ 3 quân xúc xắc của ván cược
        draw2DDice(cx - 26, cy - 18, -0.1, d1);
        draw2DDice(cx + 28, cy - 14, 0.15, d2);
        draw2DDice(cx + 2, cy + 28, 0.05, d3);

        let bowlX = cx;
        let bowlY = cy;

        if (f < 32) {
            // Giai đoạn 1: Lắc dồn dập (0s -> 3.5s)
            const phase = f * 1.8;
            bowlX += Math.sin(phase * 2) * 14;
            bowlY += Math.cos(phase * 2.3) * 10;
        } else if (f < 37) {
            // Giai đoạn 2: Khựng lại 0.5s nín thở (3.5s -> 4.0s)
            bowlX = cx;
            bowlY = cy;
        } else if (f < 50) {
            // Giai đoạn 3: Trượt mở sang phải (4.0s -> 5.5s)
            const progress = (f - 36) / (50 - 36);
            bowlX += Math.pow(progress, 1.25) * 260;
        } else {
            // Giai đoạn 4: ĐÃ MỞ TOÀN BỘ (5.5s -> 8.0s) -> Bát ra khỏi khung hình, giữ xúc xắc đứng yên để ngắm
            bowlX = w + 200;
        }

        // Vẽ bát 2D phẳng
        if (bowlX < w + 90) {
            ctx.save();
            ctx.translate(bowlX, bowlY);

            ctx.beginPath();
            ctx.arc(0, 0, 86, 0, Math.PI * 2);
            ctx.fillStyle = '#F8FAFC';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#374151';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, 76, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#F59E0B';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.fillStyle = '#E5E7EB';
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#D97706';
            ctx.stroke();

            ctx.restore();
        }

        const imgData = ctx.getImageData(0, 0, w, h);
        const pIndices = [];

        function getNearestColor(r, g, b) {
            let bestIdx = 1;
            let bestDist = Infinity;
            for (let i = 1; i <= 15; i++) {
                const pr = (PALETTE[i] >> 16) & 0xFF;
                const pg = (PALETTE[i] >> 8) & 0xFF;
                const pb = PALETTE[i] & 0xFF;
                const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = i;
                }
            }
            return bestIdx;
        }

        for (let p = 0; p < imgData.data.length; p += 4) {
            pIndices.push(getNearestColor(imgData.data[p], imgData.data[p+1], imgData.data[p+2]));
        }

        gifWriter.addFrame(0, 0, w, h, pIndices, {
            palette: PALETTE,
            delay: 11
        });
    }

    return outBuf.slice(0, gifWriter.end());
}

module.exports = {
    renderTaiXiuResultImage,
    renderSoiCauChart,
    generateTaiXiuAnimationGif
};

