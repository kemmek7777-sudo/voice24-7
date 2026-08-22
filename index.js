const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ChannelType, 
    PermissionsBitField 
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    VoiceConnectionStatus, 
    entersState 
} = require('@discordjs/voice');
const { Readable } = require('stream');
const express = require('express');

// --- 1. خادم Web لإبقاء الاستضافة متصلة ---
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is online 24/7!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- 2. إعدادات ديسكورد ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1418960523747397755';
const GUILD_ID = '1320900808195178567'; // آيدي سيرفرك
const VOICE_CHANNEL_ID = '1540033851387023410';
// دالة البث الصامت لمنع الطرد بعد 20 دقيقة
class SilenceStream extends Readable {
    _read() {
        this.push(Buffer.from([0xf8, 0xff, 0xfe]));
    }
}

function connectToVoice() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        const channel = guild?.channels.cache.get(VOICE_CHANNEL_ID);
        if (!guild || !channel) return;

        const connection = joinVoiceChannel({
            channelId: VOICE_CHANNEL_ID,
            guildId: GUILD_ID,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(new SilenceStream());
        player.play(resource);
        connection.subscribe(player);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (e) {
                connection.destroy();
                connectToVoice();
            }
        });
    } catch (error) {
        console.error('Voice connection error:', error);
    }
}

// تسليط أجهزة /setup
const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('إنشاء لوحة التذاكر')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    connectToVoice(); // دخول الفويس فوراً
    
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } catch (error) { me }
});

// نظام التكت
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        const ticketEmbed = new EmbedBuilder()
            .setColor('#1E1F22')
            .setDescription(
                '⚠️ **تستطيع فتح تذكره من هنا** ⚠️\n' +
                '✅ **و سوف تنتهي مشكلتك من طرف الدعم الفني** ✅\n' +
                '🐱 **نتمنى وجود سبب مقنع لفتح تذكره** 🐱\n' +
                '🎵 **تستطيع فتح تذكره للحصول على رولات** 🎵'
            )
            .setImage('https://i.imgur.com/8N4kG8l.png');

        const buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_problem').setLabel('ابلاغ عن مشكل').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_help').setLabel('مساعدة').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_minecraft').setLabel('Minecraft').setEmoji('🧱').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_media').setLabel('Media role').setEmoji('▶️').setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [ticketEmbed], components: [buttonsRow] });
        return interaction.reply({ content: 'تم إرسال اللوحة بنجاح!', ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        const ticketType = interaction.customId.replace('ticket_', '');
        const guild = interaction.guild;
        const user = interaction.user;

        const channelName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        const existingChannel = guild.channels.cache.find(c => c.name === channelName);
        
        if (existingChannel) {
            return interaction.reply({ content: `لديك تذكرة مفتوحة بالفعل: ${existingChannel}`, ephemeral: true });
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
            ]
        });

        const welcomeEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`تذكرة جديدة: ${ticketType.toUpperCase()}`)
            .setDescription(`مرحباً بك ${user}، أهلاً بك في الدعم الفني. يرجى توضيح طلبك وسيتم الرد عليك قريباً.`);

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `${user}`, embeds: [welcomeEmbed], components: [closeButton] });
        await interaction.reply({ content: `تم فتح تذكرتك بنجاح: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        await interaction.reply('سيتم إغلاق التذكرة خلال 5 ثوانٍ...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

client.login(TOKEN);
