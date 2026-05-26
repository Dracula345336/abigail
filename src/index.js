require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  Collection,
  MessageFlags,
  Events,
  REST,
  Routes,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

/* ═══════════════════════════════════════════
   ✅  Environment Validation
   ═══════════════════════════════════════════ */

const REQUIRED_ENV = ['DISCORD_TOKEN'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('   Please check your .env file or environment configuration.');
  process.exit(1);
}

/* ═══════════════════════════════════════════
   🗄️  Supabase Client
   ═══════════════════════════════════════════ */

let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY)) {
  try {
    supabase = require('./db');
    if (supabase) {
      console.log('✅ Supabase ready — AFK features enabled!');
    }
  } catch (err) {
    console.error('❌ Failed to initialize Supabase:', err.message);
    console.error('   AFK features will be disabled.');
  }
} else {
  console.warn('⚠️  SUPABASE_URL or database key not set — AFK features will be disabled.');
  console.warn('   Set SUPABASE_SERVICE_KEY (best) or SUPABASE_KEY from Supabase Dashboard → Settings → API');
}

const { AFK_SET_MESSAGES, AFK_BREAK_MESSAGES, AFK_RETURN_MESSAGES, AFK_MENTION_MESSAGES } = require('./messages');
const { pick, timeSince } = require('./utils');

// AFK nickname helpers
function getAfkNickname(currentNickname, username) {
  const base = currentNickname || username;
  const clean = base.replace(/^\[AFK\]\s*/, '');
  return `[AFK] ${clean}`;
}
function getNormalNickname(currentNickname, username) {
  const base = currentNickname || username;
  return base.replace(/^\[AFK\]\s*/, '') || username;
}

// AFK role helper
const AFK_ROLE_NAME = 'AFK';
async function getAfkRole(guild) {
  let role = guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: AFK_ROLE_NAME,
        color: 0x808080,
        hoist: true,  // Show separately in member list!
        mentionable: false,
        reason: 'Auto-created AFK role for Sweetheart Bot',
      });
      console.log(`✅ Created AFK role in ${guild.name}`);
    } catch (err) {
      console.error('Could not create AFK role:', err.message);
      return null;
    }
  }
  return role;
}

/* ═══════════════════════════════════════════
   🤖  Client Setup

   Intents used:
     - Guilds          → basic server info (non-privileged)
     - GuildMessages   → receive message events (non-privileged)
     - MessageContent  → read message text for !afk ?afk .afk commands (PRIVILEGED)

   ⚠️  MessageContent is a PRIVILEGED intent — you MUST enable it in:
       Discord Developer Portal → Bot → Privileged Gateway Intents → Message Content Intent
   ═══════════════════════════════════════════ */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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
   🔍  Snipe Storage (deleted messages)
   ═══════════════════════════════════════════ */

client.snipes = new Map();
client.mimicLog = new Map();
client.mimicAccess = new Map();



/* ═══════════════════════════════════════════
   🟢  Ready + Auto-Register Slash Commands
   ═══════════════════════════════════════════ */

