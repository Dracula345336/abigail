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
  PermissionFlagsBits,
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
  process.exit(1);
}

/* ═══════════════════════════════════════════
   🗄️  Supabase Client
   ═══════════════════════════════════════════ */

let supabase = null;
if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY)) {
  try {
    supabase = require('./db');
    if (supabase) console.log('✅ Supabase ready — AFK features enabled!');
  } catch (err) {
    console.error('❌ Failed to initialize Supabase:', err.message);
  }
} else {
  console.warn('⚠️  SUPABASE_URL or database key not set — AFK features disabled.');
}

const { AFK_SET_MESSAGES, AFK_BREAK_MESSAGES, AFK_RETURN_MESSAGES, AFK_MENTION_MESSAGES } = require('./messages');
const {
  WerewolfGame, GAME_MODE, GAME_STATE, ROLE, ROLE_EMOJI, ROLE_COLORS,
  activeGames, NIGHT_TIMER, DAY_TIMER, SHOOT_TIMER
} = require('./werewolf');
const { pick, timeSince } = require('./utils');
const { HandCricketGame, GAME_PHASE: HC_PHASE, ProfileManager, EMOJI_NUMBERS, SLEDGE_MESSAGES, BOT_NAMES } = require('./handcricket');
const activeHCGames = new Map(); // channelId → HandCricketGame
const hcPlayerMap = new Map();  // userId → channelId (for DM routing)
const hcProfileManager = new ProfileManager(supabase);

/* ═══════════════════════════════════════════
   🐺 Werewolf — Mafia Night/Day Phase Functions
   ═══════════════════════════════════════════ */

/* ── Popcorn Shoot Timer ── */

async function startPopcornShootTimer(game) {
  if (game.mode !== GAME_MODE.POPCORN || game.state === GAME_STATE.ENDED) return;
  if (game.shootTimer) { clearTimeout(game.shootTimer); game.shootTimer = null; }

  const channel = game.channel;
  if (!channel) return;

  const gunHolder = game.players.get(game.gunHolder);
  if (!gunHolder) return;

  // Warning at 10 seconds before expiry
  const warningTime = Math.max(0, (game.shootTimerLength - 10) * 1000);
  let warningSent = false;

  if (warningTime > 0) {
    game._shootWarningTimer = setTimeout(async () => {
      if (game.state === GAME_STATE.ENDED || game.gunHolder !== gunHolder.user.id) return;
      warningSent = true;
      try {
        await channel.send({ embeds: [new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle('⏰ Shoot Timer Warning!')
          .setDescription(`**${gunHolder.user.username}** has **10 seconds** left to shoot!\nUse \`w.shoot <number>\` now or you'll be eliminated!`)
          .setTimestamp()] });
      } catch (e) {}
    }, warningTime);
  }

  // Main timer — gun holder is eliminated if they don't shoot in time
  game.shootTimer = setTimeout(async () => {
    if (game._shootWarningTimer) { clearTimeout(game._shootWarningTimer); game._shootWarningTimer = null; }
    if (game.state === GAME_STATE.ENDED) return;
    if (game.gunHolder !== gunHolder.user.id) return;  // gun already passed

    // Gun holder didn't shoot — they are eliminated!
    gunHolder.alive = false;

    const timeoutEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('⏰ Time\'s Up!')
      .setDescription(
        `**${gunHolder.user.username}** ran out of time and is eliminated!\n` +
        `💀 **${gunHolder.user.username}** (${ROLE_EMOJI[gunHolder.role]} ${gunHolder.role}) couldn't pull the trigger!`
      )
      .setTimestamp();
    await channel.send({ embeds: [timeoutEmbed] });

    // Check win after timeout elimination
    const winCheck = game.checkWin();
    if (winCheck) {
      const winEmbed = new EmbedBuilder()
        .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
        .setTitle(winCheck.winner === 'wolves' ? 'Wolves Win!' : 'Village Wins!')
        .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
        .setFooter({ text: 'Game Over — Thanks for playing!' })
        .setTimestamp();
      await channel.send({ embeds: [winEmbed] });
      activeGames.delete(channel.id);
      return;
    }

    // Pass gun to a random alive player
    const alivePlayers = game.getAlivePlayers();
    if (alivePlayers.length > 0) {
      const nextHolder = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      game.gunHolder = nextHolder.user.id;

      const passEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🔫 Gun Passed!')
        .setDescription(
          `The gun passes to **${nextHolder.user.username}**!\n\n` +
          `Use \`w.shoot <number>\` to shoot!\n⏱️ **${game.shootTimerLength}s** on the clock!`
        )
        .setTimestamp();
      await channel.send({ embeds: [passEmbed] });

      // Start new timer for the next gun holder
      await startPopcornShootTimer(game);
    }
  }, game.shootTimerLength * 1000);
}

async function startMafiaNight(game) {
  game.startNight();
  const channel = game.channel;
  if (!channel) return;

  const alivePlayers = game.getAlivePlayers();
  const playerList = alivePlayers.map(p => `**${p.number}.** ${p.user.username}`).join('\n');

  const nightEmbed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle(`Night ${game.round}`)
    .setDescription(
      `**Game**          Mafia\n**Day**           ${game.round}\n**Living**        ${alivePlayers.length} players\n\nThe mafia is choosing their victim...\nCheck your DMs for night actions!`
    )
    .addFields({ name: `Living Players (${alivePlayers.length})`, value: playerList || 'None', inline: false })
    .setFooter({ text: `w.help • Night actions in DM • ${NIGHT_TIMER}s` })
    .setTimestamp();
  await channel.send({ embeds: [nightEmbed] });

  // DM role-specific actions
  for (const [, player] of game.players) {
    if (!player.alive) continue;
    try {
      if (player.role === ROLE.WOLF) {
        const otherWolves = game.getAliveWolves().filter(w => w.user.id !== player.user.id);
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle(`Night ${game.round} — Mafia Kill`)
            .setDescription(
              `Choose your victim!\n\nUse \`w.nk <number>\`\n\n${otherWolves.length > 0 ? `Mafia teammates: ${otherWolves.map(w => `**${w.number}.** ${w.user.username}`).join('  ·  ')}` : 'You are the only mafia!'}\n\nAlive players:\n${playerList}`
            )
            .setFooter({ text: 'Keep your identity secret!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.DOCTOR) {
        const saveHint = game.lastProtected ? `Cannot save <@${game.lastProtected}> again — pick someone else!` : 'First night — save anyone!';
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`Night ${game.round} — Doctor Save`)
            .setDescription(`Choose someone to protect!\n\nUse \`w.save <number>\`\n\n${saveHint}\n\nAlive players:\n${playerList}`)
            .setFooter({ text: 'One life saved is one battle won!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.SEER) {
        const checkList = game.getAlivePlayers().filter(p => p.user.id !== player.user.id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`Night ${game.round} — Cop Investigate`)
            .setDescription(`Choose someone to investigate!\n\nUse \`w.check <number>\`\n\nOther alive players:\n${checkList}`)
            .setFooter({ text: 'Use your knowledge wisely!' })
            .setTimestamp()]
        });
      }
    } catch (err) {
      console.error(`Could not DM ${player.user.username}:`, err.message);
    }
  }

  game.nightTimer = setTimeout(async () => {
    if (game.state !== GAME_STATE.NIGHT) return;
    const results = game.resolveNight();
    await startMafiaDay(game, results);
  }, NIGHT_TIMER * 1000);
}

async function tryAutoResolveMafiaNight(game) {
  if (!game.allNightActionsDone()) return false;
  if (game.nightTimer) { clearTimeout(game.nightTimer); game.nightTimer = null; }
  const results = game.resolveNight();
  await startMafiaDay(game, results);
  return true;
}

async function startMafiaDay(game, nightResults) {
  game.startDay();
  const channel = game.channel;
  if (!channel) return;

  let dayDesc = '';
  if (nightResults.killed) {
    dayDesc = `**${nightResults.killed.user.username}** was killed by the mafia last night!\nThey were **${nightResults.killed.role}**.`;
  } else if (nightResults.saved) {
    dayDesc = 'Someone was attacked but the **doctor saved them**! No one died.';
  } else {
    dayDesc = 'A quiet night... no one was attacked.';
  }

  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? 'Mafia Wins!' : 'Town Wins!')
      .setDescription(`${dayDesc}\n\n${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  const alivePlayers = game.getAlivePlayers();
  const playerList = alivePlayers.map(p => `**${p.number}.** ${p.user.username}`).join('\n');

  const dayEmbed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle(`Day ${game.round} — Vote!`)
    .setDescription(
      `**Game**          Mafia\n**Day**           ${game.round}\n**Living**        ${alivePlayers.length} players\n\n${dayDesc}\n\nUse \`w.vote <number>\` to vote\n\`w.unvote\` to remove • \`w.votecount\` to see`
    )
    .addFields({ name: `Living Players (${alivePlayers.length})`, value: playerList || 'None', inline: false })
    .setFooter({ text: `${DAY_TIMER}s to vote!` })
    .setTimestamp();
  await channel.send({ embeds: [dayEmbed] });

  game.dayTimer = setTimeout(async () => {
    if (game.state !== GAME_STATE.DAY) return;
    await resolveMafiaVote(game);
  }, DAY_TIMER * 1000);
}

