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
const { WerewolfGame, GAME_STATE, ROLE, ROLE_COLORS, activeGames, NIGHT_TIMER, DAY_TIMER } = require('./werewolf');
const { pick, timeSince } = require('./utils');

/* ═══════════════════════════════════════════
   🐺 Werewolf Night/Day Phase Functions
   ═══════════════════════════════════════════ */

async function startNightPhase(game) {
  game.startNight();
  const channel = game.channel;
  if (!channel) return;

  const aliveList = game.getAlivePlayersCompact();

  const nightEmbed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle(`🌙 Night ${game.round} — The Village Sleeps...`)
    .setDescription(
      `The village falls silent as darkness descends...\nThe wolves are hunting, the doctor is on duty, the seer is divining.\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🐺 **Wolves:** Choose your victim\n┣ 💊 **Doctor:** Choose who to save\n┣ 🔮 **Seer:** Choose who to investigate\n┗ ⏰ **Timer:** ${NIGHT_TIMER} seconds\n\n🤫 Check your DMs for action instructions!`
    )
    .addFields({ name: `👥 Alive Players (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false })
    .setFooter({ text: '🤫 Night actions are secret — do not share!' })
    .setTimestamp();
  await channel.send({ embeds: [nightEmbed] });

  // DM wolves, doctor, seer their night action reminders
  for (const [, player] of game.players) {
    if (!player.alive) continue;
    try {
      if (player.role === ROLE.WOLF) {
        const otherWolves = game.getAliveWolves().filter(w => w.user.id !== player.user.id);
        const wolfMates = otherWolves.length > 0
          ? `\n\n🐺 Your wolf teammates:\n${otherWolves.map(w => `┣ **${w.number}.** ${w.user.username}`).join('\n')}${otherWolves.length > 0 ? '\n┗' : ''}`
          : '\n\n🐺 You are the only wolf — choose wisely!';
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(`🌙 Night ${game.round} — Wolf Action`)
            .setDescription(
              `Choose your victim!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🩸 Use: \`w.kill <number>\`\n┗ 🎯 Pick from alive players${wolfMates}\n\nAlive players:\n${aliveList}`
            )
            .setFooter({ text: '🤫 Keep your identity secret!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.DOCTOR) {
        const saveHint = game.lastProtected
          ? `\n\n⚠️ You saved <@${game.lastProtected}> last night — pick someone else!`
          : '\n\n💡 This is your first night — save anyone!';
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🌙 Night ${game.round} — Doctor Action`)
            .setDescription(
              `Choose someone to protect!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💉 Use: \`w.save <number>\`\n┗ 🛡️ You can save anyone alive${saveHint}\n\nAlive players:\n${aliveList}`
            )
            .setFooter({ text: '💊 One life saved is one battle won!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.SEER) {
        const checkList = game.getAlivePlayers().filter(p => p.user.id !== player.user.id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`🌙 Night ${game.round} — Seer Action`)
            .setDescription(
              `Choose someone to investigate!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🔍 Use: \`w.check <number>\`\n┗ 👁️ You will learn if they are a wolf\n\nOther alive players:\n${checkList}`
            )
            .setFooter({ text: '🔮 Use your knowledge wisely!' })
            .setTimestamp()]
        });
      }
    } catch (err) {
      console.error(`Could not DM ${player.user.username}:`, err.message);
    }
  }

  // Night timer
  game.nightTimer = setTimeout(async () => {
    if (game.state !== GAME_STATE.NIGHT) return;
    // Night ended by timer — resolve
    const results = game.resolveNight();
    await startDayPhase(game, results);
  }, NIGHT_TIMER * 1000);
}

async function tryAutoResolveNight(game) {
  // Check if all night actions are done
  if (!game.allNightActionsDone()) return false;

  // All actions done — resolve immediately
  if (game.nightTimer) { clearTimeout(game.nightTimer); game.nightTimer = null; }
  const results = game.resolveNight();
  await startDayPhase(game, results);
  return true;
}

