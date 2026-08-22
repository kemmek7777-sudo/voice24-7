const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
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

// --- 1. خادم Web لتجاوز خمول Render ---
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is online 24/7!'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- 2. إعدادات البوت ---
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
const GUILD_ID = '1320900808195178567';
const VOICE_CHANNEL_ID = '1540033851387023410';

// دالة بث الصمت لمنع ديسكورد من طرد البوت بعد 20 دقيقة
class SilenceStream extends Readable {
    _read() { this.push(Buffer.from([0xf8, 0xff, 0xfe])); }
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
        player.play(createAudioResource(new SilenceStream()));
        connection.subscribe(player);

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
                ]);
            } catch (e) {
                connection.destroy();
                connectToVoice();
            }
        });
    } catch (error) {
        console.error('Voice error:', error);
    }
}

// تسجيل أمر /setupticket
const commands = [
    new SlashCommandBuilder().setName('setupticket').setDescription('إنشاء لوحة التذاكر المتقدمة')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    connectToVoice(); // دخول الروم الصوتي فور تشغيل البوت
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    } catch (e) { console.error(e); }
});

// التعامل مع الأوامر والتذاكر
client.on('interactionCreate', async (interaction) => {
    
    // 1. أمر /setupticket
    if (interaction.isChatInputCommand() && interaction.commandName === 'setupticket') {
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
            new ButtonBuilder().setCustomId('t_problem').setLabel('ابلاغ عن مشكل').setEmoji('⚠️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('t_help').setLabel('مساعدة').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('t_mc').setLabel('Minecraft').setEmoji('🧱').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('t_media').setLabel('Media role').setEmoji('▶️').setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [ticketEmbed], components: [buttonsRow] });
        return interaction.reply({ content: 'تم إنشاء لوحة التذاكر بنجاح!', ephemeral: true });
    }

    // 2. ضغط زر فتح تذكرة
    if (interaction.isButton() && interaction.customId.startsWith('t_')) {
        const guild = interaction.guild;
        const user = interaction.user;
        const channelName = `ticket-${user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

        if (guild.channels.cache.find(c => c.name === channelName)) {
            return interaction.reply({ content: 'لديك تذكرة مفتوحة بالفعل!', ephemeral: true });
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
            ]
        });

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('تذكرة جديدة')
            .setDescription(`مرحباً بك ${user}، يرجى كتابة مشكلتك وانتظار الدعم الفني.`);

        const controlsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('استلام التذكرة').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('close_menu').setLabel('إغلاق التذكرة').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `${user}`, embeds: [embed], components: [controlsRow] });
        return interaction.reply({ content: `تم فتح تذكرتك: ${ticketChannel}`, ephemeral: true });
    }

    // 3. استلام التذكرة (Claim)
    if (interaction.isButton() && interaction.customId === 'claim_ticket') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.reply({ content: 'هذا الزر مخصص للإدارة فقط!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setDescription(`✅ تم استلام هذه التذكرة بواسطة الإداري: ${interaction.user}`);

        await interaction.reply({ embeds: [embed] });

        const currentComponents = interaction.message.components;
        const disabledRow = ActionRowBuilder.from(currentComponents[0]);
        disabledRow.components[0].setDisabled(true);
        
        await interaction.message.edit({ components: [disabledRow] });
    }

    // 4. إظهار قائمة خيارات الإغلاق
    if (interaction.isButton() && interaction.customId === 'close_menu') {
        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('close_options')
                .setPlaceholder('اختر سبب/طريقة الإغلاق...')
                .addOptions([
                    { label: 'تم حل المشكلة', value: 'تم حل المشكلة بنجاح', emoji: '✅' },
                    { label: 'عدم الرد من العضو', value: 'تم الإغلاق لعدم تجاوب العضو', emoji: '⏱️' },
                    { label: 'فتح تذكرة بدون سبب', value: 'تذكرة غير صالحة / بدون سبب', emoji: '❌' },
                    { label: 'إلغاء الإغلاق', value: 'cancel', emoji: '🔄' }
                ])
        );

        return interaction.reply({ content: 'حدد سبب إغلاق التذكرة:', components: [selectMenu], ephemeral: true });
    }

    // 5. معالجة الإغلاق وإرسال الرسالة في الخاص (DM)
    if (interaction.isStringSelectMenu() && interaction.customId === 'close_options') {
        const reason = interaction.values[0];
        if (reason === 'cancel') {
            return interaction.update({ content: 'تم إلغاء عملية الإغلاق.', components: [] });
        }

        await interaction.update({ content: 'جاري إغلاق التذكرة وإرسال الإشعار...', components: [] });

        const channelName = interaction.channel.name;
        const member = interaction.guild.members.cache.find(m => channelName.includes(m.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')));

        if (member) {
            const dmEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setTitle('🔒 تم إغلاق تذكرتك')
                .addFields(
                    { name: 'السيرفر', value: `${interaction.guild.name}`, inline: true },
                    { name: 'بواسطة', value: `${interaction.user.tag}`, inline: true },
                    { name: 'السبب', value: `${reason}`, inline: false }
                )
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] }).catch(() => console.log('خاص العضو مغلق.'));
        }

        setTimeout(() => {
            interaction.channel.delete().catch(() => {});
        }, 3000);
    }
});

client.login(TOKEN);
