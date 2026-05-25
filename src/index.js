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
const { AFK_RETURN_MESSAGES, AFK_MENTION_MESSAGES } = require('./messages');
const { pick, timeSince } = require('./utils');

/* ═══════════════════════════════════════════
   ✅  Environment Validation
   ═══════════════════════════════════════════ */

const REQUIRED_ENV = ['DISCORD_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('   Please check your .env file or environment configuration.');
  process.exit(1);
}

/* ═══════════════════════════════════════════
   🤖  Client Setup

   Only NON-privileged intents are used:
     - Guilds         → basic server info (always free)
     - GuildMessages  → receive message events (always free)

   No MessageContent or GuildMembers intent needed!
   - AFK is a slash command (no prefix parsing)
   - Mimic uses interaction resolved data
   - Mention detection works without MessageContent
   ═══════════════════════════════════════════ */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();

// Cooldown tracking for AFK mention notifications
const mentionCooldowns = new Map();
const AFK_MENTION_COOLDOWN = 30_000; // 30 seconds between AFK notices per user pair

// Load slash commands
const cmdPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdPath).filter(f => f.endsWith('.js'))) {
  const cmd = require(`./commands/${file}`);
  if ('data' in cmd && 'execute' in cmd) {
    client.commands.set(cmd.data.name, cmd);
    console.log(`📁 Loaded command: /${cmd.data.name}`);
  }
}

/* ═══════════════════════════════════════════
   🟢  Ready
   ═══════════════════════════════════════════ */

client.once('ready', () => {
  console.log(`💖 ${client.user.tag} is online and spreading love!`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
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
   💬  Message Handler  (AFK Return & Mentions)

   This only needs GuildMessages intent (non-privileged).
   - Detects when AFK users return (they send any message)
   - Detects when someone mentions an AFK user
   ═══════════════════════════════════════════ */

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const username = message.member?.displayName || message.author.username;

  /* ── 1. Returning from AFK ── */
  try {
    const { data: afkData, error: dbError } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', message.author.id)
      .eq('guild_id', message.guild.id)
      .maybeSingle();

    if (dbError) {
      console.error('Supabase query error (AFK return check):', dbError);
      return; // Don't block user's message on a DB error
    }

    if (afkData) {
      const away = timeSince(afkData.afk_time);

      const embed = new EmbedBuilder()
        .setColor(0xFF1493)
        .setAuthor({
          name: `${username} is back!`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setTitle('💝 Welcome Back!')
        .setDescription(pick(AFK_RETURN_MESSAGES))
        .setThumbnail(afkData.avatar_url || message.author.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: '⏰ You were away for', value: `**${away}**`, inline: true },
          { name: '📝 Your reason was', value: `*${afkData.reason}*`, inline: true },
        )
        .setFooter({ text: "💫 So glad you're back!" })
        .setTimestamp();

      await message.reply({ embeds: [embed] }).catch(console.error);

      // Remove AFK record
      await supabase
        .from('afk_users')
        .delete()
        .eq('user_id', message.author.id)
        .eq('guild_id', message.guild.id);
    }
  } catch (err) {
    console.error('Error in AFK return handler:', err);
  }

  /* ── 2. Mentioned an AFK user ── */
  if (message.mentions.users.size > 0) {
    try {
      for (const [userId] of message.mentions.users) {
        if (userId === message.author.id) continue; // skip self-mention

        // Cooldown check — prevents AFK mention spam
        const cooldownKey = `${message.author.id}-${userId}`;
        const now = Date.now();
        const lastNotified = mentionCooldowns.get(cooldownKey);
        if (lastNotified && now - lastNotified < AFK_MENTION_COOLDOWN) {
          continue; // still on cooldown, skip this mention
        }

        const { data: mentionedAfk, error: dbError } = await supabase
          .from('afk_users')
          .select('*')
          .eq('user_id', userId)
          .eq('guild_id', message.guild.id)
          .maybeSingle();

        if (dbError) {
          console.error('Supabase query error (AFK mention check):', dbError);
          break;
        }

        if (mentionedAfk) {
          const away = timeSince(mentionedAfk.afk_time);

          const embed = new EmbedBuilder()
            .setColor(0xE91E63)
            .setAuthor({
              name: `${mentionedAfk.username} is currently AFK`,
              iconURL: mentionedAfk.avatar_url,
            })
            .setTitle("🌙 They're Away Right Now")
            .setDescription(pick(AFK_MENTION_MESSAGES))
            .setThumbnail(mentionedAfk.avatar_url)
            .addFields(
              { name: '📝 Reason', value: `*${mentionedAfk.reason}*`, inline: true },
              { name: '⏰ Away for', value: `**${away}**`, inline: true },
            )
            .setFooter({ text: `💤 ${mentionedAfk.username} will be back soon` })
            .setTimestamp();

          await message.reply({ embeds: [embed] }).catch(console.error);
          mentionCooldowns.set(cooldownKey, now);
          break; // one AFK notice per message to avoid spam
        }
      }
    } catch (err) {
      console.error('Error in AFK mention handler:', err);
    }
  }

  // Periodically clean up stale cooldowns (every ~100 messages per process)
  if (mentionCooldowns.size > 1000) {
    const cutoff = Date.now() - AFK_MENTION_COOLDOWN;
    for (const [key, timestamp] of mentionCooldowns) {
      if (timestamp < cutoff) mentionCooldowns.delete(key);
    }
  }
});

/* ═══════════════════════════════════════════
   🚨  Error Handling
   ═══════════════════════════════════════════ */

client.on('error', (error) => {
  if (error.message && error.message.includes('disallowed intents')) {
    console.error('');
    console.error('════════════════════════════════════════════════════════');
    console.error('❌ DISALLOWED INTENTS ERROR');
    console.error('════════════════════════════════════════════════════════');
    console.error('Your bot is requesting intents that are not enabled.');
    console.error('');
    console.error('If you have added privileged intents back, you must');
    console.error('enable them in the Discord Developer Portal:');
    console.error('');
    console.error('  1. Go to https://discord.com/developers/applications');
    console.error('  2. Select your application');
    console.error('  3. Navigate to Bot → Privileged Gateway Intents');
    console.error('  4. Enable the required intents');
    console.error('  5. Save changes and restart the bot');
    console.error('════════════════════════════════════════════════════════');
    console.error('');
    process.exit(1);
  }
  console.error('Client error:', error);
});

client.on('warn', (warning) => {
  console.warn('⚠️ Warning:', warning);
});

/* ═══════════════════════════════════════════
   🔑  Login
   ═══════════════════════════════════════════ */

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login:', error.message);
  if (error.message && error.message.includes('invalid token')) {
    console.error('   Your DISCORD_TOKEN may be incorrect. Check your .env file.');
  }
  process.exit(1);
});