client.once(Events.ClientReady, async () => {
  console.log(`💖 ${client.user.tag} is online and spreading love!`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
  client.user.setActivity('💕 Watching over you');

  // ── Auto-register slash commands on startup ──
  if (!process.env.CLIENT_ID) {
    console.error('');
    console.error('⚠️  CLIENT_ID is not set — slash commands will NOT be registered!');
    console.error('   Add CLIENT_ID to your environment variables.');
    console.error('   Get it from: https://discord.com/developers/applications → General Information → Application ID');
    console.error('');
    return;
  }

  const commands = [];
  for (const [, cmd] of client.commands) {
    commands.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    if (process.env.GUILD_ID) {
      // Guild commands = INSTANT (use for testing/dev)
      console.log(`🔄 Registering ${commands.length} guild slash command(s) [instant]...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Guild slash commands registered! Commands should appear instantly.');
    } else {
      // Global commands = up to 1 hour delay
      console.log(`🔄 Registering ${commands.length} global slash command(s)...`);
      console.log('   ⚠️  No GUILD_ID set — using global registration.');
      console.log('   ⚠️  Global commands can take up to 1 HOUR to appear in Discord!');
      console.log('   💡 Add GUILD_ID to .env for instant guild registration.');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Global slash commands registered! They may take up to 1 hour to appear.');
    }
  } catch (error) {
    console.error('❌ Slash command registration failed:', error.message);
    if (error.status === 401) {
      console.error('   Your DISCORD_TOKEN may be invalid.');
    } else if (error.status === 403) {
      console.error('   Your CLIENT_ID may not match the bot application.');
    } else if (error.status === 404 && process.env.GUILD_ID) {
      console.error('   Your GUILD_ID may be incorrect.');
    }
    // Don't exit — bot still works for message events, just no slash commands
  }
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
    const reply = { content: '💔 Something went wrong, sweetheart!', flags: MessageFlags.Ephemeral };
    interaction.replied || interaction.deferred
      ? await interaction.followUp(reply)
      : await interaction.reply(reply);
  }
});

/* ═══════════════════════════════════════════
   💬  Message Handler  (AFK Prefix Commands, Return & Mentions)

   Supports prefix commands: !afk, ?afk, .afk
   - !afk [reason]     → set AFK with optional reason
   - !afk break        → set AFK as "on a break"
   - ?afk / .afk       → same thing
   - Any message from an AFK user → welcome back & remove AFK
   - Mentioning an AFK user → show AFK status
   ═══════════════════════════════════════════ */

// AFK prefix: !afk, ?afk, .afk
const AFK_PREFIXES = ['!afk', '?afk', '.afk'];

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!supabase) return; // Skip AFK features if Supabase isn't configured

  const username = message.member?.displayName || message.author.username;
  const content = message.content.toLowerCase().trim();

  /* ── 0. Prefix AFK Command: !afk, ?afk, .afk ── */
  const matchedPrefix = AFK_PREFIXES.find(p => content.startsWith(p));
  if (matchedPrefix) {
    const args = message.content.slice(matchedPrefix.length).trim();
    const isBreak = args.toLowerCase().startsWith('break');
    const reason = isBreak
      ? (args.slice(5).trim() || 'Taking a break ☕')
      : (args || 'Just stepped away for a moment 💫');

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
      return message.reply('💔 Something went wrong! **Quick fix:** Go to Supabase Dashboard → SQL Editor → Run: `ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;`').catch(console.error);
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${username} is now ${isBreak ? 'on a break' : 'AFK'}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(isBreak ? '☕ Break Time!' : '🌙 AFK Mode Activated')
      .setDescription(pick(isBreak ? AFK_BREAK_MESSAGES : AFK_SET_MESSAGES))
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '📝 Reason', value: `*${reason}*`, inline: true },
        { name: '⏰ Went away', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: `💕 I'll be waiting for you, ${message.author.username}…` })
      .setTimestamp();

    // Add AFK role
    const afkRole = await getAfkRole(message.guild);
    if (afkRole && message.member && !message.member.roles.cache.has(afkRole.id)) {
      try { await message.member.roles.add(afkRole, 'User went AFK'); } catch (e) { console.error('Could not add AFK role:', e.message); }
    }

    // Set [AFK] nickname
    if (message.member) {
      try {
        const afkNick = getAfkNickname(message.member.nickname, message.author.username);
        await message.member.setNickname(afkNick, 'User went AFK');
      } catch (e) { console.error('Could not set AFK nickname:', e.message); }
    }

    return message.reply({ embeds: [embed] }).catch(console.error);
  }

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
      return;
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

      // Remove AFK role
      const afkRoleRemove = message.guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
      if (afkRoleRemove && message.member?.roles.cache.has(afkRoleRemove.id)) {
        try { await message.member.roles.remove(afkRoleRemove, 'User returned from AFK'); } catch (e) { console.error('Could not remove AFK role:', e.message); }
      }

      // Remove [AFK] nickname
      if (message.member) {
        try {
          const normalNick = getNormalNickname(message.member.nickname, message.author.username);
          await message.member.setNickname(normalNick, 'User returned from AFK');
        } catch (e) { console.error('Could not remove AFK nickname:', e.message); }
      }

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
        if (userId === message.author.id) continue;

        const cooldownKey = `${message.author.id}-${userId}`;
        const now = Date.now();
        const lastNotified = mentionCooldowns.get(cooldownKey);
        if (lastNotified && now - lastNotified < AFK_MENTION_COOLDOWN) {
          continue;
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
          break;
        }
      }
    } catch (err) {
      console.error('Error in AFK mention handler:', err);
    }
  }

  // Periodically clean up stale cooldowns
  if (mentionCooldowns.size > 1000) {
    const cutoff = Date.now() - AFK_MENTION_COOLDOWN;
    for (const [key, timestamp] of mentionCooldowns) {
      if (timestamp < cutoff) mentionCooldowns.delete(key);
    }
  }
});

/* ═══════════════════════════════════════════
   🔍  Message Delete Handler (Snipe)
   ═══════════════════════════════════════════ */

client.on('messageDelete', (message) => {
  if (!message.guild || message.author?.bot) return;

  client.snipes.set(message.channel.id, {
    content: message.content,
    author: message.author,
    timestamp: message.createdAt,
    attachments: message.attachments ? [...message.attachments.values()] : [],
  });

  // Auto-clean: only keep last 50 channels
  if (client.snipes.size > 50) {
    const firstKey = client.snipes.keys().next().value;
    client.snipes.delete(firstKey);
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
    console.error('Go to the Discord Developer Portal and enable them:');
    console.error('  1. https://discord.com/developers/applications');
    console.error('  2. Select your application → Bot → Privileged Gateway Intents');
    console.error('════════════════════════════════════════════════════════');
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
