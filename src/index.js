require('dotenv').config();

// Keep-alive HTTP server for Render (required to prevent SIGTERM)
const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('💖 Sweetheart Bot is running!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});

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
const { WerewolfGame, GAME_STATE, ROLE, activeGames, NIGHT_TIMER, DAY_TIMER } = require('./werewolf');
const { pick, timeSince } = require('./utils');

/* ═══════════════════════════════════════════
   🐺 Werewolf Night/Day Phase Functions
   ═══════════════════════════════════════════ */

async function startNightPhase(game) {
  game.startNight();
  const channel = game.channel;
  if (!channel) return;

  const aliveList = game.getAlivePlayers().map(p => `**${p.number}.** ${p.user.username}`).join('\n');

  const nightEmbed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle(`🌙 Night ${game.round} — The Village Sleeps...`)
    .setDescription('The wolves are choosing their victim...\nThe doctor may save someone...\nThe seer may investigate...\n\n⏰ You have **60 seconds** for night actions!')
    .addFields({ name: '👥 Alive Players', value: aliveList || 'None', inline: false })
    .setFooter({ text: '🤫 Night actions are secret — check your DMs!' })
    .setTimestamp();
  await channel.send({ embeds: [nightEmbed] });

  // DM wolves, doctor, seer their night action reminders
  for (const [, player] of game.players) {
    if (!player.alive) continue;
    try {
      if (player.role === ROLE.WOLF) {
        await player.user.send(`🌙 **Night ${game.round}** — Choose your victim!\nUse \`w.kill <number>\`\n\nAlive players:\n${aliveList}`);
      } else if (player.role === ROLE.DOCTOR) {
        await player.user.send(`🌙 **Night ${game.round}** — Choose someone to save!\nUse \`w.save <number>\`\n\n⚠️ ${game.lastProtected ? `You saved <@${game.lastProtected}> last night — pick someone else!` : 'This is your first night — save anyone!'}\n\nAlive players:\n${aliveList}`);
      } else if (player.role === ROLE.SEER) {
        const checkList = game.getAlivePlayers().filter(p => p.user.id !== player.user.id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
        await player.user.send(`🌙 **Night ${game.round}** — Choose someone to investigate!\nUse \`w.check <number>\`\n\nOther alive players:\n${checkList}`);
      }
    } catch (err) {
      console.error(`Could not DM ${player.user.username}:`, err.message);
    }
  }

  // Night timer
  game.nightTimer = setTimeout(async () => {
    if (game.state !== GAME_STATE.NIGHT) return;
    // Night ended — resolve
    const results = game.resolveNight();
    await startDayPhase(game, results);
  }, NIGHT_TIMER * 1000);
}

async function startDayPhase(game, nightResults) {
  game.startDay();
  const channel = game.channel;
  if (!channel) return;

  // Announce night results
  let dayDesc = '';
  if (nightResults.killed) {
    dayDesc = `💀 **${nightResults.killed.user.username}** was killed by the wolves last night!\nThey were a **${nightResults.killed.role}**.`;
  } else if (nightResults.saved) {
    dayDesc = '🏥 **Someone was attacked but the doctor saved them!**\nNo one died last night.';
  } else if (nightResults.wolfTarget) {
    dayDesc = '🌙 The wolves chose a target... but no one died.';
  } else {
    dayDesc = '🌙 A quiet night... no one was attacked.';
  }

  // Check win after night kill
  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xFF0000 : 0x00FF00)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Wolves Win!' : '🏘️ Villagers Win!')
      .setDescription(`${dayDesc}\n\n${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  const aliveList = game.getPlayerListString();
  const dayEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`☀️ Day ${game.round} — Discuss & Vote!`)
    .setDescription(`${dayDesc}\n\nDiscuss who you think is a wolf!\nVote with \`w.shoot <number>\``)
    .addFields({ name: `👥 Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false })
    .setFooter({ text: `⏰ You have ${DAY_TIMER} seconds to vote!` })
    .setTimestamp();
  await channel.send({ embeds: [dayEmbed] });

  // Day timer
  game.dayTimer = setTimeout(async () => {
    if (game.state !== GAME_STATE.DAY) return;
    await resolveDayVote(game);
  }, DAY_TIMER * 1000);
}

async function resolveDayVote(game) {
  if (game.state !== GAME_STATE.DAY) return;
  const channel = game.channel;
  if (!channel) return;

  // Clear day timer
  if (game.dayTimer) { clearTimeout(game.dayTimer); game.dayTimer = null; }

  const tally = game.tallyVotes();
  const tallyEmbed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('🗳️ Vote Results!')
    .setDescription(tally.message)
    .setTimestamp();
  await channel.send({ embeds: [tallyEmbed] });

  // Check win
  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xFF0000 : 0x00FF00)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Wolves Win!' : '🏘️ Villagers Win!')
      .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  // Next night
  await startNightPhase(game);
}

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
    GatewayIntentBits.GuildMembers,   // Required for AFK role + nickname changes
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
  if (message.author.bot) return;

  /* ── DM Handler for Werewolf Night Actions ── */
  if (!message.guild) {
    const msgContent = message.content.toLowerCase().trim();
    if (msgContent.startsWith('w.')) {
      const args = message.content.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === 'w.kill' || cmd === 'w.save' || cmd === 'w.check') {
        let foundGame = null;
        for (const [, g] of activeGames) {
          if (g.players.has(message.author.id) && g.state !== GAME_STATE.ENDED) {
            foundGame = g;
            break;
          }
        }
        if (!foundGame) {
          return message.reply('🚫 You are not in any active game!');
        }
        if (foundGame.state !== GAME_STATE.NIGHT) {
          return message.reply('🌙 Night actions can only be used during the night!');
        }
        const targetNum = parseInt(args[1]);
        if (isNaN(targetNum)) {
          return message.reply(`❌ Use \`${cmd} <number>\` — Example: \`${cmd} 3\``);
        }

        let result;
        if (cmd === 'w.kill') result = foundGame.wolfKill(message.author.id, targetNum);
        else if (cmd === 'w.save') result = foundGame.doctorSave(message.author.id, targetNum);
        else if (cmd === 'w.check') result = foundGame.seerCheck(message.author.id, targetNum);

        if (result) return message.reply(result.message);
      } else if (cmd === 'w.help') {
        return message.reply('🐺 **Werewolf DM Commands:**\n`w.kill <#>` — Wolf: choose victim\n`w.save <#>` — Doctor: protect someone\n`w.check <#>` — Seer: investigate someone');
      }
    }
    return;
  }

  const msgContent = message.content.toLowerCase().trim();

  /* ── Werewolf Game Commands ── */
  if (msgContent.startsWith('w.')) {
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    // ── Channel commands ──

    if (cmd === 'w.help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Werewolf — Wolfia Style')
        .setDescription('A game of deception with full Night/Day cycle!\n🌙 **Night:** Wolves kill, Doctor saves, Seer investigates\n☀️ **Day:** Discuss and vote to eliminate suspects')
        .addFields(
          { name: '🎮 Commands', value: '`w.join` — Join the game\n`w.start` — Start the game (HOST only)\n`w.shoot <#>` — Vote to eliminate (day)\n`w.kill <#>` — Wolf: choose victim (DM)\n`w.save <#>` — Doctor: protect someone (DM)\n`w.check <#>` — Seer: investigate (DM)\n`w.players` — See alive players\n`w.end` — End game (HOST only)', inline: false },
          { name: '🏘️ Villager', value: 'Vote during the day to eliminate wolves!', inline: true },
          { name: '🐺 Wolf', value: 'Kill at night! DM: `w.kill <#>`', inline: true },
          { name: '💊 Doctor', value: 'Save at night! DM: `w.save <#>`', inline: true },
          { name: '🔮 Seer', value: 'Check at night! DM: `w.check <#>`', inline: true },
          { name: '🏆 Win Conditions', value: '**Villagers win** = all wolves dead\n**Wolves win** = wolves >= villagers', inline: false },
          { name: '⏰ Timers', value: `Night: ${NIGHT_TIMER}s • Day: ${DAY_TIMER}s`, inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Werewolf' })
        .setTimestamp();
      return message.reply({ embeds: [helpEmbed] });
    }

    if (cmd === 'w.join') {
      let game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        game = new WerewolfGame(message.guild.id, message.channel.id, message.author.id);
        game.channel = message.channel;
        activeGames.set(message.channel.id, game);
      }
      const result = game.join(message.author);
      const isHost = game.hostId === message.author.id;
      const embed = new EmbedBuilder()
        .setColor(result.success ? 0x00FF00 : 0xFF0000)
        .setTitle('🐺 Werewolf Game')
        .setDescription(result.message + (result.success && isHost ? '\n👑 **You are the HOST!** Only you can `w.start` and `w.end` the game.' : ''))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'w.start') {
      let game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🐺 No Game').setDescription('No game in this channel! Use `w.join` first.').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 Not the Host').setDescription('Only the **host** can start the game!\nAsk the person who created the game to run `w.start`.').setTimestamp()] });
      }
      const result = game.start();
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🐺 Cannot Start').setDescription(result.message).setTimestamp()] });
      }

      const playerList = game.getPlayerListString();
      const startEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Werewolf Game Started!')
        .setDescription(`**${game.players.size} players** — **${result.wolfCount}** wolf/wolves among you!\n\n${playerList}\n\n🌙 **Night 1 begins...** Check your DMs!`)
        .setFooter({ text: '🐺 Deception begins!' })
        .setTimestamp();
      await message.reply({ embeds: [startEmbed] });

      // DM each player their role + instructions
      for (const [id, player] of game.players) {
        try {
          let roleMsg = '';
          if (player.role === ROLE.WOLF) {
            const otherWolves = game.getWolves().filter(w => w.user.id !== id);
            const wolfNames = otherWolves.map(w => `🐺 **${w.user.username}** (#${w.number})`).join('\n');
            roleMsg = `🐺 **You are a WOLF!**\n\nChoose a villager to kill each night.\nDM me: \`w.kill <number>\`\n\n${otherWolves.length > 0 ? `Your wolf teammates:\n${wolfNames}` : 'You are the only wolf!'}\n\n🤫 Don't reveal yourself!`;
          } else if (player.role === ROLE.DOCTOR) {
            const aliveList = game.getAlivePlayers().map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            roleMsg = `💊 **You are the DOCTOR!**\n\nChoose one person to save each night.\nDM me: \`w.save <number>\`\n\n⚠️ You cannot save the same person two nights in a row!\n\nAlive players:\n${aliveList}`;
          } else if (player.role === ROLE.SEER) {
            const aliveList = game.getAlivePlayers().filter(p => p.user.id !== id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            roleMsg = `🔮 **You are the SEER!**\n\nChoose one person to investigate each night.\nDM me: \`w.check <number>\`\n\nYou will learn if they are a wolf or not!\n\nOther alive players:\n${aliveList}`;
          } else {
            roleMsg = `🏘️ **You are a VILLAGER!**\n\nSurvive and find the wolves!\nDuring the day, use \`w.shoot <number>\` to vote.\n\n🌙 Sleep peacefully at night...`;
          }
          const dmEmbed = new EmbedBuilder()
            .setColor(player.role === ROLE.WOLF ? 0xFF0000 : player.role === ROLE.DOCTOR ? 0x00BFFF : player.role === ROLE.SEER ? 0x9B59B6 : 0x00FF00)
            .setTitle('🌙 Your Secret Role')
            .setDescription(roleMsg)
            .setFooter({ text: "🤫 Don't share your role with others!" })
            .setTimestamp();
          await player.user.send({ embeds: [dmEmbed] });
        } catch (err) {
          console.error(`Could not DM ${player.user.username}:`, err.message);
          await message.channel.send(`⚠️ Could not DM <@${id}> — tell them to enable DMs!`);
        }
      }

      // Start Night 1
      await startNightPhase(game);
      return;
    }

    if (cmd === 'w.shoot') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('No active game! Use `w.join` then `w.start`').setTimestamp()] });
      }
      if (game.state !== GAME_STATE.DAY) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('🌙 You can only vote during the day!').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('🗳️ Use `w.shoot <number>` — Example: `w.shoot 3`').setTimestamp()] });
      }
      const target = game.getPlayerByNumber(targetNum);
      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`🚫 Player #${targetNum} not found or already dead!`).setTimestamp()] });
      }
      const result = game.vote(message.author.id, target.user.id);
      if (result.success) {
        const voteCount = game.votes.size;
        const aliveCount = game.getAlivePlayers().length;
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🗳️ Vote Cast!')
          .setDescription(`${result.message}\n\n📊 **${voteCount}/${aliveCount}** votes cast`)
          .setTimestamp();
        await message.reply({ embeds: [embed] });

        // If all alive players voted, tally immediately
        if (voteCount >= aliveCount) {
          await resolveDayVote(game);
        }
      } else {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(result.message).setTimestamp()] });
      }
      return;
    }

    if (cmd === 'w.players') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('No game in this channel! Use `w.join` first.').setTimestamp()] });
      }
      const aliveList = game.getPlayerListString();
      const deadList = game.getDeadListString();
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`🐺 Players — Round ${game.round} (${game.state === GAME_STATE.NIGHT ? '🌙 Night' : '☀️ Day'})`)
        .addFields({ name: `✅ Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false });
      if (deadList) embed.addFields({ name: '💀 Eliminated', value: deadList, inline: false });
      embed.setFooter({ text: `Game state: ${game.state}` }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (cmd === 'w.end') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('No game to end!').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🚫 Not the Host').setDescription('Only the **host** can end the game!').setTimestamp()] });
      }
      const players = game.end();
      const playerList = game.getFullPlayerListString();
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Game Ended!')
        .setDescription(`The game was ended by the host.\n\n${playerList}`)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  }

  /* ── Handle DM commands for w.kill, w.save, w.check (sent from guild channel too) ── */
  // Also handle if someone types w.kill/w.save/w.check in channel (redirect to DM)
  if (message.guild && (msgContent.startsWith('w.kill ') || msgContent.startsWith('w.save ') || msgContent.startsWith('w.check '))) {
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    const game = activeGames.get(message.channel.id);

    if (!game || game.state === GAME_STATE.ENDED) {
      return message.reply('🚫 No active game in this channel!');
    }
    if (game.state !== GAME_STATE.NIGHT) {
      return message.reply('🌙 Night actions can only be used during the night!');
    }

    const targetNum = parseInt(args[1]);
    if (isNaN(targetNum)) {
      return message.reply(`❌ Use \`${cmd} <number>\` — Example: \`${cmd} 3\``);
    }

    let result;
    if (cmd === 'w.kill') result = game.wolfKill(message.author.id, targetNum);
    else if (cmd === 'w.save') result = game.doctorSave(message.author.id, targetNum);
    else if (cmd === 'w.check') result = game.seerCheck(message.author.id, targetNum);

    if (result) {
      // Reply via DM to keep it secret
      try {
        await message.author.send(result.message);
        // Delete the user's message in channel to keep it secret
        try { await message.delete(); } catch (e) { /* can't delete, no permission */ }
      } catch (e) {
        // Can't DM, reply ephemeral-like
        await message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x00FF00 : 0xFF0000).setDescription(result.message).setTimestamp()] }).then(m => {
          setTimeout(() => m.delete().catch(() => {}), 5000);
        });
      }
    }
    return;
  }

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

    const styledDesc = `${pick(isBreak ? AFK_BREAK_MESSAGES : AFK_SET_MESSAGES)}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${reason}\`\n┗ ⏱️ **Went away:** <t:${Math.floor(Date.now() / 1000)}:R>`;

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setAuthor({
        name: `${username} is now ${isBreak ? 'on a break' : 'AFK'}`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(isBreak ? '☕ Break Time!' : '🌙 AFK Mode Activated')
      .setDescription(styledDesc)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `💕 I'll be waiting for you, ${message.author.username}…` })
      .setTimestamp();

    // Add AFK role + Set [AFK] nickname
    const isOwner = message.guild.ownerId === message.author.id;
    const afkRole = await getAfkRole(message.guild);
    if (afkRole && message.member) {
      if (!message.member.roles.cache.has(afkRole.id)) {
        try { await message.member.roles.add(afkRole, 'User went AFK'); } catch (e) { console.error('Could not add AFK role:', e.message); }
      }
    }

    // Skip nickname for server owner — Discord doesn't allow it
    if (message.member && !isOwner) {
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

      const returnDesc = `Welcome back <@${message.author.id}>!\nI have removed your AFK status.\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${afkData.reason}\`\n┗ ⏱️ **Away For:** \`${away}\``;

      const embed = new EmbedBuilder()
        .setColor(0xFF1493)
        .setAuthor({
          name: `${username} is back!`,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .setTitle('💝 Welcome Back!')
        .setDescription(returnDesc)
        .setThumbnail(afkData.avatar_url || message.author.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: "💫 So glad you're back!" })
        .setTimestamp();

      await message.reply({ embeds: [embed] }).catch(console.error);

      // Remove AFK role + nickname
      const isReturnOwner = message.guild.ownerId === message.author.id;
      const afkRoleRemove = message.guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
      if (afkRoleRemove && message.member?.roles.cache.has(afkRoleRemove.id)) {
        try { await message.member.roles.remove(afkRoleRemove, 'User returned from AFK'); } catch (e) { console.error('Could not remove AFK role:', e.message); }
      }

      // Skip nickname for server owner — Discord doesn't allow it
      if (message.member && !isReturnOwner) {
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

          const mentionDesc = `${pick(AFK_MENTION_MESSAGES)}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${mentionedAfk.reason}\`\n┗ ⏱️ **Away For:** \`${away}\``;

          const embed = new EmbedBuilder()
            .setColor(0xE91E63)
            .setAuthor({
              name: `${mentionedAfk.username} is currently AFK`,
              iconURL: mentionedAfk.avatar_url,
            })
            .setTitle("🌙 They're Away Right Now")
            .setDescription(mentionDesc)
            .setThumbnail(mentionedAfk.avatar_url)
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
