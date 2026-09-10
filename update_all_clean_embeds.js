require('dotenv').config({ path: 'C:/Users/quang/.gemini/antigravity-ide/scratch/discord-hub-bot/.env' });
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const delay = ms => new Promise(res => setTimeout(res, ms));

client.once('ready', async () => {
    console.log('[REPLACE] Logged in as:', client.user.tag);

    // 1. ✎・quy-tắc-rules
    try {
        const ch = await client.channels.fetch('1493784991442665548');
        try {
            const oldMsg = await ch.messages.fetch('1546111511938998333');
            if (oldMsg) await oldMsg.delete();
            console.log('Deleted old rules message');
        } catch(e) {}

        const embed = new EmbedBuilder()
            .setTitle('✦ NỘI QUY CỘNG ĐỒNG & CHÍNH SÁCH BẢO MẬT')
            .setColor(0x5865F2)
            .setDescription('Vui lòng tuân thủ các quy chuẩn dưới đây để duy trì một môi trường chuyên nghiệp và an toàn.')
            .addFields(
                {
                    name: 'I. NỘI QUY CHUNG',
                    value: '• **Tôn trọng lẫn nhau:** Không xúc phạm, miệt thị vùng miền, toxic hoặc gây gổ trong các kênh chat.\n• **Cấm Spam / Quảng cáo:** Không gửi link server khác, rao bán tài khoản hoặc spam bot trong các kênh không liên quan.\n• **Bảo vệ tài khoản cá nhân:** Tuyệt đối không chia sẻ mật khẩu tài khoản game hay thông tin nhạy cảm.'
                },
                {
                    name: 'II. CAM KẾT BẢO MẬT KHI LÀM DỊCH VỤ (ULTRAVIEWER / ANYDESK)',
                    value: '• **Minh bạch 100%:** Khách hàng ngồi xem toàn bộ thao tác trực tiếp trên màn hình của mình.\n• **Không can thiệp dữ liệu:** Tuyệt đối không chạm vào tài liệu, hình ảnh hoặc phần mềm riêng tư của khách.\n• **An toàn phần cứng:** Mọi tinh chỉnh đều dựa trên thông số an toàn, không ép xung quá nhiệt gây hại máy.\n• **Chính sách bảo hành:** Hỗ trợ tinh chỉnh lại **miễn phí trong 7 ngày** nếu khách hàng gặp phát sinh sau cập nhật Windows.'
                }
            )
            .setFooter({ text: 'Hub Security Policy • An tâm tuyệt đối khi sử dụng dịch vụ' });

        await ch.send({ embeds: [embed] });
        console.log('✓ Replaced rules embed');
    } catch (err) {
        console.error('Err rules:', err.message);
    }
    await delay(600);

    // 2. ⌗・bảng-giá-dịch-vụ
    try {
        const ch = await client.channels.fetch('1502207104012910666');
        try {
            const oldMsg = await ch.messages.fetch('1546115043035189293');
            if (oldMsg) await oldMsg.delete();
            console.log('Deleted old pricing message');
        } catch(e) {}

        const embed1 = new EmbedBuilder()
            .setTitle('◈ BẢNG GIÁ DỊCH VỤ CHUYÊN NGHIỆP — VINFPS.COM')
            .setURL('https://vinfps.com')
            .setColor(0x5865F2)
            .setDescription('**Official Website:** [vinfps.com](https://vinfps.com)\n*Giải pháp tối ưu phần cứng, tinh chỉnh thiết bị thi đấu & nâng tầm kỹ năng FPS cá nhân.*')
            .addFields(
                {
                    name: '▸ GÓI 1: SETTING RAPID TRIGGER / MAGNETIC KEYBOARD',
                    value: '*(Hỗ trợ: Wooting 60HE/80HE, ATK68/75, DrunkDeer, MelGeek, Polar 65...)*\n\n• **Gói Cơ Bản (Standard) — 50.000 VNĐ:**\n- Căn chỉnh điểm nhận phím (Actuation Point) & độ nhạy Rapid Trigger chuẩn game.\n- Khắc phục triệt để tình trạng double-tap hoặc miss phím do lệch nam châm.\n\n• **Gói Chuyên Sâu (Pro-Tier) — 100.000 VNĐ (Khuyên dùng):**\n- Tùy biến từng switch (WASD, Shift, Ctrl, Space) theo lực tay và thói quen riêng.\n- Tối ưu hóa tính năng SOCD / Rappy Snappy / DKS phục vụ counter-strafe 0ms.\n- Hướng dẫn bảo dưỡng và hiệu chuẩn (calibration) lại switch khi lệch từ trường.'
                },
                {
                    name: '▸ GÓI 2: TỐI ƯU PC GAMING & GIẢM INPUT DELAY',
                    value: '*(Hỗ trợ qua UltraViewer / AnyDesk — Khách xem trực tiếp 100%)*\n\n• **Gói Clean & Smooth — 150.000 VNĐ:**\n- Dọn dẹp bloatware, tắt telemetry và dịch vụ ngầm vô ích của Windows.\n- Tối ưu GPU driver (NVIDIA / AMD) & Power Plan gaming chuyên sâu.\n- Cải thiện hiện tượng tụt FPS (1% Low FPS), giúp khung hình mượt mà hơn.\n\n• **Gói Deep Latency Optimization — 300.000 VNĐ:**\n- Tinh chỉnh Windows Registry, MSI Mode cho GPU và Card mạng.\n- Core Pinning / CPU Affinity (phân luồng CPU riêng biệt cho Game).\n- Tối ưu hóa TCP/IP, giảm jitter mạng và ổn định ping.\n- Đo kiểm tra DPC Latency (LatencyMon) trước và sau khi làm.'
                }
            );

        const embed2 = new EmbedBuilder()
            .setColor(0x2ecc71)
            .addFields(
                {
                    name: '▸ GÓI 3: 1-ON-1 COACHING VALORANT & FPS',
                    value: '*(Coaching 1 kèm 1 — Xem màn hình trực tiếp và phân tích VOD)*\n\n• **Buổi Lẻ (Phân tích trận & Sửa lỗi) — 120.000 VNĐ / Buổi (90 Phút):**\n- Review 1-2 trận đấu gần nhất của bạn.\n- Chỉ ra lỗi: Crosshair Placement, Peek góc (Poppin swing, Jiggle peek), Kỹ năng.\n- Giáo án luyện aim và movement cá nhân hóa trong Aim Lab / The Range.\n\n• **Khóa Leo Rank Cấp Tốc (3 Buổi) — 300.000 VNĐ:**\n- Buổi 1: Sửa triệt để lỗi cơ bản, setting tâm ngắm & độ nhạy (eDPI).\n- Buổi 2: Tư duy Macro (đọc map, kiểm soát nhịp độ round, clutch 1vX).\n- Buổi 3: Thực chiến trực tiếp cùng Coach (Live Coaching) và định hướng dài hạn.'
                },
                {
                    name: '▸ QUY TRÌNH ĐẶT LỊCH',
                    value: '1. Truy cập website [vinfps.com](https://vinfps.com) hoặc vào kênh **#✉・mở-ticket-đặt-lịch**.\n2. Cung cấp thông tin thiết bị/cấu hình theo mẫu bot yêu cầu.\n3. Kỹ thuật viên sẽ xác nhận lịch và hỗ trợ ngay tức thì!'
                }
            )
            .setFooter({ text: 'VinFPS.com • Tối ưu phần cứng & Nâng tầm kỹ năng FPS' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Ghé thăm Website VinFPS.com')
                .setURL('https://vinfps.com')
        );

        await ch.send({ embeds: [embed1, embed2], components: [row] });
        console.log('✓ Replaced pricing embed');
    } catch (err) {
        console.error('Err pricing:', err.message);
    }
    await delay(600);

    // 3. ✉・mở-ticket-đặt-lịch
    try {
        const ch = await client.channels.fetch('1546106247860985857');
        try {
            const oldMsg = await ch.messages.fetch('1546115485278670940');
            if (oldMsg) await oldMsg.delete();
            console.log('Deleted old ticket control message');
        } catch(e) {}

        const embed = new EmbedBuilder()
            .setTitle('〔 ✉ 〕TRUNG TÂM HỖ TRỢ & ĐẶT LỊCH DỊCH VỤ')
            .setColor(0x5865F2)
            .setDescription(
                'Chào mừng bạn đến với hệ thống hỗ trợ kỹ thuật và dịch vụ!\n\n' +
                'Vui lòng chọn loại dịch vụ bạn cần bên dưới để tạo **Ticket riêng tư** làm việc trực tiếp với kỹ thuật viên:\n\n' +
                '▸ **Setting Rapid Trigger / Gear:** Căn chỉnh hành trình phím, deadzone, profile thi đấu (Wooting, DrunkDeer, ATK...)\n' +
                '▸ **Tối ưu PC / Giảm Delay:** Debloat Windows, tối ưu BIOS, ép xung ổn định, kéo max FPS và giảm input delay.\n' +
                '▸ **Đăng ký Coaching 1-1:** Khắc phục lỗi cơ bản, hướng dẫn macro/micro, crosshair placement, leo rank cùng chuyên gia.\n\n' +
                '*Sau khi bấm, một kênh chat riêng tư sẽ được tạo ra cho bạn!*'
            )
            .setFooter({ text: 'VinFPS Support System • Phản hồi tức thì' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_rapid_trigger')
                .setLabel('Setting Rapid Trigger')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_pc_opt')
                .setLabel('Tối ưu PC / Delay')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('ticket_coaching')
                .setLabel('Coaching 1-1')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Website VinFPS.com')
                .setURL('https://vinfps.com')
        );

        await ch.send({ embeds: [embed], components: [row] });
        console.log('✓ Replaced ticket control embed');
    } catch (err) {
        console.error('Err ticket control:', err.message);
    }
    await delay(600);

    // 4. ⌨・rapid-trigger-guides
    try {
        const ch = await client.channels.fetch('1546117441879408691');
        // Delete old messages
        for (const mid of ['1546386583220002868', '1546117458144923679']) {
            try {
                const old = await ch.messages.fetch(mid);
                if (old) await old.delete();
            } catch(e) {}
        }

        // Post 1: USB tip
        const embed1 = new EmbedBuilder()
            .setTitle('◈ QUICK TIP: CÁCH CHỌN CỔNG USB CHO BÀN PHÍM 8KHZ (RAPID TRIGGER)')
            .setColor(0x00E5FF)
            .setDescription(
                'Để bàn phím chạy chuẩn **Polling Rate 8.000Hz (0.125ms)** không bị drop gói dữ liệu, trồi sụt FPS hoặc nghẽn băng thông USB Controller, anh em lưu ý vị trí cắm sau mainboard:\n\n' +
                '▸ **Ưu tiên số 1 — Cổng USB 3.0 / 3.1 / 3.2 (Màu Xanh Dương / Đỏ):**\n' +
                '• Luôn là lựa chọn tốt nhất. Các cổng USB 3.0+ đi trực tiếp từ CPU hoặc Chipset tốc độ cao, có băng thông lớn và nguồn cấp điện ổn định hơn hẳn để nuôi MCU xử lý 8K liên tục mà không lo chập chờn.\n\n' +
                '▸ **Nếu không còn cổng USB 3.0 trống — Cắm Cổng USB 2.0 (Màu Đen):**\n' +
                '• Cắm trực tiếp vào cổng USB 2.0 màu đen nằm **sát phía trên cùng của Backplate Mainboard** (gần cổng PS/2 cũ).\n' +
                '• Đây là các cổng Native ít bị can thiệp qua các controller phụ (ASMedia / Hub mở rộng).\n\n' +
                '〔 LƯU Ý QUAN TRỌNG 〕\n' +
                '✕ **TUYỆT ĐỐI KHÔNG** cắm qua Hub chia USB, cáp nối dài, hoặc cụm cổng USB trên nóc/mặt trước case (Front Panel Header).\n' +
                '✕ Tránh cắm chung dải USB Controller với chuột 4K/8K để tránh tình trạng chia sẻ tài nguyên Controller gây micro-stutter khi quẩy chuột nhanh.'
            )
            .setFooter({ text: 'vinFPS Coaching & PC Optimization • #GearTips' })
            .setTimestamp();

        // Post 2: Setting guide
        const embed2 = new EmbedBuilder()
            .setTitle('▸ BÍ QUYẾT SETTING RAPID TRIGGER KHÔNG MISS PHÍM TRONG VALORANT')
            .setColor(0x3498db)
            .setDescription(
                '*Kinh nghiệm thực chiến từ VinFPS dành cho các dòng phím Wooting, ATK, DrunkDeer, Polar65...*\n\n' +
                '> Rất nhiều anh em mới mua phím nam châm thường để Rapid Trigger quá nhạy (0.1mm) dẫn đến việc chỉ cần rung ngón tay nhẹ là nhân vật tự khựng lại, bắn trượt viên đạn đầu.'
            )
            .addFields(
                {
                    name: '1. Actuation Point (Điểm nhận phím ban đầu)',
                    value: '• **Cụm di chuyển (WASD):** Để **0.5mm – 0.7mm**.\n*(Tránh để 0.1mm - 0.2mm vì lúc căng thẳng ngón tay đè nhẹ sẽ tự di chuyển, làm mất First Bullet Accuracy).*\n• **Phím kỹ năng / Jump (Space, Shift, Ctrl, Q, E, C):** Để **1.0mm – 1.2mm** để tránh bấm nhầm ulti hoặc ngồi ngoài ý muốn.'
                },
                {
                    name: '2. Rapid Trigger Sensitivity (Độ nhạy nhả phím)',
                    value: '• **Press Sensitivity (Nhận lại khi ấn xuống):** `0.15mm – 0.2mm`\n• **Release Sensitivity (Ngắt phím khi nhấc lên):** `0.1mm – 0.15mm`\n*(Nhấc tay lên cực nhẹ là game ngắt lực di chuyển ngay lập tức -> Dừng quán tính chuẩn 0ms để xả đạn counter-strafe).*'
                },
                {
                    name: '3. Lưu ý bảo dưỡng',
                    value: 'Sau mỗi 1-2 tuần sử dụng hoặc đổi môi trường nhiệt độ, hãy dùng phần mềm của hãng để **Calibration (Hiệu chuẩn lại từ trường)** cho tất cả switch, tránh bị lệch cảm biến Hall Effect!'
                }
            )
            .setFooter({ text: 'VinFPS.com • Kiến thức Gear & Setup chuẩn thi đấu' });

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Xem Profile mẫu tại VinFPS.com')
                .setURL('https://vinfps.com')
        );

        await ch.send({ embeds: [embed1] });
        await delay(500);
        await ch.send({ embeds: [embed2], components: [row2] });
        console.log('✓ Replaced rapid trigger guides');
    } catch (err) {
        console.error('Err rapid trigger guides:', err.message);
    }
    await delay(600);

    // 5. ↯・tips-tối-ưu-pc
    try {
        const ch = await client.channels.fetch('1546117443758461049');
        try {
            const old = await ch.messages.fetch('1546117460946714645');
            if (old) await old.delete();
        } catch(e) {}

        const embed = new EmbedBuilder()
            .setTitle('⌬ 3 BƯỚC CƠ BẢN TỰ GIẢM ĐỘ TRỄ CHUỘT & INPUT LAG TRÊN WINDOWS')
            .setColor(0x9b59b6)
            .setDescription('*Những thiết lập cơ bản nhưng hiệu quả rõ rệt mà ai cũng có thể tự bật trên Windows 10/11.*')
            .addFields(
                {
                    name: '1. Bật Game Mode (Chế độ trò chơi)',
                    value: '• Vào `Settings -> Gaming -> Game Mode` -> **BẬT (ON)**.\n• *Tác dụng:* Trên Windows hiện đại, Game Mode giúp Windows ưu tiên toàn bộ luồng CPU cho game và hạn chế các dịch vụ update ngầm.'
                },
                {
                    name: '2. Hardware-Accelerated GPU Scheduling (HAGS)',
                    value: '• Vào `Display Settings -> Graphics Settings -> Change default graphics settings`.\n• Bật **Hardware-accelerated GPU scheduling (HAGS)** -> Khởi động lại máy.\n• *Tác dụng:* Giúp GPU tự quản lý VRAM thay vì phụ thuộc CPU, giảm độ trễ hiển hình rõ rệt.'
                },
                {
                    name: '3. Tắt "Enhance Pointer Precision" (Gia tốc chuột)',
                    value: '• Vào `Control Panel -> Mouse -> tab Pointer Options`.\n• **BỎ TÍCH** ô `Enhance pointer precision`.\n• *Tác dụng:* Đảm bảo chuột di chuyển chuẩn 1:1 theo cử động tay, không bị Windows tự tăng tốc độ khi vẩy nhanh (muscle memory chuẩn xác hơn).'
                }
            )
            .setFooter({ text: 'VinFPS.com • Tinh chỉnh PC chuyên sâu giảm DPC Latency' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Ghé thăm Website VinFPS.com')
                .setURL('https://vinfps.com')
        );

        await ch.send({ embeds: [embed], components: [row] });
        console.log('✓ Replaced pc tips embed');
    } catch (err) {
        console.error('Err pc tips:', err.message);
    }
    await delay(600);

    // 6. ⌬・vinfps-tools-update
    try {
        const ch = await client.channels.fetch('1546117445566206094');
        try {
            const old = await ch.messages.fetch('1546117463983390784');
            if (old) await old.delete();
        } catch(e) {}

        const embed = new EmbedBuilder()
            .setTitle('▸ KHÁM PHÁ HỆ SINH THÁI TIỆN ÍCH TẠI VINFPS.COM')
            .setColor(0x1abc9c)
            .setDescription('Nhằm mang lại trải nghiệm tốt nhất cho cộng đồng game thủ FPS, hệ thống **VinFPS** liên tục cập nhật các công cụ và tài nguyên hoàn toàn miễn phí trên website:\n\n**Official Website:** [https://vinfps.com](https://vinfps.com)')
            .addFields(
                {
                    name: '⌖ Công cụ đổi độ nhạy chuột (eDPI / Sens Converter)',
                    value: 'Chuyển đổi sens chuẩn xác giữa các game Valorant, CS2, Apex Legends, Overwatch 2 mà không bị lệch muscle memory.'
                },
                {
                    name: '⌨ Thư viện Profile mẫu Rapid Trigger',
                    value: 'Tải về các profile setting tối ưu sẵn cho từng dòng phím (Wooting, ATK, DrunkDeer) phân theo từng tựa game.'
                },
                {
                    name: '⌬ Cẩm nang đo kiểm tra độ trễ (Latency Guide)',
                    value: 'Bộ hướng dẫn tự đo DPC Latency, kiểm tra FPS drop và cách khắc phục tại nhà.'
                }
            )
            .setFooter({ text: 'VinFPS.com • Đồng hành cùng game thủ FPS Việt Nam' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Truy cập ngay VinFPS.com')
                .setURL('https://vinfps.com')
        );

        await ch.send({ embeds: [embed], components: [row] });
        console.log('✓ Replaced tools update embed');
    } catch (err) {
        console.error('Err tools update:', err.message);
    }
    await delay(600);

    // 7. Forum Guide Thread (1546111568377552917)
    try {
        const thread = await client.channels.fetch('1546111568377552917');
        if (thread) {
            // Rename thread if it has emoji
            if (thread.name.includes('📌')) {
                await thread.setName('▸・HƯỚNG DẪN ĐÁNH GIÁ & FEEDBACK DỊCH VỤ');
            }
            try {
                const msg = await thread.messages.fetch('1546111568377552917');
                if (msg) {
                    const cleanEmbed = new EmbedBuilder()
                        .setTitle('✦ KHU VỰC ĐÁNH GIÁ & FEEDBACK DỊCH VỤ')
                        .setColor(0xf1c40f)
                        .setDescription('Cảm ơn tất cả anh em đã tin tưởng và đồng hành cùng Hub! Sự hài lòng của các bạn chính là thước đo uy tín lớn nhất của chúng tôi.\n\nSau khi hoàn tất dịch vụ Setting / Tối ưu PC / Coaching, anh em hãy để lại đánh giá theo mẫu bên dưới nhé:')
                        .addFields(
                            {
                                name: '✎ MẪU ĐÁNH GIÁ (FEEDBACK FORMAT)',
                                value: '```text\n• Dịch vụ đã làm: (Setting Rapid Trigger / Tối ưu PC / Coaching)\n• Cảm nhận: (Input delay mượt hơn / FPS ổn định / Leo rank tốt hơn...)\n• Điểm đánh giá: (x/10)\n• Ảnh minh chứng (nếu có): (Ảnh CapFrameX, LatencyMon hoặc kết quả trận)\n```'
                            },
                            {
                                name: '✦ QUYỀN LỢI KHÁCH HÀNG',
                                value: 'Mỗi feedback chân thực sẽ được tự động thăng hạng role **`@Verified Client`** kèm ưu đãi **giảm 10%** cho các lần sử dụng dịch vụ tiếp theo!'
                            }
                        )
                        .setFooter({ text: 'Đánh giá chân thực • Nâng tầm trải nghiệm' });

                    await msg.edit({ embeds: [cleanEmbed] });
                    console.log('✓ Edited forum guide embed');
                }
            } catch(e) {}
        }
    } catch(err) {
        console.error('Err forum thread:', err.message);
    }
    await delay(600);

    // 8. ticket-tranthiensabo (1546753507078569984)
    try {
        const ch = await client.channels.fetch('1546753507078569984');
        try {
            const msg = await ch.messages.fetch('1546753511197253683');
            if (msg) {
                const cleanEmbed = new EmbedBuilder()
                    .setTitle('✉ Ticket: Setting Rapid Trigger')
                    .setColor(0x2ecc71)
                    .setDescription('Cảm ơn bạn đã lựa chọn dịch vụ **Setting Rapid Trigger**.\n\nKỹ thuật viên sẽ kiểm tra và phản hồi ngay.\nVui lòng mô tả cấu hình/thiết bị và tình trạng bạn cần hỗ trợ bên dưới!');

                const cleanRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_close_ticket')
                        .setLabel('Đóng Ticket')
                        .setStyle(ButtonStyle.Danger)
                );

                await msg.edit({ embeds: [cleanEmbed], components: [cleanRow] });
                console.log('✓ Edited ticket embed');
            }
        } catch(e) {}
    } catch(err) {
        console.error('Err ticket:', err.message);
    }

    console.log('[REPLACE] ALL EMBEDS SUCCESSFULLY SANITIZED!');
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
