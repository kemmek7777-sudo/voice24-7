const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// إعدادات الروم الصوتي والسيرفر
const CHANNEL_ID = 'ضع_آيدي_الروم_الصوتي_هنا';
const GUILD_ID = 'ضع_آيدي_السيرفر_هنا';

function connectToVoice() {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;

    const channel = guild.channels.cache.get(CHANNEL_ID);
    if (!channel) return;

    // الاتصال بالروم الصوتي
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true, // لكتم صوت البوت لتوفير الموارد
        selfMute: false
    });

    // إعادة الاتصال تلقائياً في حال فصل أو حدث خطأ
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
        } catch (error) {
            connection.destroy();
            connectToVoice(); // إعادة الاتصال فوراً
        }
    });
}

client.once('ready', () => {
    console.log(`✅ البوت ${client.user.tag} متصل وجاهز!`);
    connectToVoice();
    
    // فحص دوري كل 5 دقائق للتأكد من أن البوت لا يزال داخل الروم
    setInterval(() => {
        connectToVoice();
    }, 300000);
});

client.login(process.env.DISCORD_TOKEN);