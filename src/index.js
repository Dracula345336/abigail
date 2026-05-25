require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Collection,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

/* ═══════════════════════════════════════════
   💕  Romantic Message Banks
   ═══════════════════════════════════════════ */

const AFK_SET_MESSAGES = [
  "Sweetheart, you're now AFK 💕\nGo take care of yourself — I'll be right here waiting for you 🌸",
  "Off you go, my love! The server will miss your warmth 🌹\nCome back soon! 💖",
  "You're stepping away for a bit? Don't worry,\nI'll keep your spot warm until you return 🧡",
  "Take all the time you need, darling 💫\nWe'll be right here when you come back 💕",
  "Going AFK, pretty soul? 🌙\nMay your time away be as lovely as you are 🌺",
];

const AFK_RETURN_MESSAGES = [
  "Welcome back, my love! 💕\nI missed you more than words can say 🥰",
  "There you are, darling! My heart just skipped a beat 💌\nIt's so good to have you back!",
  "You're back! The world feels whole again 💖\nHow I've waited for this moment ✨",
  "My favorite person returned! 🌸\nEverything is brighter with you here 🌟",
  "Oh, how I've missed you! 💝\nWelcome back to our little world, sweetheart",
  "The wait is over! 🦋\nYou're back and my heart is so full right now 💕",
  "Look who's back! 😍\nThe server wasn't the same without you, darling 🌹",
];

const AFK_MENTION_MESSAGES = [
  "Shh… they're away right now 🌙\nBut they'll be back, and it'll be worth the wait 💕",
  "They stepped out for a moment 🌸\nLeave them some love for when they return 💖",
  "Patience, sweetheart… they're AFK 💫\nBut they'll miss you when they're back 🥰",
  "That lovely soul is away right now 🌙\nDrop a heart and they'll see it later 💝",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timeSince(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const parts = [];
  if (d)  parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h % 24) parts.push(`${h % 24} hr${h % 24 > 1 ? 's' : ''}`);
  if (m % 60) parts.push(`${m % 60} min${m % 60 > 1 ? 's' : ''}`);
  if (!parts.length) parts.push('a few seconds');
  return parts.join(' ');
}

/* ═══════════════════════════════════════════
   🤖  Client Setup
   ═══════════════════════════════════════════ */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();

// Load slash commands
const cmdPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(`./commands/${file}`);
  if ('data' in cmd && 'execute' in cmd) client.commands.set(cmd.data.name, cmd);
}

/* ═══════════════════════════════════════════
   🟢  Ready
   ═══════════════════════════════════════════ */

client.once('ready', () => {
  console.log(`💖 ${client.user.tag} is online and spreading love!`);
  client.user.setActivity('💕 Watching over you');
});

/* ═══════════════════════════════════════════
   ⚡  Slash Command Handler
   ═══════════════════════════════════════════ */

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Command error:', error);
    const reply = { content: '💔 Something went wrong, sweetheart!', ephemeral: true };
    interaction.replied || interaction.deferred
      ? await interaction.followUp(reply)
      : await interaction.reply(reply);
  }
});

/* ═══════════════════════════════════════════
   💬  Message Handler  (AFK System)
   ═══════════════════════════════════════════ */

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  /* ── 1.  !afk command ── */
  if (message.content.toLowerCase().startsWith('!afk')) {
    const reason = message.content.slice(4).trim() || 'Just stepped away for a moment 💫';

    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: message.author.id,
        guild_id: message.guild.id,
        afk_time: new Date().toISOString(),
        reason,
        avatar_url: message.author.displayAvatarURL({ dynamic: true, size: 256 }),
        username: message.author.username,
      }, { onConflict: 'user_id,guild_id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return message.reply('💔 Something went wrong setting your AFK status!');
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${message.member.displayName} is now AFK`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('🌙 AFK Mode Activated')
      .setDescription(pick(AFK_SET_MESSAGES))
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '📝 Reason', value: `*${reason}*`, inline: true },
        { name: '⏰ Went away', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `💕 I'll be waiting for you, ${message.author.username}…` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  /* ── 2.  Returning from AFK ── */
  const { data: afkData } = await supabase
    .from('afk_users')
    .select('*')
    .eq('user_id', message.author.id)
    .eq('guild_id', message.guild.id)
    .maybeSingle();

  if (afkData) {
    const away = timeSince(afkData.afk_time);

    const embed = new EmbedBuilder()
      .setColor(0xFF1493)
      .setAuthor({
        name: `${message.member.displayName} is back!`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('💝 Welcome Back!')
      .setDescription(pick(AFK_RETURN_MESSAGES))
      .setThumbnail(afkData.avatar_url || message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '⏰ You were away for', value: `**${away}**`, inline: true },
        { name: '📝 Your reason was', value: `*${afkData.reason}*`, inline: true },
      )
      .setFooter({ text: '💫 So glad you\'re back!' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    // Remove AFK record
    await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', message.author.id)
      .eq('guild_id', message.guild.id);
  }

  /* ── 3.  Mentioned an AFK user ── */
  if (message.mentions.users.size > 0) {
    for (const [userId] of message.mentions.users) {
      if (userId === message.author.id) continue; // skip self-mention

      const { data: mentionedAfk } = await supabase
        .from('afk_users')
        .select('*')
        .eq('user_id', userId)
        .eq('guild_id', message.guild.id)
        .maybeSingle();

      if (mentionedAfk) {
        const away = timeSince(mentionedAfk.afk_time);

        const embed = new EmbedBuilder()
          .setColor(0xE91E63)
          .setAuthor({
            name: `${mentionedAfk.username} is currently AFK`,
            iconURL: mentionedAfk.avatar_url,
          })
          .setTitle('🌙 They\'re Away Right Now')
          .setDescription(pick(AFK_MENTION_MESSAGES))
          .setThumbnail(mentionedAfk.avatar_url)
          .addFields(
            { name: '📝 Reason', value: `*${mentionedAfk.reason}*`, inline: true },
            { name: '⏰ Away for', value: `**${away}**`, inline: true },
          )
          .setFooter({ text: `💤 ${mentionedAfk.username} will be back soon` })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
        break; // one AFK notice per message to avoid spam
      }
    }
  }
});

/* ═══════════════════════════════════════════
   🔑  Login
   ═══════════════════════════════════════════ */

client.login(process.env.DISCORD_TOKEN);
