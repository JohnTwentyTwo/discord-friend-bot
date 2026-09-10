const path = require('path');
const nodeBotDir = 'C:/Users/quang/.gemini/antigravity-ide/scratch/discord-friend-node-bot';
require(path.join(nodeBotDir, 'node_modules/dotenv')).config({ path: path.join(nodeBotDir, '.env') });
const { Client, GatewayIntentBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require(path.join(nodeBotDir, 'node_modules/discord.js'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const GUILD_ID = '874584241734819860';
// Category TICKETS (ban quản trị)
const TICKET_CATEGORY_ID = '1493788164828037170'; // ║ BAN QUAN TRI hoặc dùng tên

client.once('ready', async () => {
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();

        // Tìm category phù hợp (TICKETS hoặc BAN QUAN TRI)
        let category = guild.channels.cache.get(TICKET_CATEGORY_ID);
        if (!category) {
            category = guild.channels.cache.find(c =>
                c.type === ChannelType.GuildCategory &&
                (c.name.toLowerCase().includes('ticket') || c.name.toLowerCase().includes('quan tri'))
            );
        }
        console.log(`Category mục tiêu: ${category?.name} (${category?.id})`);

        // Kiểm tra xem channel ho-tro đã tồn tại chưa
        let hoTroChannel = guild.channels.cache.find(c => c.name === 'ho-tro');
        if (!hoTroChannel) {
            hoTroChannel = await guild.channels.create({
                name: 'ho-tro',
                type: ChannelType.GuildText,
                parent: category ? category.id : null,
                topic: 'Tạo ticket để nhận hỗ trợ từ Ban Quản Trị',
                permissionOverwrites: [
                    { id: guild.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages] }
                ]
            });
            console.log(`✅ Tạo channel #ho-tro (${hoTroChannel.id})`);
        } else {
            console.log(`ℹ️  Channel #ho-tro đã tồn tại (${hoTroChannel.id})`);
        }

        // Post ticket panel
        const embed = new EmbedBuilder()
            .setColor(0x1A1A2E)
            .setAuthor({
                name: 'Quản Lý Lê — Hệ thống hỗ trợ',
                iconURL: guild.iconURL({ dynamic: true })
            })
            .setTitle('TRUNG TAM HO TRO THANH VIEN')
            .setDescription(
                'Chao mung den khu vuc ho tro cua server.\n\n' +
                'Neu can giup do, giai dap hoac bao cao, chon loai yeu cau ben duoi. ' +
                'Mot kenh rieng se duoc tao — **chi ban va ban quan tri thay duoc**.\n\n' +
                '▸ **Ho tro chung** — Thac mac, hoi dap ve server\n' +
                '▸ **Khieu nai / Bao cao** — Bao cao vi pham, gay roi\n' +
                '▸ **Hop tac / Gop y** — Lien he hop tac, dong gop y kien'
            )
            .addFields(
                { name: '◈ Luu y', value: 'Moi nguoi chi duoc mo 1 ticket tai mot thoi diem.\nTicket se bi dong khi van de da duoc giai quyet.', inline: false }
            )
            .setFooter({ text: 'He thong quan ly — Jkey va nhung dua tre' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_support')
                .setLabel('Ho tro chung')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_report')
                .setLabel('Khieu nai / Bao cao')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_feedback')
                .setLabel('Hop tac / Gop y')
                .setStyle(ButtonStyle.Secondary)
        );

        await hoTroChannel.send({ embeds: [embed], components: [row] });
        console.log(`✅ Đã post ticket panel vào #ho-tro!`);
        console.log(`\nChannel ID: ${hoTroChannel.id}`);

    } catch (e) {
        console.error('Lỗi:', e);
    } finally {
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