async function startDayPhase(game, nightResults) {
  game.startDay();
  const channel = game.channel;
  if (!channel) return;

  // Build day announcement based on night results
  let dayDesc = '';
  if (nightResults.killed) {
    dayDesc = `The village wakes to terrible news...\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💀 **${nightResults.killed.user.username}** was killed by the wolves!\n┗ 🪦 They were **${nightResults.killed.role}**`;
  } else if (nightResults.saved) {
    dayDesc = `The village wakes with relief...\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🏥 Someone was attacked last night\n┗ ✨ But the **Doctor saved them**!`;
  } else if (nightResults.wolfTarget) {
    dayDesc = `A mysterious night passes...\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🌙 The wolves chose a target\n┗ 🤔 But somehow... no one died`;
  } else {
    dayDesc = `A quiet night passes...\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🌙 No one was attacked\n┗ 😴 The village slept peacefully`;
  }

  // Check win after night kill
  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Wolves Win!' : '🏘️ Villagers Win!')
      .setDescription(`${dayDesc}\n\n${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setFooter({ text: '🐺 Game Over — Thanks for playing!' })
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  const aliveList = game.getPlayerListString();
  const dayEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`☀️ Day ${game.round} — Discuss & Vote!`)
    .setDescription(
      `${dayDesc}\n\nDiscuss who you think is a wolf!\nThen vote to eliminate a suspect.\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🗳️ Use: \`w.shoot <number>\`\n┣ ⏰ Timer: ${DAY_TIMER} seconds\n┗ 💡 Majority vote = elimination!`
    )
    .addFields({ name: `👥 Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false })
    .setFooter({ text: `☀️ Day ${game.round} — Find the wolves!` })
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
    .setDescription(
      `${tally.message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ ☀️ The village has spoken\n┗ 🐺 The hunt continues...`
    )
    .setTimestamp();
  await channel.send({ embeds: [tallyEmbed] });

  // Check win
  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Wolves Win!' : '🏘️ Villagers Win!')
      .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setFooter({ text: '🐺 Game Over — Thanks for playing!' })
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  // Increment round for next night
  game.round++;

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
   ═══════════════════════════════════════════ */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();

// Cooldown tracking for AFK mention notifications
const mentionCooldowns = new Map();
const AFK_MENTION_COOLDOWN = 30_000;

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
      console.log(`🔄 Registering ${commands.length} guild slash command(s) [instant]...`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Guild slash commands registered! Commands should appear instantly.');
    } else {
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
   💬  Message Handler
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

        if (result) {
          await message.reply(result.message);
          // Try auto-resolving night if all actions done
          if (result.success) {
            await tryAutoResolveNight(foundGame);
          }
        }
      } else if (cmd === 'w.role') {
        // Check your role via DM
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
        const player = foundGame.getPlayer(message.author.id);
        if (!player) return message.reply('🚫 You are not in this game!');
        if (!player.role) return message.reply('⚠️ Game hasn\'t started yet — no role assigned!');

        const roleColor = ROLE_COLORS[player.role] || 0xFF69B4;
        const roleEmbed = new EmbedBuilder()
          .setColor(roleColor)
          .setTitle(`🎭 Your Role: ${player.role}`)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n┣ 👤 **Player:** ${player.user.username}\n┣ 🎭 **Role:** ${player.role}\n┣ ${player.alive ? '✅ **Status:** Alive' : '💀 **Status:** Dead'}\n┣ 🌙 **Round:** ${foundGame.round}\n┗ ${foundGame.state === GAME_STATE.NIGHT ? '🌙 **Phase:** Night' : '☀️ **Phase:** Day'}`
          )
          .setFooter({ text: '🤫 Keep your role secret!' })
          .setTimestamp();
        return message.reply({ embeds: [roleEmbed] });
      } else if (cmd === 'w.help') {
        return message.reply(
          '🐺 **Werewolf DM Commands:**\n' +
          '`w.kill <#>` — Wolf: choose victim\n' +
          '`w.save <#>` — Doctor: protect someone\n' +
          '`w.check <#>` — Seer: investigate someone\n' +
          '`w.role` — Check your role & status'
        );
      }
    }
    return;
  }

  const msgContent = message.content.toLowerCase().trim();

  /* ── Werewolf Game Commands ── */
  if (msgContent.startsWith('w.')) {
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    /* ── w.help ── */
    if (cmd === 'w.help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Werewolf — Wolfia Style')
        .setDescription(
          'A game of deception with full Night/Day cycle!\n' +
          '🌙 **Night:** Wolves kill, Doctor saves, Seer investigates\n' +
          '☀️ **Day:** Discuss and vote to eliminate suspects'
        )
        .addFields(
          { name: '🎮 Commands', value: '`w.join` — Join the game\n`w.start` — Start (HOST only)\n`w.shoot <#>` — Vote (day)\n`w.kill <#>` — Wolf kill (DM)\n`w.save <#>` — Doctor save (DM)\n`w.check <#>` — Seer check (DM)\n`w.role` — Check your role (DM)\n`w.players` — See alive players\n`w.end` — End game (HOST only)', inline: false },
          { name: '🏘️ Villager', value: 'Vote during the day\nto eliminate wolves!', inline: true },
          { name: '🐺 Wolf', value: 'Kill at night!\nDM: `w.kill <#>`', inline: true },
          { name: '💊 Doctor', value: 'Save at night!\nDM: `w.save <#>`', inline: true },
          { name: '🔮 Seer', value: 'Check at night!\nDM: `w.check <#>`', inline: true },
          { name: '🏆 Win Conditions', value: '🏘️ **Villagers win** = all wolves dead\n🐺 **Wolves win** = wolves >= villagers', inline: false },
          { name: '⏰ Timers', value: `Night: ${NIGHT_TIMER}s • Day: ${DAY_TIMER}s\nAuto-resolves when all actions done!`, inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Werewolf' })
        .setTimestamp();
      return message.reply({ embeds: [helpEmbed] });
    }

    /* ── w.join ── */
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
        .setColor(result.success ? 0x2ECC71 : 0xE74C3C)
        .setTitle('🐺 Werewolf Game')
        .setDescription(
          result.success
            ? `${result.message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🎮 Use \`w.join\` to join\n┣ 👑 Host starts with \`w.start\`\n┗ 📋 Min 4 players to start${isHost ? '\n\n👑 **You are the HOST!** Use `w.start` when ready.' : ''}`
            : result.message
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.start ── */
    if (cmd === 'w.start') {
      let game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🐺 No Game').setDescription('No game in this channel! Use `w.join` first.').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🚫 Not the Host').setDescription('Only the **host** can start the game!\nAsk the person who created the game to run `w.start`.').setTimestamp()] });
      }
      if (game.started) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Game already started!').setTimestamp()] });
      }
      const result = game.start();
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🐺 Cannot Start').setDescription(result.message).setTimestamp()] });
      }

      const playerList = game.getAlivePlayersCompact();
      const startEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Werewolf Game Started!')
        .setDescription(
          `**${game.players.size} players** — **${result.wolfCount}** wolf/wolves among you!\n\n${playerList}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🌙 **Night 1 begins now...**\n┣ 🤫 Check your DMs for your role!\n┗ ⏰ Night actions: ${NIGHT_TIMER}s`
        )
        .setFooter({ text: '🐺 Deception begins!' })
        .setTimestamp();
      await message.reply({ embeds: [startEmbed] });

      // DM each player their role + instructions
      for (const [id, player] of game.players) {
        try {
          let roleMsg = '';
          if (player.role === ROLE.WOLF) {
            const otherWolves = game.getAliveWolves().filter(w => w.user.id !== id);
            const wolfNames = otherWolves.length > 0
              ? otherWolves.map(w => `┣ 🐺 **${w.user.username}** (#${w.number})`).join('\n') + '\n┗'
              : '┗ 🐺 You are the only wolf!';
            roleMsg = `You are a **WOLF**! 🐺\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🩸 Choose a villager to kill each night\n┣ 📨 DM me: \`w.kill <number>\`\n┣ 🤫 Don't reveal yourself!\n${wolfNames}`;
          } else if (player.role === ROLE.DOCTOR) {
            const aliveList = game.getAlivePlayersCompact();
            roleMsg = `You are the **DOCTOR**! 💊\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🛡️ Choose one person to save each night\n┣ 📨 DM me: \`w.save <number>\`\n┣ ⚠️ Can't save same person two nights in a row!\n┗ 💉 Keep the village alive!\n\nAlive players:\n${aliveList}`;
          } else if (player.role === ROLE.SEER) {
            const checkList = game.getAlivePlayers().filter(p => p.user.id !== id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            roleMsg = `You are the **SEER**! 🔮\n\n━━━━━━━━━━━━━━━━━━━\n┣ 👁️ Choose one person to investigate each night\n┣ 📨 DM me: \`w.check <number>\`\n┣ 🔍 You will learn if they are a wolf!\n┗ 🧠 Use your knowledge wisely!\n\nOther alive players:\n${checkList}`;
          } else {
            roleMsg = `You are a **VILLAGER**! 🏘️\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💪 Survive and find the wolves!\n┣ 🗳️ During the day: \`w.shoot <number>\`\n┗ 😴 Sleep peacefully at night...`;
          }
          const dmEmbed = new EmbedBuilder()
            .setColor(ROLE_COLORS[player.role] || 0xFF69B4)
            .setTitle('🎭 Your Secret Role')
            .setDescription(roleMsg)
            .setFooter({ text: "🤫 Don't share your role with others!" })
            .setTimestamp();
          await player.user.send({ embeds: [dmEmbed] });
        } catch (err) {
          console.error(`Could not DM ${player.user.username}:`, err.message);
          await message.channel.send(`⚠️ Could not DM <@${id}> — tell them to enable DMs from server members!`);
        }
      }

      // Start Night 1
      await startNightPhase(game);
      return;
    }

    /* ── w.shoot ── */
    if (cmd === 'w.shoot') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active game! Use `w.join` then `w.start`').setTimestamp()] });
      }
      if (game.state !== GAME_STATE.DAY) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🌙 You can only vote during the day!').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🗳️ Use `w.shoot <number>` — Example: `w.shoot 3`').setTimestamp()] });
      }
      const target = game.getPlayerByNumber(targetNum);
      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 Player #${targetNum} not found or already dead!`).setTimestamp()] });
      }
      const result = game.vote(message.author.id, target.user.id);
      if (result.success) {
        const voteCount = game.votes.size;
        const aliveCount = game.getAlivePlayers().length;
        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🗳️ Vote Cast!')
          .setDescription(
            `${result.message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📊 **${voteCount}/${aliveCount}** votes cast\n┗ ${voteCount >= aliveCount ? '✅ All votes in — tallying!' : '⏳ Waiting for more votes...'}`
          )
          .setTimestamp();
        await message.reply({ embeds: [embed] });

        // If all alive players voted, tally immediately
        if (voteCount >= aliveCount) {
          await resolveDayVote(game);
        }
      } else {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }
      return;
    }

    /* ── w.players ── */
    if (cmd === 'w.players') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel! Use `w.join` first.').setTimestamp()] });
      }
      const aliveList = game.getPlayerListString();
      const deadList = game.getDeadListString();
      const phaseIcon = game.state === GAME_STATE.NIGHT ? '🌙' : game.state === GAME_STATE.DAY ? '☀️' : '⏳';

      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle(`🐺 Players — ${phaseIcon} ${game.state === GAME_STATE.NIGHT ? `Night ${game.round}` : game.state === GAME_STATE.DAY ? `Day ${game.round}` : 'Waiting'}`)
        .addFields({ name: `✅ Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false });
      if (deadList) embed.addFields({ name: '💀 Eliminated', value: deadList, inline: false });
      embed.setFooter({ text: `👑 Host: <@${game.hostId}>` }).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.end ── */
    if (cmd === 'w.end') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game to end!').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🚫 Not the Host').setDescription('Only the **host** can end the game!').setTimestamp()] });
      }
      game.end();
      const playerList = game.getFullPlayerListString();
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Game Ended!')
        .setDescription(
          `The game was ended by the host.\n\n${playerList}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🏁 Use \`w.join\` to start a new game\n┗ 💕 Thanks for playing!`
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  }

  /* ── Handle night actions typed in channel (redirect to DM secretly) ── */
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
        try { await message.delete(); } catch (e) { /* can't delete */ }
      } catch (e) {
        // Can't DM — reply in channel but auto-delete after 5s
        await message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] }).then(m => {
          setTimeout(() => m.delete().catch(() => {}), 5000);
        });
      }

      // Try auto-resolving night if all actions done
      if (result.success) {
        await tryAutoResolveNight(game);
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
