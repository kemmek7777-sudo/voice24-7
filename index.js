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
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers // مطلوب لجلب قائمة الأعضاء للاستدعاء
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1418960523747397755';
const GUILD_ID = '1320900808195178567';
const VOICE_CHANNEL_ID = '1540033851387023410'; 

// بث الصمت لمنع الطرد من الصوت
class SilenceStream extends Readable {
    _read() { this.push(Buffer.from([0xf8, 0xff, 0xfe])); }
}

function connectToVoice() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return console.log('Guild not found!');
        
        const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
        if (!channel) return console.log('Voice Channel not found!');

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

// تسجيل الأوامر Slash Commands (يشمل /setupticket و /ak)
const commands = [
    new SlashCommandBuilder()
        .setName('setupticket')
        .setDescription('إنشاء لوحة التذاكر المتقدمة'),
    new SlashCommandBuilder()
        .setName('ak')
        .setDescription('إرسال رسالة جماعية لجميع أعضاء السيرفر في الخاص')
        .addStringOption(option => 
            option.setName('message')
                .setDescription('الرسالة المراد إرسالها للأعضاء')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('tag_user')
                .setDescription('هل تريد إدراج تاغ/منشن للمستخدم في بداية الرسالة؟ (true / false)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('delay')
                .setDescription('المدة الزمنية بين كل رسالة ورسالة بالثواني (مثال: 2)')
                .setRequired(false))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    setTimeout(() => {
        connectToVoice();
    }, 2000);

    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('تم تسجيل الأوامر بنجاح!');
    } catch (e) { console.error(e); }
});

// الاستجابة عند الإشارة (Mention) للبوت
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.mentions.has(client.user) && !message.mentions.everyone) {
        await message.reply('Hello, how can I help you?\nمرحبا كيف اساعدك ؟');
    }
});

// التعامل مع الأوامر والتفاعلات
client.on('interactionCreate', async (interaction) => {

    // --- أمر الإذاعة الجماعية /ak ---
    if (interaction.isChatInputCommand() && interaction.commandName === 'ak') {
        // التحقق من صلاحية الإدارة للحدث
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ هذا الأمر مخصص للإداريين فقط!', ephemeral: true });
        }

        const messageContent = interaction.options.getString('message');
        const tagUser = interaction.options.getBoolean('tag_user');
        const delaySeconds = interaction.options.getInteger('delay') || 1; // التأخير الافتراضي 1 ثانية

        await interaction.reply({ content: '⏳ جاري بدء إرسال الرسائل للأعضاء...', ephemeral: true });

        // جلب جميع أعضاء السيرفر
        const members = await interaction.guild.members.fetch();
        const humanMembers = members.filter(m => !m.user.bot); // استبعاد البوتات

        let successCount = 0;
        let failCount = 0;

        for (const [id, member] of humanMembers) {
            try {
                let finalMessage = messageContent;
                if (tagUser) {
                    finalMessage = `${member} ${messageContent}`;
                }

                await member.send(finalMessage);
                successCount++;
            } catch (error) {
                // فشل الإرسال (مثلاً الخاص مغلق لدى العضو)
                failCount++;
            }

            // الانتظار بين الرسائل لتجنب الحظر (Rate Limit)
            if (delaySeconds > 0) {
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            }
        }

        // إرسال التقرير النهائي للآدمن
        const summaryEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('📢 اكتملت عملية الإذاعة (Broadcast)')
            .addFields(
                { name: '👥 إجمالي الأعضاء', value: `${humanMembers.size}`, inline: true },
                { name: '✅ تم الإرسال بنجاح', value: `${successCount}`, inline: true },
                { name: '❌ فشل الإرسال (خاص مغلق)', value: `${failCount}`, inline: true },
                { name: '⏱️ التأخير المحدد', value: `${delaySeconds} ثانية`, inline: true }
            )
            .setTimestamp();

        await interaction.followUp({ embeds: [summaryEmbed], ephemeral: true });
    }

    // --- أمر /setupticket ---
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

    // باقي أحداث التذاكر...
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
