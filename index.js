const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    PermissionsBitField 
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { Readable } = require('stream');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

let isBotActive = true;

// --- خوادم الـ API للوحة التحكم ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/status', (req, res) => {
    res.json({ 
        status: isBotActive ? 'ONLINE' : 'OFFLINE',
        ping: client.ws ? client.ws.ping : 0,
        guilds: client.guilds ? client.guilds.cache.size : 0,
        uptime: client.uptime || 0
    });
});

app.post('/api/control', (req, res) => {
    const { action } = req.body;
    if (action === 'start' && !isBotActive) {
        client.login(TOKEN);
        isBotActive = true;
    } else if (action === 'stop' && isBotActive) {
        client.destroy();
        isBotActive = false;
    } else if (action === 'restart') {
        client.destroy();
        setTimeout(() => { client.login(TOKEN); isBotActive = true; }, 1500);
    }
    res.json({ success: true, status: isBotActive ? 'ONLINE' : 'OFFLINE' });
});

// إدارة الملفات (قراءة وحفظ)
app.get('/api/files', (req, res) => {
    fs.readdir(__dirname, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed' });
        res.json(files.filter(f => !f.startsWith('.') && f !== 'node_modules'));
    });
});

app.get('/api/file', (req, res) => {
    const filePath = path.join(__dirname, req.query.name);
    if (fs.existsSync(filePath)) {
        res.send(fs.readFileSync(filePath, 'utf8'));
    } else {
        res.status(404).send('Not Found');
    }
});

app.post('/api/file/save', (req, res) => {
    const { filename, content } = req.body;
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Gaming Panel Online on Port ${PORT}`));

// --- إعدادات وتفعيل الديسكورد بوت ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1418960523747397755';
const GUILD_ID = '1320900808195178567';

const commands = [
    new SlashCommandBuilder().setName('setupticket').setDescription('إنشاء لوحة التذاكر'),
    new SlashCommandBuilder()
        .setName('ak')
        .setDescription('إرسال رسالة جماعية')
        .addStringOption(opt => opt.setName('message').setDescription('الرسالة').setRequired(true))
        .addBooleanOption(opt => opt.setName('tag_user').setDescription('تضمين منشن؟').setRequired(true))
        .addIntegerOption(opt => opt.setName('member_count').setDescription('العدد').setRequired(false))
        .addIntegerOption(opt => opt.setName('delay').setDescription('التأخير').setRequired(false))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Bot Ready: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ak') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ مخصص للإداريين فقط!', ephemeral: true });
        }

        const messageContent = interaction.options.getString('message');
        const tagUser = interaction.options.getBoolean('tag_user');
        const memberCountInput = interaction.options.getInteger('member_count');
        const delaySeconds = interaction.options.getInteger('delay') || 1;

        await interaction.reply({ content: '⏳ جاري بدء الإرسال...', ephemeral: true });

        const fetchedMembers = await interaction.guild.members.fetch();
        let targetMembers = Array.from(fetchedMembers.values()).filter(m => !m.user.bot);

        if (memberCountInput && memberCountInput > 0) {
            targetMembers = targetMembers.slice(0, memberCountInput);
        }

        let successCount = 0;
        let failCount = 0;

        for (const member of targetMembers) {
            try {
                let finalMessage = tagUser ? `${member} ${messageContent}` : messageContent;
                await member.send(finalMessage);
                successCount++;
            } catch (error) { 
                failCount++; 
            }

            if (delaySeconds > 0) {
                await new Promise(r => setTimeout(r, delaySeconds * 1000));
            }
        }

        await interaction.followUp({ content: `✅ تم الإرسال بنجاح إلى ${successCount} عضو. (فشل: ${failCount})`, ephemeral: true });
    }
});

client.login(TOKEN);