async function resolveMafiaVote(game) {
  if (game.state !== GAME_STATE.DAY) return;
  const channel = game.channel;
  if (!channel) return;

  if (game.dayTimer) { clearTimeout(game.dayTimer); game.dayTimer = null; }

  const tally = game.tallyVotes();
  const tallyEmbed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('Vote Results!')
    .setDescription(`${tally.message}${tally.detail ? '\n\n' + tally.detail : ''}`)
    .setTimestamp();
  await channel.send({ embeds: [tallyEmbed] });

  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? 'Mafia Wins!' : 'Town Wins!')
      .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
      .setTimestamp();
    await channel.send({ embeds: [winEmbed] });
    activeGames.delete(channel.id);
    return;
  }

  game.round++;
  await startMafiaNight(game);
}

/* ── AFK Helpers ── */

function getAfkNickname(currentNickname, username) {
  const base = currentNickname || username;
  const clean = base.replace(/^\[AFK\]\s*/, '');
  return `[AFK] ${clean}`;
}
function getNormalNickname(currentNickname, username) {
  const base = currentNickname || username;
  return base.replace(/^\[AFK\]\s*/, '') || username;
}

const AFK_ROLE_NAME = 'AFK';
async function getAfkRole(guild) {
  let role = guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: AFK_ROLE_NAME, color: 0x808080, hoist: true, mentionable: false,
        reason: 'Auto-created AFK role for Sweetheart Bot',
      });
      console.log(`✅ Created AFK role in ${guild.name}`);
    } catch (err) { console.error('Could not create AFK role:', err.message); return null; }
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
    console.error('⚠️  CLIENT_ID not set — slash commands will NOT be registered!');
    return;
  }

  const commands = [];
  for (const [, cmd] of client.commands) commands.push(cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    if (process.env.GUILD_ID) {
      console.log(`🔄 Registering ${commands.length} guild slash command(s)...`);
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log('✅ Guild slash commands registered!');
    } else {
      console.log(`🔄 Registering ${commands.length} global slash command(s)...`);
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ Global slash commands registered!');
    }
  } catch (error) {
    console.error('❌ Slash command registration failed:', error.message);
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

const AFK_PREFIXES = ['!afk', '?afk', '.afk'];

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  /* ── DM Handler ── */
  if (!message.guild) {
    const msgContent = message.content.toLowerCase().trim();

    /* ── Hand Cricket DM Commands ── */
    const hcChannelId = hcPlayerMap.get(message.author.id);
    if (hcChannelId) {
      const hcGame = activeHCGames.get(hcChannelId);
      if (hcGame && hcGame.phase !== HC_PHASE.ENDED) {
        const num = parseInt(msgContent);

        // Coin toss for single player (heads/tails)
        if (hcGame.isBotGame && hcGame.phase === HC_PHASE.TOSS && (msgContent === 'heads' || msgContent === 'tails')) {
          const result = hcGame.coinTossChoice(message.author.id, msgContent);
          if (!result.success) return message.reply(result.message);

          const channel = hcGame.channel;
          if (!channel) return;

          const tossEmbed = new EmbedBuilder()
            .setColor(result.playerWon ? 0x2ECC71 : 0xE74C3C)
            .setTitle('🪙 Coin Toss Result!')
            .setDescription(
              `━━━━━━━━━━━━━━━━━━━\n` +
              `┣ 🪙 **Coin:** ${result.coinResult === 'heads' ? '👑 Heads' : '🦅 Tails'}\n` +
              `┣ 🎯 **You chose:** ${result.playerChoice === 'heads' ? '👑 Heads' : '🦅 Tails'}\n` +
              `┗ ${result.playerWon ? '🏆 **You won the toss!**' : '😢 **You lost the toss!**'}\n\n${result.playerWon ? 'DM me **bat** or **bowl** to choose!' : 'Bot is choosing...'}`
            )
            .setTimestamp();
          await channel.send({ embeds: [tossEmbed] });

          // If bot won toss, bot chooses automatically
          if (!result.playerWon) {
            const botChoice = hcGame.botChooseBatBowl();
            const botChose = botChoice.battingFirst === hcGame.player2Id ? 'bat' : 'bowl';
            const playerRole = botChose === 'bat' ? 'bowl' : 'bat';

            const botChoiceEmbed = new EmbedBuilder()
              .setColor(0xF39C12)
              .setTitle('🤖 Bot chose to ' + botChose + '!')
              .setDescription(
                `━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🤖 Bot: **${botChose === 'bat' ? 'Batting 🏏' : 'Bowling 🎯'}**\n` +
                `┣ 🏏 **You:** ${playerRole === 'bat' ? 'Batting 🏏' : 'Bowling 🎯'}\n` +
                `┗ 📨 DM me a number (1-6) to start!`
              )
              .setFooter({ text: '🏏 Match Started!' })
              .setTimestamp();
            await channel.send({ embeds: [botChoiceEmbed] });

            // DM the player
            try {
              await message.author.send({
                embeds: [new EmbedBuilder()
                  .setColor(0x2ECC71)
                  .setTitle('🏏 Match Started!')
                  .setDescription(`You are **${playerRole === 'bat' ? 'Batting 🏏' : 'Bowling 🎯'}**!\n\nType a number **1-6** to play!`)
                  .setTimestamp()]
              });
            } catch (e) {}
          }
          return;
        }

        // Toss number submission (1-6)
        if (hcGame.phase === HC_PHASE.TOSS && !isNaN(num) && num >= 1 && num <= 6) {
          const result = hcGame.submitTossNumber(message.author.id, num);
          if (!result.success) return message.reply(result.message);

          if (result.message === 'waiting_for_opponent') {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🏏 Toss Number Recorded!').setDescription(`You chose **${num}**!\n\nWaiting for your opponent to choose...`).setTimestamp()] });
          }

          if (result.message === 'toss_resolved') {
            const channel = hcGame.channel;
            if (!channel) return;

            // Announce toss result in channel
            const tossEmbed = new EmbedBuilder()
              .setColor(0xFFD700)
              .setTitle('🪙 Toss Result!')
              .setDescription(
                `━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🎲 **${client.users.cache.get(hcGame.players[0])?.username || 'Player 1'}** chose: ${EMOJI_NUMBERS[result.p1Num - 1]}\n` +
                `┣ 🎲 **${client.users.cache.get(hcGame.players[1])?.username || 'Player 2'}** chose: ${EMOJI_NUMBERS[result.p2Num - 1]}\n` +
                `┣ ➕ **Sum:** ${result.sum} (${result.result})\n` +
                `┗ 🏆 **Toss Winner:** <@${result.winner}>!`
              )
              .setFooter({ text: '🏏 Toss winner: choose bat or bowl in channel!' })
              .setTimestamp();
            await channel.send({ embeds: [tossEmbed] });

            // DM toss winner
            try {
              await client.users.cache.get(result.winner)?.send({
                embeds: [new EmbedBuilder()
                  .setColor(0xFFD700)
                  .setTitle('🏆 You Won the Toss!')
                  .setDescription(`Type **bat** or **bowl** in the channel to choose!`)
                  .setTimestamp()]
              });
            } catch (e) {}
            return;
          }
        }

        // Play number submission during game (1-6)
        if (hcGame.phase === HC_PHASE.PLAYING && !isNaN(num) && num >= 1 && num <= 6) {
          const result = hcGame.submitPlayNumber(message.author.id, num);
          if (!result.success) return message.reply(result.message);

          if (result.message === 'waiting_for_opponent') {
            return message.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🏏 Number Recorded!').setDescription(`You chose **${num}**!\n\nWaiting for your opponent...`).setTimestamp()] });
          }

          // Ball resolved!
          const channel = hcGame.channel;
          if (!channel) return;

          const batsmanName = client.users.cache.get(result.batsman)?.username || 'Batsman';
          const bowlerName = client.users.cache.get(result.bowler)?.username || 'Bowler';

          if (result.message === 'out') {
            const outEmbed = new EmbedBuilder()
              .setColor(0xE74C3C)
              .setTitle('💀 OUT!')
              .setDescription(
                `**${batsmanName}** is OUT!\n\n━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🏏 Batsman: ${EMOJI_NUMBERS[result.batNum - 1]}\n` +
                `┣ 🎯 Bowler: ${EMOJI_NUMBERS[result.bowlNum - 1]}\n` +
                `┣ 💀 **Same number — OUT!**\n` +
                `┣ 📊 **Score:** ${result.totalRuns}/${result.wickets} (${result.balls} balls)\n` +
                `┗ 🎯 ${batsmanName} walks back...`
              )
              .setTimestamp();
            await channel.send({ embeds: [outEmbed] });
          } else {
            const runsEmbed = new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle(`🏏 ${result.runsThisBall} Run${result.runsThisBall > 1 ? 's' : ''}!`)
              .setDescription(
                `━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🏏 **${batsmanName}** (Batting): ${EMOJI_NUMBERS[result.batNum - 1]}\n` +
                `┣ 🎯 **${bowlerName}** (Bowling): ${EMOJI_NUMBERS[result.bowlNum - 1]}\n` +
                `┣ 💨 **+${result.runsThisBall} runs!**\n` +
                `┣ 📊 **Score:** ${result.totalRuns}/${result.wickets} (${result.balls} balls)\n` +
                `┗ ${result.runsThisBall >= 4 ? '🔥 Big shot!' : result.runsThisBall === 6 ? '🚀 SIXER!' : '✅ Good running!'}\n`
              )
              .setTimestamp();
            await channel.send({ embeds: [runsEmbed] });
          }

          // Handle innings end or game over
          if (result.gameOver) {
            const winnerName = result.winner ? client.users.cache.get(result.winner)?.username : null;
            const loserName = result.loser ? client.users.cache.get(result.loser)?.username : null;
            const p1Score = hcGame.scores[hcGame.players[0]];
            const p2Score = hcGame.scores[hcGame.players[1]];

            const winEmbed = new EmbedBuilder()
              .setColor(0xFFD700)
              .setTitle('🏆 Game Over!')
              .setDescription(
                `**${winnerName}** wins the match!\n\n━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🏏 **${client.users.cache.get(hcGame.players[0])?.username}**: ${p1Score.runs}/${p1Score.wickets} (${p1Score.balls} balls)\n` +
                `┣ 🏏 **${client.users.cache.get(hcGame.players[1])?.username}**: ${p2Score.runs}/${p2Score.wickets} (${p2Score.balls} balls)\n` +
                `┗ 🎉 **${winnerName}** won by ${Math.abs(p1Score.runs - p2Score.runs)} run${Math.abs(p1Score.runs - p2Score.runs) !== 1 ? 's' : ''}!`
              )
              .setFooter({ text: '🏏 Hand Cricket — GG!' })
              .setTimestamp();
            await channel.send({ embeds: [winEmbed] });

            // Update profiles
            if (hcProfileManager) {
              for (const pid of hcGame.players) {
                if (!pid.startsWith('BOT_')) {
                  const summary = hcGame.getGameSummary(pid);
                  await hcProfileManager.updateProfile(pid, summary);
                }
              }
            }

            activeHCGames.delete(hcChannelId);
            hcPlayerMap.delete(hcGame.players[0]);
            hcPlayerMap.delete(hcGame.players[1]);
            return;
          }

          if (result.inningsOver) {
            if (result.nextPhase === 'innings_break') {
              const p1Score = hcGame.scores[hcGame.players[0]];
              const p2Score = hcGame.scores[hcGame.players[1]];
              const firstBatName = client.users.cache.get(hcGame.battingFirst)?.username;
              const nextBatName = client.users.cache.get(result.nextBatsman)?.username;
              const nextBowlName = client.users.cache.get(result.nextBowler)?.username;

              const breakEmbed = new EmbedBuilder()
                .setColor(0xF39C12)
                .setTitle('⏸️ Innings Break!')
                .setDescription(
                  `**${firstBatName}** scored **${hcGame.scores[hcGame.battingFirst].runs}/${hcGame.scores[hcGame.battingFirst].wickets}**\n\n━━━━━━━━━━━━━━━━━━━\n` +
                  `┣ 🎯 **Target:** ${result.target} runs\n` +
                  `┣ 🏏 **${nextBatName}** is now batting!\n` +
                  `┣ 🎯 **${nextBowlName}** is now bowling!\n` +
                  `┗ 📨 Check your DMs — type a number (1-6)!`
                )
                .setFooter({ text: '🏏 2nd Innings starts now!' })
                .setTimestamp();
              await channel.send({ embeds: [breakEmbed] });

              hcGame.startSecondInnings();

              // DM both players
              for (const pid of hcGame.players) {
                try {
                  await client.users.cache.get(pid)?.send({
                    embeds: [new EmbedBuilder()
                      .setColor(0xF39C12)
                      .setTitle('🏏 2nd Innings!')
                      .setDescription(`Type a number **1-6** to play!\n\nYou are ${pid === result.nextBatsman ? '**Batting** 🏏' : '**Bowling** 🎯'}`)
                      .setTimestamp()]
                  });
                } catch (e) {}
              }
            } else if (result.nextPhase === 'game_over') {
              const p1Score = hcGame.scores[hcGame.players[0]];
              const p2Score = hcGame.scores[hcGame.players[1]];
              const winnerName = result.winner ? client.users.cache.get(result.winner)?.username : null;

              if (result.isTie) {
                const tieEmbed = new EmbedBuilder()
                  .setColor(0xF39C12)
                  .setTitle('🤝 Match Tied!')
                  .setDescription(
                    `Both players scored the same!\n\n━━━━━━━━━━━━━━━━━━━\n` +
                    `┣ 🏏 **${client.users.cache.get(hcGame.players[0])?.username}**: ${p1Score.runs}/${p1Score.wickets}\n` +
                    `┗ 🏏 **${client.users.cache.get(hcGame.players[1])?.username}**: ${p2Score.runs}/${p2Score.wickets}`
                  )
                  .setFooter({ text: '🏏 Hand Cricket — Tie!' })
                  .setTimestamp();
                await channel.send({ embeds: [tieEmbed] });
              } else {
                const winEmbed = new EmbedBuilder()
                  .setColor(0xFFD700)
                  .setTitle('🏆 Game Over!')
                  .setDescription(
                    `**${winnerName}** wins!\n\n━━━━━━━━━━━━━━━━━━━\n` +
                    `┣ 🏏 **${client.users.cache.get(hcGame.players[0])?.username}**: ${p1Score.runs}/${p1Score.wickets} (${p1Score.balls} balls)\n` +
                    `┣ 🏏 **${client.users.cache.get(hcGame.players[1])?.username}**: ${p2Score.runs}/${p2Score.wickets} (${p2Score.balls} balls)\n` +
                    `┗ 🎉 **${winnerName}** won by ${Math.abs(p1Score.runs - p2Score.runs)} run${Math.abs(p1Score.runs - p2Score.runs) !== 1 ? 's' : ''}!`
                  )
                  .setFooter({ text: '🏏 Hand Cricket — GG!' })
                  .setTimestamp();
                await channel.send({ embeds: [winEmbed] });
              }

              // Update profiles
              if (hcProfileManager) {
                for (const pid of hcGame.players) {
                  if (!pid.startsWith('BOT_')) {
                    const summary = hcGame.getGameSummary(pid);
                    await hcProfileManager.updateProfile(pid, summary);
                  }
                }
              }

              activeHCGames.delete(hcChannelId);
              hcPlayerMap.delete(hcGame.players[0]);
              hcPlayerMap.delete(hcGame.players[1]);
            }
          }
          return;
        }

        // bat/bowl choice from DM
        if (hcGame.phase === HC_PHASE.TOSS_CHOICE && (msgContent === 'bat' || msgContent === 'bowl')) {
          const result = hcGame.chooseBatBowl(message.author.id, msgContent);
          if (!result.success) return message.reply(result.message);

          const channel = hcGame.channel;
          if (channel) {
            const batName = client.users.cache.get(result.battingFirst)?.username;
            const bowlName = client.users.cache.get(result.bowlingFirst)?.username;

            const startEmbed = new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle('🏏 Match Started!')
              .setDescription(
                `━━━━━━━━━━━━━━━━━━━\n` +
                `┣ 🏏 **Batting:** ${batName}\n` +
                `┣ 🎯 **Bowling:** ${bowlName}\n` +
                `┣ 📏 **Format:** ${hcGame.maxBalls} balls, ${hcGame.maxWickets} wickets\n` +
                `┗ 📨 Check your DMs — type a number (1-6)!`
              )
              .setFooter({ text: '🏏 Hand Cricket — 1st Innings!' })
              .setTimestamp();
            await channel.send({ embeds: [startEmbed] });

            // DM both players
            for (const pid of hcGame.players) {
              try {
                await client.users.cache.get(pid)?.send({
                  embeds: [new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle('🏏 Match Started!')
                    .setDescription(`Type a number **1-6** to play!\n\nYou are ${pid === result.battingFirst ? '**Batting** 🏏' : '**Bowling** 🎯'}`)
                    .setTimestamp()]
                });
              } catch (e) {}
            }
          }
          return;
        }
      }
    }

    /* ── Mafia Night Actions (DM) ── */
    if (msgContent.startsWith('w.')) {
      const args = message.content.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === 'w.nightkill' || cmd === 'w.nk' || cmd === 'w.save' || cmd === 'w.check') {
        let foundGame = null;
        for (const [, g] of activeGames) {
          if (g.players.has(message.author.id) && g.state !== GAME_STATE.ENDED && g.mode === GAME_MODE.MAFIA) {
            foundGame = g;
            break;
          }
        }
        if (!foundGame) return message.reply('🚫 You are not in any active Mafia game!');
        if (foundGame.state !== GAME_STATE.NIGHT) return message.reply('🌙 Night actions only during the night!');
        const targetNum = parseInt(args[1]);
        if (isNaN(targetNum)) return message.reply(`❌ Use \`${cmd} <number>\` — Example: \`${cmd} 3\``);

        let result;
        if (cmd === 'w.nightkill' || cmd === 'w.nk') result = foundGame.wolfKill(message.author.id, targetNum);
        else if (cmd === 'w.save') result = foundGame.doctorSave(message.author.id, targetNum);
        else if (cmd === 'w.check') result = foundGame.seerCheck(message.author.id, targetNum);

        if (result) {
          await message.reply(result.message);
          if (result.success) await tryAutoResolveMafiaNight(foundGame);
        }
      } else if (cmd === 'w.help') {
        return message.reply(
          'Werewolf — DM Commands:\n' +
          '`w.nk <#>` — Mafia: choose victim\n' +
          '`w.save <#>` — Doctor: protect someone\n' +
          '`w.check <#>` — Cop: investigate someone'
        );
      }
    }
    return;
  }

  const msgContent = message.content.toLowerCase().trim();

  /* ═══════════════════════════════════════════
     🐺 Werewolf Game Commands — Wolfia Style
     ═══════════════════════════════════════════ */

  if (msgContent.startsWith('w.')) {
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    /* ── w.help ── */
    if (cmd === 'w.help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('Werewolf — Help')
        .setDescription('Social deduction game with two modes!')
        .addFields(
          { name: 'Starting', value: '`w.in` — Sign up\n`w.out` — Drop\n`w.setup` — Configure\n`w.start` — Start (host)\n`w.status` — Game status', inline: false },
          { name: 'Popcorn Mode', value: '`w.shoot <number>` — Shoot someone\nShoot opposite team = target dies\nShoot same team = YOU die, gun passes', inline: false },
          { name: 'Mafia Mode', value: '`w.vote <number>` — Vote to lynch\n`w.unvote` — Remove vote\n`w.votecount` — See votes\n`w.nk <number>` — Mafia kill (DM)\n`w.save <number>` — Doctor save (DM)\n`w.check <number>` — Cop check (DM)', inline: false },
          { name: 'Setup', value: '`w.setup mode popcorn` — Popcorn\n`w.setup mode mafia` — Mafia\n`w.setup daylength <1-30>` — Day timer\n`w.setup shoottimer <10-120>` — Shoot timer (Popcorn)', inline: false },
          { name: 'Win Conditions', value: 'Village wins = all wolves dead\nWolves win = wolves >= villagers', inline: false },
        )
        .setFooter({ text: 'Sweetheart Bot — Werewolf' })
        .setTimestamp();
      return message.reply({ embeds: [helpEmbed] });
    }

    /* ── w.in ── */
    if (cmd === 'w.in') {
      let game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        game = new WerewolfGame(message.guild.id, message.channel.id, message.author.id);
        game.channel = message.channel;
        activeGames.set(message.channel.id, game);
      }
      const result = game.join(message.author);
      const isHost = game.hostId === message.author.id;

      // Wolfia-style setup embed with checkboxes
      const modeCheck = game.mode === GAME_MODE.POPCORN;
      const setupStr = [
        `**Game**          ${modeCheck ? '[x]' : '[ ]'} Popcorn   ${!modeCheck ? '[x]' : '[ ]'} Mafia`,
        `**Day length**    ${game.dayLength} minutes`,
        `**Min players**   ${game.mode === GAME_MODE.POPCORN ? '3+' : '4+'}`,
        `**Inned**         (${game.players.size})`,
      ].join('\n');

      const playerList = [...game.players.values()].map(p => `**${p.number}.** ${p.user.username}`).join('  ·  ');

      const embed = new EmbedBuilder()
        .setColor(result.success ? 0x2ECC71 : 0xE74C3C)
        .setTitle(result.success ? 'Setup' : 'Error')
        .setDescription(
          result.success
            ? `${setupStr}\n\n**Players:** ${playerList}${isHost ? '\n\n**You are the HOST!** Use `w.start` to begin.' : ''}`
            : result.message
        )
        .setFooter({ text: `Host: <@${game.hostId}>` })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.out ── */
    if (cmd === 'w.out') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No game in this channel!').setTimestamp()] });
      }
      const targetUser = message.mentions.users.first() || message.author;
      const isHost = message.author.id === game.hostId;
      if (targetUser.id !== message.author.id && !isHost) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Only the host can remove other players!').setTimestamp()] });
      }
      const result = game.leave(targetUser.id);
      if (targetUser.id === game.hostId && game.state === GAME_STATE.WAITING && game.players.size > 0) {
        game.hostId = game.players.keys().next().value;
      }
      const embed = new EmbedBuilder()
        .setColor(result.success ? 0x2ECC71 : 0xE74C3C)
        .setDescription(result.message)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.setup ── */
    if (cmd === 'w.setup') {
      let game = activeGames.get(message.channel.id);
      if (!game) {
        game = new WerewolfGame(message.guild.id, message.channel.id, message.author.id);
        game.channel = message.channel;
        activeGames.set(message.channel.id, game);
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Only the host can change settings!').setTimestamp()] });
      }

      const setting = args[1]?.toLowerCase();
      const value = args[2]?.toLowerCase();

      if (!setting) {
        // Wolfia-style setup embed
        const modeCheck = game.mode === GAME_MODE.POPCORN;
        const setupStr = [
          `**Game**          ${modeCheck ? '[x]' : '[ ]'} Popcorn   ${!modeCheck ? '[x]' : '[ ]'} Mafia`,
          `**Day length**    ${game.dayLength} minutes`,
          `**Shoot timer**   ${game.shootTimerLength}s ${modeCheck ? '(Popcorn)' : '(N/A)'}`,
          `**Min players**   ${game.mode === GAME_MODE.POPCORN ? '3+' : '4+'}`,
          `**Inned**         (${game.players.size})`,
        ].join('\n');

        const setupEmbed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`Setup for channel #${message.channel.name}`)
          .setDescription(setupStr)
          .addFields({
            name: 'Commands',
            value: '`w.setup mode popcorn` — Popcorn\n`w.setup mode mafia` — Mafia\n`w.setup daylength <1-30>` — Day timer\n`w.setup shoottimer <10-120>` — Shoot timer (Popcorn)',
            inline: false,
          })
          .setTimestamp();
        return message.reply({ embeds: [setupEmbed] });
      }

      let result;
      if (setting === 'mode') {
        result = game.setMode(value);
      } else if (setting === 'daylength') {
        result = game.setDayLength(value);
      } else if (setting === 'shoottimer') {
        result = game.setShootTimer(value);
      } else {
        result = { success: false, message: '🚫 Unknown setting! Use `mode`, `daylength`, or `shoottimer`' };
      }

      return message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] });
    }

    /* ── w.start ── */
    if (cmd === 'w.start') {
      let game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No game in this channel! Use `w.in` first.').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Only the **host** can start the game!').setTimestamp()] });
      }
      if (game.started) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Game already started!').setTimestamp()] });
      }
      const result = game.start();
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }

      const alivePlayers = game.getAlivePlayers();
      const playerListStr = alivePlayers.map(p => `**${p.number}.** ${p.user.username}`).join('\n');

      if (result.mode === GAME_MODE.POPCORN) {
        const gunHolder = game.players.get(game.gunHolder);
        const startEmbed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('Popcorn — Day 1')
          .setDescription(
            `**Game**          Popcorn\n**Day**           1\n**Living**        ${alivePlayers.length} players\n**Wolves**        ${result.wolfCount}\n**Gun holder**    **${gunHolder.number}.** ${gunHolder.user.username}\n\nUse \`w.shoot <number>\` to shoot!\nHit opposite team = target dies\nHit same team = YOU die, gun passes\n\n⏱️ **${game.shootTimerLength}s** to shoot or you're eliminated!\n\nCheck your DMs for your role!`
          )
          .addFields({ name: `Living Players (${alivePlayers.length})`, value: playerListStr, inline: false })
          .setFooter({ text: `Popcorn Mode — ${game.shootTimerLength}s shoot timer!` })
          .setTimestamp();
        await message.reply({ embeds: [startEmbed] });

        // Start shoot timer for gun holder
        await startPopcornShootTimer(game);
      } else {
        const startEmbed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('Mafia — Night 1')
          .setDescription(
            `**Game**          Mafia\n**Day**           1\n**Living**        ${alivePlayers.length} players\n**Mafia**         ${result.wolfCount}\n\nNight 1 begins now...\nCheck your DMs for your role!\nNight actions: ${NIGHT_TIMER}s`
          )
          .addFields({ name: `Living Players (${alivePlayers.length})`, value: playerListStr, inline: false })
          .setFooter({ text: 'Mafia Mode — Deception begins!' })
          .setTimestamp();
        await message.reply({ embeds: [startEmbed] });
      }

      // DM each player their role
      for (const [id, player] of game.players) {
        try {
          let roleMsg = '';
          if (player.role === ROLE.WOLF) {
            const otherWolves = game.getAliveWolves().filter(w => w.user.id !== id);
            if (game.mode === GAME_MODE.POPCORN) {
              const hasGun = game.gunHolder === id;
              roleMsg = `You are a **WOLF**!\n\nKeep your identity secret.\nFind and eliminate villagers.${otherWolves.length > 0 ? `\n\nWolf teammates: ${otherWolves.map(w => `**${w.number}.** ${w.user.username}`).join('  ·  ')}` : '\n\nYou are the only wolf!'}${hasGun ? '\n\n**YOU HAVE THE GUN!** Use `w.shoot <number>` to shoot!' : ''}`;
            } else {
              roleMsg = `You are **MAFIA**!\n\nKill at night with \`w.nk <number>\`\nKeep your identity secret.${otherWolves.length > 0 ? `\n\nMafia teammates: ${otherWolves.map(w => `**${w.number}.** ${w.user.username}`).join('  ·  ')}` : '\n\nYou are the only mafia!'}\n\nUse \`w.nk <number>\` in DM at night.`;
            }
          } else if (player.role === ROLE.DOCTOR) {
            const aliveList = game.getAlivePlayers().map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            roleMsg = `You are the **DOCTOR**!\n\nSave one person each night.\nDM: \`w.save <number>\`\nCan't save same person 2 nights in a row.\n\nAlive players:\n${aliveList}`;
          } else if (player.role === ROLE.SEER) {
            const checkList = game.getAlivePlayers().filter(p => p.user.id !== id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            if (game.mode === GAME_MODE.POPCORN) {
              roleMsg = `You are the **SEER**!\n\nYour instinct tells you who is suspicious.\nKeep your identity secret.\nShare info carefully — wolves may target you!`;
            } else {
              roleMsg = `You are the **COP**!\n\nInvestigate one player each night.\nDM: \`w.check <number>\`\n\nOther alive players:\n${checkList}`;
            }
          } else {
            if (game.mode === GAME_MODE.POPCORN) {
              roleMsg = `You are a **VILLAGER**!\n\nSurvive and find the wolves.\nPay attention to who shoots who.\nHelp identify the wolves!`;
            } else {
              roleMsg = `You are a **VILLAGER**!\n\nSurvive and find the mafia.\nVote during the day: \`w.vote <number>\`\nSleep at night...`;
            }
          }
          await player.user.send({
            embeds: [new EmbedBuilder()
              .setColor(ROLE_COLORS[player.role] || 0xFF69B4)
              .setTitle(`Your Role — ${player.role}`)
              .setDescription(roleMsg)
              .setFooter({ text: "Don't share your role!" })
              .setTimestamp()]
          });
        } catch (err) {
          console.error(`Could not DM ${player.user.username}:`, err.message);
          await message.channel.send(`Could not DM <@${id}> — tell them to enable DMs!`);
        }
      }

      // If Mafia mode, start night phase
      if (result.mode === GAME_MODE.MAFIA) {
        await startMafiaNight(game);
      }
      return;
    }

    /* ── w.shoot (Popcorn mode) ── */
    if (cmd === 'w.shoot' || cmd === 'w.s') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No active game! Use `w.in` then `w.start`').setTimestamp()] });
      }
      if (game.mode !== GAME_MODE.POPCORN) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('`w.shoot` is for Popcorn mode only! Use `w.vote` in Mafia.').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Use `w.shoot <number>` — Example: `w.shoot 3`').setTimestamp()] });
      }
      const result = game.shoot(message.author.id, targetNum);
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }

      // Clear shoot timer — gun holder shot in time
      if (game.shootTimer) { clearTimeout(game.shootTimer); game.shootTimer = null; }
      if (game._shootWarningTimer) { clearTimeout(game._shootWarningTimer); game._shootWarningTimer = null; }

      // Shoot result embed — Wolfia style with updated game state
      const alivePlayers = game.getAlivePlayers();
      const livingStr = alivePlayers.map(p => `**${p.number}.** ${p.user.username}`).join('  ·  ');
      const wolvesStr = game.getAliveWolves().map(p => `**${p.number}.** ${p.user.username}`).join('  ·  ');
      const gunHolder = game.players.get(game.gunHolder);

      const shootEmbed = new EmbedBuilder()
        .setColor(result.shooterDies ? 0xE74C3C : 0xFFD700)
        .setTitle(result.shooterDies ? 'Misfire!' : 'Hit!')
        .setDescription(
          `${result.message}\n\n**Game**          Popcorn\n**Day**           ${game.round}\n**Living**        ${alivePlayers.length}\n**Gun holder**    **${gunHolder?.number || '?'}.** ${gunHolder?.user.username || 'None'}`
        )
        .addFields(
          { name: `Living Players (${alivePlayers.length})`, value: livingStr || 'None', inline: false },
        )
        .setTimestamp();
      await message.reply({ embeds: [shootEmbed] });

      // Check win
      const winCheck = game.checkWin();
      if (winCheck) {
        const winEmbed = new EmbedBuilder()
          .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
          .setTitle(winCheck.winner === 'wolves' ? 'Wolves Win!' : 'Village Wins!')
          .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
          .setFooter({ text: 'Game Over — Thanks for playing!' })
          .setTimestamp();
        await message.channel.send({ embeds: [winEmbed] });
        activeGames.delete(message.channel.id);
      } else if (result.shooterDies && gunHolder) {
        // Gun passed to target — start new shoot timer
        const gunEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('Gun Passed!')
          .setDescription(`The gun passes to **${gunHolder.user.username}**!\n\nUse \`w.shoot <number>\` to shoot!\n⏱️ **${game.shootTimerLength}s** on the clock!`)
          .setTimestamp();
        await message.channel.send({ embeds: [gunEmbed] });
        await startPopcornShootTimer(game);
      } else {
        // Shooter keeps gun — restart shoot timer
        await startPopcornShootTimer(game);
      }
      return;
    }

    /* ── w.vote (Mafia mode) ── */
    if (cmd === 'w.vote' || cmd === 'w.v') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No active game!').setTimestamp()] });
      }
      if (game.mode !== GAME_MODE.MAFIA) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('`w.vote` is for Mafia mode only! Use `w.shoot` in Popcorn.').setTimestamp()] });
      }
      if (game.state !== GAME_STATE.DAY) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('You can only vote during the day!').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Use `w.vote <number>` — Example: `w.vote 3`').setTimestamp()] });
      }
      const target = game.getPlayerByNumber(targetNum);
      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`Player #${targetNum} not found or dead!`).setTimestamp()] });
      }
      const result = game.vote(message.author.id, target.user.id);
      if (result.success) {
        const voteCount = game.votes.size;
        const aliveCount = game.getAlivePlayers().length;
        await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setDescription(`${result.message}\n**${voteCount}/${aliveCount}** votes cast`).setTimestamp()] });
        if (voteCount >= aliveCount) await resolveMafiaVote(game);
      } else {
        await message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }
      return;
    }

    /* ── w.unvote ── */
    if (cmd === 'w.unvote' || cmd === 'w.u') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.mode !== GAME_MODE.MAFIA) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No active Mafia game!').setTimestamp()] });
      }
      const result = game.unvote(message.author.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] });
    }

    /* ── w.votecount ── */
    if (cmd === 'w.votecount' || cmd === 'w.vc') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.mode !== GAME_MODE.MAFIA) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No active Mafia game!').setTimestamp()] });
      }
      const vc = game.getVoteCountString();
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('Vote Count').setDescription(vc).setTimestamp()] });
    }

    /* ── w.status ── */
    if (cmd === 'w.status' || cmd === 'w.st') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No game in this channel! Use `w.in` to sign up.').setTimestamp()] });
      }

      const alivePlayers = game.getAlivePlayers();
      const livingStr = alivePlayers.map(p => `**${p.number}.** ${p.user.username}`).join('  ·  ');

      let statusDesc = '';
      if (game.started) {
        statusDesc = `**Game**          ${game.mode === GAME_MODE.POPCORN ? 'Popcorn' : 'Mafia'}\n`;
        statusDesc += `**Day**           ${game.round}\n`;
        statusDesc += `**Phase**         ${game.state === GAME_STATE.NIGHT ? 'Night' : game.state === GAME_STATE.DAY ? 'Day' : 'Ended'}\n`;
        statusDesc += `**Living**        ${alivePlayers.length}\n`;
        if (game.mode === GAME_MODE.POPCORN) {
          const gunHolder = game.players.get(game.gunHolder);
          if (gunHolder) statusDesc += `**Gun holder**    **${gunHolder.number}.** ${gunHolder.user.username}\n`;
          statusDesc += `**Shoot timer**   ${game.shootTimerLength}s\n`;
        }
        if (game.mode === GAME_MODE.MAFIA && game.state === GAME_STATE.DAY) {
          statusDesc += `**Votes**         ${game.votes.size}/${alivePlayers.length}\n`;
        }
      } else {
        const modeCheck = game.mode === GAME_MODE.POPCORN;
        statusDesc = `**Game**          ${modeCheck ? '[x]' : '[ ]'} Popcorn   ${!modeCheck ? '[x]' : '[ ]'} Mafia\n`;
        statusDesc += `**Day length**    ${game.dayLength} minutes\n`;
        statusDesc += `**Shoot timer**   ${game.shootTimerLength}s ${modeCheck ? '(Popcorn)' : '(N/A)'}\n`;
        statusDesc += `**Min players**   ${game.mode === GAME_MODE.POPCORN ? '3+' : '4+'}\n`;
        statusDesc += `**Inned**         (${game.players.size})\n`;
      }

      const deadList = game.getDeadListString();

      const statusEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(game.started ? `${game.mode === GAME_MODE.POPCORN ? 'Popcorn' : 'Mafia'} — Status` : `Setup for channel #${message.channel.name}`)
        .setDescription(statusDesc);
      if (game.started) {
        statusEmbed.addFields({ name: `Living (${alivePlayers.length})`, value: livingStr || 'None', inline: false });
        if (deadList) statusEmbed.addFields({ name: 'Eliminated', value: deadList, inline: false });
      } else {
        const playerListStr = [...game.players.values()].map(p => `**${p.number}.** ${p.user.username}`).join('  ·  ');
        statusEmbed.addFields({ name: `Signed Up (${game.players.size})`, value: playerListStr || 'None', inline: false });
      }
      statusEmbed.setFooter({ text: `Host: <@${game.hostId}>` }).setTimestamp();
      return message.reply({ embeds: [statusEmbed] });
    }

    /* ── w.players ── */
    if (cmd === 'w.players') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No game in this channel!').setTimestamp()] });
      }
      const aliveList = game.getPlayerListString();
      const deadList = game.getDeadListString();
      const embed = new EmbedBuilder().setColor(0xFF69B4).setTitle('Players');
      if (game.started) {
        embed.addFields({ name: `Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false });
        if (deadList) embed.addFields({ name: 'Eliminated', value: deadList, inline: false });
      } else {
        embed.addFields({ name: `Signed Up (${game.players.size})`, value: aliveList || 'None', inline: false });
      }
      embed.setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.end ── */
    if (cmd === 'w.end') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('No game to end!').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('Only the **host** can end the game!').setTimestamp()] });
      }
      game.end();
      const playerList = game.getFullPlayerListString();
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('Game Ended!')
        .setDescription(`The game was ended by the host.\n\n${playerList}`)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── Handle w.nightkill/w.nk/w.save/w.check typed in channel (Mafia mode) ── */
    if (msgContent.startsWith('w.nightkill ') || msgContent.startsWith('w.nk ') || msgContent.startsWith('w.save ') || msgContent.startsWith('w.check ')) {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED || game.mode !== GAME_MODE.MAFIA) return;
      if (game.state !== GAME_STATE.NIGHT) {
        return message.reply('🌙 Night actions only during the night!');
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) return message.reply(`❌ Use \`${cmd} <number>\``);

      let result;
      if (cmd === 'w.nightkill' || cmd === 'w.nk') result = game.wolfKill(message.author.id, targetNum);
      else if (cmd === 'w.save') result = game.doctorSave(message.author.id, targetNum);
      else if (cmd === 'w.check') result = game.seerCheck(message.author.id, targetNum);

      if (result) {
        try {
          await message.author.send(result.message);
          try { await message.delete(); } catch (e) { /* can't delete */ }
        } catch (e) {
          await message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] }).then(m => {
            setTimeout(() => m.delete().catch(() => {}), 5000);
          });
        }
        if (result.success) await tryAutoResolveMafiaNight(game);
      }
      return;
    }
  }

  /* ═══════════════════════════════════════════
     🏏 Hand Cricket Commands
     ═══════════════════════════════════════════ */

  if (msgContent.startsWith('hc.')) {
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    /* ── hc.help ── */
    if (cmd === 'hc.help') {
      const hcHelp = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏏 Hand Cricket — Commands')
        .setDescription('Indian childhood classic — now on Discord!')
        .addFields(
          { name: '🎮 Game Modes', value: '`hc.play [overs] [wickets]` — Play vs Bot\n`hc.challenge @user [overs] [wickets]` — Challenge a friend\n`hc.accept` — Accept challenge\n`hc.decline` — Decline challenge', inline: false },
          { name: '🪙 Toss', value: '`hc.toss odd` or `hc.toss even` — Multiplayer toss\nDM `heads` or `tails` — Single player toss\nThen DM the bot a number (1-6)', inline: false },
          { name: '🏏 Playing', value: 'DM the bot a number (1-6) each ball\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs', inline: false },
          { name: '📊 Stats & Fun', value: '`hc.profile` — Your stats\n`hc.profile @user` — Someone\'s stats\n`hc.score` — Current match score\n`hc.sledge @user` — Roast your friend 🔥', inline: false },
          { name: '📖 Other', value: '`hc.howtoplay` — Detailed guide\n`hc.quit` — Quit current game', inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [hcHelp] });
    }

    /* ── hc.challenge ── */
    if (cmd === 'hc.challenge') {
      const target = message.mentions.users.first();
      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🏏 Mention someone to challenge! `hc.challenge @user`').setTimestamp()] });
      }
      if (target.id === message.author.id) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤦 You can\'t challenge yourself!').setTimestamp()] });
      }
      if (target.bot) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤖 You can\'t challenge bots!').setTimestamp()] });
      }

      // Check if either player is already in a game
      if (hcPlayerMap.has(message.author.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are already in a game! Use `hc.quit` first.').setTimestamp()] });
      }
      if (hcPlayerMap.has(target.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 **${target.username}** is already in a game!`).setTimestamp()] });
      }

      // Check if there's already a game in this channel
      if (activeHCGames.has(message.channel.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 There\'s already a game in this channel! Wait for it to finish.').setTimestamp()] });
      }

      const overs = parseInt(args[2]) || 1;
      const wickets = parseInt(args[3]) || 2;
      if (overs < 1 || overs > 10) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Overs must be 1-10!').setTimestamp()] });
      if (wickets < 1 || wickets > 10) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Wickets must be 1-10!').setTimestamp()] });

      const game = new HandCricketGame(message.author.id, target.id, message.channel.id, message.guild.id, { overs, wickets });
      game.channel = message.channel;
      activeHCGames.set(message.channel.id, game);
      hcPlayerMap.set(message.author.id, message.channel.id);
      hcPlayerMap.set(target.id, message.channel.id);

      const challengeEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏏 Hand Cricket Challenge!')
        .setDescription(
          `**${message.author.username}** challenged **${target.username}** to Hand Cricket!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n┣ ✅ **${target.username}**: Type \`hc.accept\`\n┣ ❌ **${target.username}**: Type \`hc.decline\`\n┗ ⏰ Waiting for response...`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [challengeEmbed] });
    }

    /* ── hc.accept ── */
    if (cmd === 'hc.accept') {
      const game = activeHCGames.get(message.channel.id);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No pending challenge to accept!').setTimestamp()] });
      }
      if (message.author.id !== game.opponentId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the challenged player can accept!').setTimestamp()] });
      }

      game.accept();

      const acceptEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏏 Challenge Accepted!')
        .setDescription(
          `Game ON! 🎉\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🪙 **Toss Time!**\n┣ Both players: type \`hc.toss odd\` or \`hc.toss even\`\n┣ Then DM me a number (1-6) for the toss\n┗ 🤫 Your number is secret!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [acceptEmbed] });
    }

    /* ── hc.decline ── */
    if (cmd === 'hc.decline') {
      const game = activeHCGames.get(message.channel.id);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No pending challenge to decline!').setTimestamp()] });
      }
      if (message.author.id !== game.opponentId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the challenged player can decline!').setTimestamp()] });
      }

      game.decline();
      activeHCGames.delete(message.channel.id);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🏏 Challenge Declined!').setDescription(`**${message.author.username}** declined the challenge.`).setTimestamp()] });
    }

    /* ── hc.toss ── */
    if (cmd === 'hc.toss') {
      const game = activeHCGames.get(message.channel.id);
      if (!game || game.phase !== HC_PHASE.TOSS) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active toss! Use `hc.challenge` first.').setTimestamp()] });
      }
      const choice = args[1]?.toLowerCase();
      if (!choice || !['odd', 'even'].includes(choice)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Use `hc.toss odd` or `hc.toss even`!').setTimestamp()] });
      }

      const result = game.setTossChoice(message.author.id, choice);

      if (result.message === 'waiting') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🪙 Toss Choice Recorded!').setDescription(`You chose **${choice}**!\n\nWaiting for the other player to choose...`).setTimestamp()] });
      }

      if (result.message === 'both_chosen') {
        // Both chose odd/even — now they need to DM numbers
        const p1Name = client.users.cache.get(game.players[0])?.username;
        const p2Name = client.users.cache.get(game.players[1])?.username;

        const tossReadyEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('🪙 Toss — Both Chosen!')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ **${p1Name}**: ${result.p1Choice === 'odd' ? '🔴 Odd' : '🔵 Even'}\n` +
            `┣ **${p2Name}**: ${result.p2Choice === 'odd' ? '🔴 Odd' : '🔵 Even'}\n` +
            `┗ 📨 **DM me a number (1-6) now!**`
          )
          .setFooter({ text: '🏏 Your number is secret — DM only!' })
          .setTimestamp();
        await message.reply({ embeds: [tossReadyEmbed] });

        // DM both players
        for (const pid of game.players) {
          try {
            await client.users.cache.get(pid)?.send({
              embeds: [new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🪙 Toss Time!')
                .setDescription(`Type a number **1-6** to submit your toss number!\\n\\nYour choice is secret — choose wisely!`)
                .setTimestamp()]
            });
          } catch (e) {
            await message.channel.send(`⚠️ Could not DM <@${pid}> — tell them to enable DMs!`);
          }
        }
        return;
      }

      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }
    }

    /* ── hc.score ── */
    if (cmd === 'hc.score') {
      const game = activeHCGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel!').setTimestamp()] });
      }

      const score = game.getScoreString();
      const p1Name = client.users.cache.get(game.players[0])?.username || 'Player 1';
      const p2Name = client.users.cache.get(game.players[1])?.username || 'Player 2';
      const batName = client.users.cache.get(score.battingNow)?.username || '???';
      const bowlName = client.users.cache.get(score.bowlingNow)?.username || '???';

      let desc = `━━━━━━━━━━━━━━━━━━━\\n`;
      desc += `┣ 🏏 **${p1Name}**: ${score.p1.runs}/${score.p1.wickets} (${score.p1.balls} balls)\\n`;
      desc += `┣ 🏏 **${p2Name}**: ${score.p2.runs}/${score.p2.wickets} (${score.p2.balls} balls)\\n`;

      if (game.phase === HC_PHASE.PLAYING || game.phase === HC_PHASE.INNINGS_BREAK) {
        desc += `┣ 🏏 **Batting:** ${batName}\\n`;
        desc += `┣ 🎯 **Bowling:** ${bowlName}\\n`;
        desc += `┣ 📏 **Innings:** ${score.currentInnings}/2\\n`;
      }
      desc += `┗ 📋 **Phase:** ${game.phase === HC_PHASE.WAITING ? 'Waiting' : game.phase === HC_PHASE.TOSS ? 'Toss' : game.phase === HC_PHASE.TOSS_CHOICE ? 'Toss Choice' : game.phase === HC_PHASE.PLAYING ? 'Playing' : game.phase === HC_PHASE.INNINGS_BREAK ? 'Innings Break' : 'Ended'}`;

      return message.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🏏 Scoreboard').setDescription(desc).setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' }).setTimestamp()] });
    }

    /* ── hc.quit ── */
    if (cmd === 'hc.quit') {
      const hcChannelId = hcPlayerMap.get(message.author.id);
      if (!hcChannelId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are not in any game!').setTimestamp()] });
      }
      const game = activeHCGames.get(hcChannelId);
      if (!game) {
        hcPlayerMap.delete(message.author.id);
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game found!').setTimestamp()] });
      }

      const result = game.quit(message.author.id);
      const winnerName = result.winner ? client.users.cache.get(result.winner)?.username : null;
      activeHCGames.delete(hcChannelId);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🏏 Game Quit!').setDescription(`**${message.author.username}** quit the game! ${winnerName ? `**${winnerName}** wins!` : ''}`).setTimestamp()] });
    }

    /* ── hc.play — Single player vs Bot ── */
    if (cmd === 'hc.play') {
      // Check if already in game
      if (hcPlayerMap.has(message.author.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are already in a game! Use `hc.quit` first.').setTimestamp()] });
      }
      if (activeHCGames.has(message.channel.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 There\'s already a game in this channel!').setTimestamp()] });
      }

      // Parse overs/wickets: hc.play 2 3 = 2 overs, 3 wickets
      const overs = parseInt(args[1]) || 1;
      const wickets = parseInt(args[2]) || 2;
      if (overs < 1 || overs > 10) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Overs must be 1-10!').setTimestamp()] });
      if (wickets < 1 || wickets > 10) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Wickets must be 1-10!').setTimestamp()] });

      const botId = 'BOT_' + message.author.id; // virtual bot ID
      const game = new HandCricketGame(message.author.id, botId, message.channel.id, message.guild.id, { isBot: true, overs, wickets });
      game.channel = message.channel;
      activeHCGames.set(message.channel.id, game);
      hcPlayerMap.set(message.author.id, message.channel.id);

      const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

      const playEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏏 Single Player — vs Bot!')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🏏 **You** vs **${botName}**\n` +
          `┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n` +
          `┣ 🪙 **Toss Time!**\n` +
          `┗ DM me **heads** or **tails** for the coin toss!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [playEmbed] });
    }

    /* ── hc.profile ── */
    if (cmd === 'hc.profile') {
      const targetUser = message.mentions.users.first() || message.author;
      const profile = await hcProfileManager.getOrCreateProfile(targetUser.id, targetUser.username);
      if (!profile) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Profile not available (database issue).').setTimestamp()] });
      }
      const winRate = profile.games_played > 0 ? ((profile.games_won / profile.games_played) * 100).toFixed(1) : '0.0';
      const avgRuns = profile.games_played > 0 ? (profile.total_runs / profile.games_played).toFixed(1) : '0.0';
      const strikeRate = profile.total_balls > 0 ? ((profile.total_runs / profile.total_balls) * 100).toFixed(1) : '0.0';

      const profileEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: `${targetUser.username}'s Profile`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
        .setTitle('🏏 Hand Cricket Stats')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🎮 **Games:** ${profile.games_played}\n` +
          `┣ 🏆 **Wins:** ${profile.games_won}\n` +
          `┣ 📊 **Win Rate:** ${winRate}%\n` +
          `┣ 🏏 **Total Runs:** ${profile.total_runs}\n` +
          `┣ 📈 **Avg Runs:** ${avgRuns}\n` +
          `┣ 💥 **Highest Score:** ${profile.highest_score}\n` +
          `┣ 🔥 **Strike Rate:** ${strikeRate}\n` +
          `┣ 🎯 **Total Wickets:** ${profile.total_wickets}\n` +
          `┣ 4️⃣ **Fours:** ${profile.total_fours}\n` +
          `┗ 6️⃣ **Sixes:** ${profile.total_sixes}`
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [profileEmbed] });
    }

    /* ── hc.sledge ── */
    if (cmd === 'hc.sledge') {
      const target = message.mentions.users.first();
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🏏 Mention someone to sledge! `hc.sledge @user`').setTimestamp()] });
      if (target.id === message.author.id) return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤦 You can\'t sledge yourself!').setTimestamp()] });

      const sledge = SLEDGE_MESSAGES[Math.floor(Math.random() * SLEDGE_MESSAGES.length)]
        .replace(/{user}/g, message.author.username)
        .replace(/{target}/g, target.username);

      const sledgeEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🔥 SLEDGE!')
        .setDescription(sledge)
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [sledgeEmbed] });
    }

    /* ── hc.howtoplay ── */
    if (cmd === 'hc.howtoplay') {
      const guideEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🏏 Hand Cricket — Complete Guide')
        .setDescription('Indian childhood classic — now on Discord!')
        .addFields(
          { name: '🎮 Game Modes', value: '`hc.play [overs] [wickets]` — Play vs Bot (default: 1 over, 2 wickets)\n`hc.challenge @user` — Challenge a friend\n`hc.accept` / `hc.decline` — Respond to challenge', inline: false },
          { name: '🪙 Toss (Single Player)', value: 'DM the bot `heads` or `tails`\nCoin flip decides who wins the toss\nWinner chooses to bat or bowl', inline: false },
          { name: '🪙 Toss (Multiplayer)', value: '`hc.toss odd` or `hc.toss even` in channel\nThen DM the bot a number (1-6)\nSum odd/even decides toss winner!\nWinner DMs `bat` or `bowl`', inline: false },
          { name: '🏏 Playing', value: 'DM the bot a number (1-6) each ball\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs', inline: false },
          { name: '📏 Scoring', value: '1️⃣ = 1 run  ·  2️⃣ = 2 runs  ·  3️⃣ = 3 runs\n4️⃣ = 4 runs (FOUR!)  ·  5️⃣ = 5 runs  ·  6️⃣ = 6 runs (SIXER!)\nEach innings = overs × 6 balls\nAll wickets down = all out!', inline: false },
          { name: '🏆 Winning', value: '2 innings each — highest score wins!\nIn 2nd innings, if chaser passes target = instant win!\nEqual scores = TIE', inline: false },
          { name: '📊 Other Commands', value: '`hc.profile` — Your stats\n`hc.profile @user` — Someone\'s stats\n`hc.score` — Current match score\n`hc.sledge @user` — Roast your friend 🔥\n`hc.quit` — Quit current game', inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return message.reply({ embeds: [guideEmbed] });
    }
  }

  const username = message.member?.displayName || message.author.username;
  const content = message.content.toLowerCase().trim();

  /* ── AFK Prefix Commands ── */
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
      .setAuthor({ name: `${username} is now ${isBreak ? 'on a break' : 'AFK'}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setTitle(isBreak ? '☕ Break Time!' : '🌙 AFK Mode Activated')
      .setDescription(styledDesc)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ text: `💕 I'll be waiting for you, ${message.author.username}…` })
      .setTimestamp();

    const isOwner = message.guild.ownerId === message.author.id;
    const botCanManageNicknames = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames);
    const botCanManageRoles = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles);

    const afkRole = await getAfkRole(message.guild);
    if (afkRole && message.member && botCanManageRoles && !message.member.roles.cache.has(afkRole.id)) {
      try { await message.member.roles.add(afkRole, 'User went AFK'); } catch (e) { /* silently skip */ }
    }
    if (message.member && !isOwner && botCanManageNicknames) {
      try {
        const afkNick = getAfkNickname(message.member.nickname, message.author.username);
        await message.member.setNickname(afkNick, 'User went AFK');
      } catch (e) { /* silently skip — hierarchy issue */ }
    }

    return message.reply({ embeds: [embed] }).catch(console.error);
  }

  /* ── AFK Return ── */
  try {
    const { data: afkData, error: dbError } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', message.author.id)
      .eq('guild_id', message.guild.id)
      .maybeSingle();

    if (dbError) { console.error('Supabase query error:', dbError); return; }

    if (afkData) {
      const away = timeSince(afkData.afk_time);
      const returnDesc = `Welcome back <@${message.author.id}>!\nI have removed your AFK status.\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${afkData.reason}\`\n┗ ⏱️ **Away For:** \`${away}\``;

      const embed = new EmbedBuilder()
        .setColor(0xFF1493)
        .setAuthor({ name: `${username} is back!`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setTitle('💝 Welcome Back!')
        .setDescription(returnDesc)
        .setThumbnail(afkData.avatar_url || message.author.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: "💫 So glad you're back!" })
        .setTimestamp();
      await message.reply({ embeds: [embed] }).catch(console.error);

      const isReturnOwner = message.guild.ownerId === message.author.id;
      const botCanManageNicknames = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageNicknames);
      const botCanManageRoles = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles);

      const afkRoleRemove = message.guild.roles.cache.find(r => r.name === AFK_ROLE_NAME);
      if (afkRoleRemove && message.member?.roles.cache.has(afkRoleRemove.id) && botCanManageRoles) {
        try { await message.member.roles.remove(afkRoleRemove, 'User returned from AFK'); } catch (e) { /* silently skip */ }
      }
      if (message.member && !isReturnOwner && botCanManageNicknames) {
        try {
          const normalNick = getNormalNickname(message.member.nickname, message.author.username);
          await message.member.setNickname(normalNick, 'User returned from AFK');
        } catch (e) { /* silently skip — hierarchy issue */ }
      }
      await supabase.from('afk_users').delete().eq('user_id', message.author.id).eq('guild_id', message.guild.id);
    }
  } catch (err) { console.error('Error in AFK return handler:', err); }

  /* ── AFK Mention ── */
  if (message.mentions.users.size > 0) {
    try {
      for (const [userId] of message.mentions.users) {
        if (userId === message.author.id) continue;
        const cooldownKey = `${message.author.id}-${userId}`;
        const now = Date.now();
        const lastNotified = mentionCooldowns.get(cooldownKey);
        if (lastNotified && now - lastNotified < AFK_MENTION_COOLDOWN) continue;

        const { data: mentionedAfk, error: dbError } = await supabase
          .from('afk_users')
          .select('*')
          .eq('user_id', userId)
          .eq('guild_id', message.guild.id)
          .maybeSingle();

        if (dbError) { console.error('Supabase query error:', dbError); break; }
        if (mentionedAfk) {
          const away = timeSince(mentionedAfk.afk_time);
          const mentionDesc = `${pick(AFK_MENTION_MESSAGES)}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📝 **Reason:** \`${mentionedAfk.reason}\`\n┗ ⏱️ **Away For:** \`${away}\``;
          const embed = new EmbedBuilder()
            .setColor(0xE91E63)
            .setAuthor({ name: `${mentionedAfk.username} is currently AFK`, iconURL: mentionedAfk.avatar_url })
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
    } catch (err) { console.error('Error in AFK mention handler:', err); }
  }

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
    content: message.content, author: message.author, timestamp: message.createdAt,
    attachments: message.attachments ? [...message.attachments.values()] : [],
  });
  if (client.snipes.size > 50) {
    const firstKey = client.snipes.keys().next().value;
    client.snipes.delete(firstKey);
  }
});

/* ═══════════════════════════════════════════
   🚨  Error Handling
   ═══════════════════════════════════════════ */

client.on('error', (error) => {
  if (error.message?.includes('disallowed intents')) {
    console.error('❌ DISALLOWED INTENTS — Enable them in Discord Developer Portal!');
    process.exit(1);
  }
  console.error('Client error:', error);
});

client.on('warn', (warning) => console.warn('⚠️ Warning:', warning));

/* ═══════════════════════════════════════════
   🔑  Login
   ═══════════════════════════════════════════ */

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login:', error.message);
  process.exit(1);
});
