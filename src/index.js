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
  activeGames, NIGHT_TIMER, DAY_TIMER
} = require('./werewolf');
const { pick, timeSince } = require('./utils');
const { HandCricketGame, GAME_PHASE: HC_PHASE } = require('./handcricket');
const activeHCGames = new Map(); // channelId → HandCricketGame
const hcPlayerMap = new Map();  // userId → channelId (for DM routing)

/* ═══════════════════════════════════════════
   🐺 Werewolf — Mafia Night/Day Phase Functions
   ═══════════════════════════════════════════ */

async function startMafiaNight(game) {
  game.startNight();
  const channel = game.channel;
  if (!channel) return;

  const aliveList = game.getAlivePlayersCompact();

  const nightEmbed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle(`🌙 Night ${game.round} — The Town Sleeps...`)
    .setDescription(
      `The mafia is choosing their victim...\nThe doctor may save someone...\nThe cop may investigate...\n\n⏰ You have **${NIGHT_TIMER} seconds** for night actions!`
    )
    .addFields({ name: `👥 Alive Players (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false })
    .setFooter({ text: '🤫 Night actions are secret — check your DMs!' })
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
            .setTitle(`🌙 Night ${game.round} — Mafia Kill`)
            .setDescription(
              `Choose your victim!\n\nUse \`w.nightkill <number>\` or \`w.nk <number>\`\n\n${otherWolves.length > 0 ? `🐺 Your mafia teammates:\n${otherWolves.map(w => `**${w.number}.** ${w.user.username}`).join('\n')}` : 'You are the only mafia!'}\n\nAlive players:\n${aliveList}`
            )
            .setFooter({ text: '🤫 Keep your identity secret!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.DOCTOR) {
        const saveHint = game.lastProtected ? `⚠️ You saved <@${game.lastProtected}> last night — pick someone else!` : '💡 First night — save anyone!';
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`🌙 Night ${game.round} — Doctor Save`)
            .setDescription(`Choose someone to protect!\n\nUse \`w.save <number>\`\n\n${saveHint}\n\nAlive players:\n${aliveList}`)
            .setFooter({ text: '💊 One life saved is one battle won!' })
            .setTimestamp()]
        });
      } else if (player.role === ROLE.SEER) {
        const checkList = game.getAlivePlayers().filter(p => p.user.id !== player.user.id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
        await player.user.send({
          embeds: [new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle(`🌙 Night ${game.round} — Cop Investigate`)
            .setDescription(`Choose someone to investigate!\n\nUse \`w.check <number>\`\n\nOther alive players:\n${checkList}`)
            .setFooter({ text: '🔮 Use your knowledge wisely!' })
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
    dayDesc = `💀 **${nightResults.killed.user.username}** was killed by the mafia last night!\nThey were ${ROLE_EMOJI[nightResults.killed.role]} **${nightResults.killed.role}**.`;
  } else if (nightResults.saved) {
    dayDesc = '🏥 Someone was attacked but the **doctor saved them**! No one died.';
  } else {
    dayDesc = '🌙 A quiet night... no one was attacked.';
  }

  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Mafia Wins!' : '🏘️ Town Wins!')
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
    .setDescription(`${dayDesc}\n\nVote to lynch a suspect!\nUse \`w.vote <number>\` to vote\nUse \`w.unvote\` to remove your vote\nUse \`w.votecount\` to see votes`)
    .addFields({ name: `👥 Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false })
    .setFooter({ text: `⏰ ${DAY_TIMER} seconds to vote!` })
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
    .setTitle('🗳️ Vote Results!')
    .setDescription(`${tally.message}${tally.detail ? '\n\n' + tally.detail : ''}`)
    .setTimestamp();
  await channel.send({ embeds: [tallyEmbed] });

  const winCheck = game.checkWin();
  if (winCheck) {
    const winEmbed = new EmbedBuilder()
      .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
      .setTitle(winCheck.winner === 'wolves' ? '🐺 Mafia Wins!' : '🏘️ Town Wins!')
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
          '🐺 **Mafia DM Commands:**\n' +
          '`w.nightkill <#>` / `w.nk <#>` — Mafia: choose victim\n' +
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
        .setTitle('🐺 Werewolf — Wolfia Style')
        .setDescription('Social deduction game with two modes!')
        .addFields(
          { name: '🎮 Starting', value: '`w.in` — Sign up for game\n`w.out` — Drop from sign up\n`w.setup [setting] [value]` — Configure\n`w.start` — Start game (host only)\n`w.status` — Current game status', inline: false },
          { name: '🍿 Popcorn Mode', value: 'Gun mechanic! Shoot to eliminate.\n`w.shoot <number>` — Shoot someone\n🔫 Shoot opposite team = target dies\n🔫 Shoot same team = YOU die, gun passes', inline: false },
          { name: '🕵️ Mafia Mode', value: 'Classic night/day cycle.\n`w.vote <number>` — Vote to lynch\n`w.unvote` — Remove your vote\n`w.votecount` — See current votes\n`w.nk <number>` — Mafia kill (DM)\n`w.save <number>` — Doctor save (DM)\n`w.check <number>` — Cop check (DM)', inline: false },
          { name: '⚙️ Setup', value: '`w.setup mode popcorn` — Popcorn mode\n`w.setup mode mafia` — Mafia mode\n`w.setup daylength <mins>` — Day length', inline: false },
          { name: '🏆 Win Conditions', value: '🏘️ Village wins = all wolves dead\n🐺 Wolves win = wolves >= villagers', inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Werewolf' })
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
      const embed = new EmbedBuilder()
        .setColor(result.success ? 0x2ECC71 : 0xE74C3C)
        .setTitle('🐺 Werewolf Sign Up')
        .setDescription(
          result.success
            ? `${result.message}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🎮 Use \`w.in\` to sign up\n┣ ${game.mode === GAME_MODE.POPCORN ? '🍿' : '🕵️'} Mode: **${game.mode === GAME_MODE.POPCORN ? 'Popcorn' : 'Mafia'}**\n┗ 👑 Host starts with \`w.start\`${isHost ? '\n\n👑 **You are the HOST!**' : ''}`
            : result.message
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.out ── */
    if (cmd === 'w.out') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel!').setTimestamp()] });
      }
      // Allow host to out other players, or players to out themselves
      const targetUser = message.mentions.users.first() || message.author;
      const isHost = message.author.id === game.hostId;
      if (targetUser.id !== message.author.id && !isHost) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the host can remove other players!').setTimestamp()] });
      }
      const result = game.leave(targetUser.id);
      // If host left and still in waiting, transfer host
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
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the host can change settings!').setTimestamp()] });
      }

      const setting = args[1]?.toLowerCase();
      const value = args[2]?.toLowerCase();

      if (!setting) {
        // Show current setup
        const setupEmbed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('⚙️ Game Setup')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 🎮 **Mode:** ${game.mode === GAME_MODE.POPCORN ? '🍿 Popcorn' : '🕵️ Mafia'}\n` +
            `┣ ⏰ **Day Length:** ${game.dayLength} minutes\n` +
            `┣ 👥 **Signed Up:** ${game.players.size} players\n` +
            `┣ 🏷️ **Status:** ${game.state === GAME_STATE.WAITING ? '⏳ Waiting' : '🎮 In Progress'}\n` +
            `┗ 👑 **Host:** <@${game.hostId}>`
          )
          .addFields({
            name: '📝 Commands',
            value: '`w.setup mode popcorn` — Popcorn mode (gun)\n`w.setup mode mafia` — Mafia mode (night/day)\n`w.setup daylength <1-30>` — Day timer',
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
      } else {
        result = { success: false, message: '🚫 Unknown setting! Use `mode` or `daylength`' };
      }

      return message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] });
    }

    /* ── w.start ── */
    if (cmd === 'w.start') {
      let game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel! Use `w.in` first.').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the **host** can start the game!').setTimestamp()] });
      }
      if (game.started) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Game already started!').setTimestamp()] });
      }
      const result = game.start();
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }

      const playerList = game.getAlivePlayersCompact();

      if (result.mode === GAME_MODE.POPCORN) {
        // Popcorn: DM roles, announce start
        const gunHolder = game.players.get(game.gunHolder);
        const startEmbed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('🍿 Popcorn Game Started!')
          .setDescription(
            `**${game.players.size} players** — **${result.wolfCount}** wolves among you!\n\n${playerList}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🔫 **${gunHolder.user.username}** has the GUN!\n┣ 💥 Use \`w.shoot <number>\` to shoot\n┣ 🎯 Hit opposite team = target dies\n┗ 💀 Hit same team = YOU die, gun passes\n\n🤫 Check your DMs for your role!`
          )
          .setFooter({ text: '🍿 Popcorn Mode — Shoot wisely!' })
          .setTimestamp();
        await message.reply({ embeds: [startEmbed] });
      } else {
        // Mafia: DM roles, start night
        const startEmbed = new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('🕵️ Mafia Game Started!')
          .setDescription(
            `**${game.players.size} players** — **${result.wolfCount}** mafia among you!\n\n${playerList}\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🌙 **Night 1 begins now...**\n┣ 🤫 Check your DMs for your role!\n┗ ⏰ Night actions: ${NIGHT_TIMER}s`
          )
          .setFooter({ text: '🕵️ Mafia Mode — Deception begins!' })
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
              roleMsg = `🐺 You are a **WOLF**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🤫 Keep your identity secret\n┣ 🐺 Find and eliminate villagers\n${otherWolves.length > 0 ? `┣ 🐺 Your wolf teammates:\n${otherWolves.map(w => `┃   **${w.number}.** ${w.user.username}`).join('\n')}\n┗` : '┗ 🐺 You are the only wolf!'}${hasGun ? '\n\n🔫 **YOU HAVE THE GUN!** Use `w.shoot <number>` to shoot!' : ''}`;
            } else {
              roleMsg = `🐺 You are **MAFIA**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🩸 Kill at night with \`w.nk <number>\`\n┣ 🤫 Keep your identity secret\n${otherWolves.length > 0 ? `┣ 🐺 Your mafia teammates:\n${otherWolves.map(w => `┃   **${w.number}.** ${w.user.username}`).join('\n')}\n┗` : '┗ 🐺 You are the only mafia!'}\n\nUse \`w.nightkill <number>\` or \`w.nk <number>\` in DM at night.`;
            }
          } else if (player.role === ROLE.DOCTOR) {
            const aliveList = game.getAlivePlayersCompact();
            roleMsg = `💊 You are the **DOCTOR**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🛡️ Save one person each night\n┣ 📨 DM: \`w.save <number>\`\n┣ ⚠️ Can't save same person 2 nights in a row\n┗ 💉 Keep the town alive!\n\nAlive players:\n${aliveList}`;
          } else if (player.role === ROLE.SEER) {
            const checkList = game.getAlivePlayers().filter(p => p.user.id !== id).map(p => `**${p.number}.** ${p.user.username}`).join('\n');
            if (game.mode === GAME_MODE.POPCORN) {
              roleMsg = `🔮 You are the **SEER**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 👁️ Your instinct tells you who is suspicious\n┣ 🤫 Keep your identity secret\n┗ 💡 Share info carefully — wolves may target you!`;
            } else {
              roleMsg = `🔮 You are the **COP**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 👁️ Investigate one player each night\n┣ 📨 DM: \`w.check <number>\`\n┗ 🧠 Use your knowledge wisely!\n\nOther alive players:\n${checkList}`;
            }
          } else {
            if (game.mode === GAME_MODE.POPCORN) {
              roleMsg = `🏘️ You are a **VILLAGER**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💪 Survive and find the wolves\n┣ 🤔 Pay attention to who shoots who\n┗ 🎯 Help identify the wolves!`;
            } else {
              roleMsg = `🏘️ You are a **VILLAGER**!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 💪 Survive and find the mafia\n┣ 🗳️ Vote during the day: \`w.vote <number>\`\n┗ 😴 Sleep at night...`;
            }
          }
          await player.user.send({
            embeds: [new EmbedBuilder()
              .setColor(ROLE_COLORS[player.role] || 0xFF69B4)
              .setTitle(`🎭 Your Secret Role — ${ROLE_EMOJI[player.role]} ${player.role}`)
              .setDescription(roleMsg)
              .setFooter({ text: "🤫 Don't share your role!" })
              .setTimestamp()]
          });
        } catch (err) {
          console.error(`Could not DM ${player.user.username}:`, err.message);
          await message.channel.send(`⚠️ Could not DM <@${id}> — tell them to enable DMs!`);
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
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active game! Use `w.in` then `w.start`').setTimestamp()] });
      }
      if (game.mode !== GAME_MODE.POPCORN) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 `w.shoot` is for Popcorn mode only! Use `w.vote` in Mafia.').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🔫 Use `w.shoot <number>` — Example: `w.shoot 3`').setTimestamp()] });
      }
      const result = game.shoot(message.author.id, targetNum);
      if (!result.success) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()] });
      }

      // Shoot result embed
      const shootEmbed = new EmbedBuilder()
        .setColor(result.shooterDies ? 0xE74C3C : 0xFFD700)
        .setTitle(result.shooterDies ? '💀 MISFIRE!' : '💥 HIT!')
        .setDescription(result.message)
        .setTimestamp();
      await message.reply({ embeds: [shootEmbed] });

      // Check win
      const winCheck = game.checkWin();
      if (winCheck) {
        const gunHolder = game.players.get(game.gunHolder);
        const winEmbed = new EmbedBuilder()
          .setColor(winCheck.winner === 'wolves' ? 0xE74C3C : 0x2ECC71)
          .setTitle(winCheck.winner === 'wolves' ? '🐺 Wolves Win!' : '🏘️ Village Wins!')
          .setDescription(`${winCheck.message}\n\n${game.getFullPlayerListString()}`)
          .setFooter({ text: '🍿 Game Over — Thanks for playing!' })
          .setTimestamp();
        await message.channel.send({ embeds: [winEmbed] });
        activeGames.delete(message.channel.id);
      } else {
        // Announce new gun holder
        const gunHolder = game.players.get(game.gunHolder);
        if (gunHolder && !result.shooterDies) {
          // Shooter still has gun (they hit opposite team)
        } else if (gunHolder) {
          const gunEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('🔫 New Gun Holder!')
            .setDescription(`The gun passes to **${gunHolder.user.username}**!\n\nUse \`w.shoot <number>\` to shoot!`)
            .setTimestamp();
          await message.channel.send({ embeds: [gunEmbed] });
        }
      }
      return;
    }

    /* ── w.vote (Mafia mode) ── */
    if (cmd === 'w.vote' || cmd === 'w.v') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.state === GAME_STATE.ENDED) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active game!').setTimestamp()] });
      }
      if (game.mode !== GAME_MODE.MAFIA) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 `w.vote` is for Mafia mode only! Use `w.shoot` in Popcorn.').setTimestamp()] });
      }
      if (game.state !== GAME_STATE.DAY) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🌙 You can only vote during the day!').setTimestamp()] });
      }
      const targetNum = parseInt(args[1]);
      if (isNaN(targetNum)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🗳️ Use `w.vote <number>` — Example: `w.vote 3`').setTimestamp()] });
      }
      const target = game.getPlayerByNumber(targetNum);
      if (!target) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 Player #${targetNum} not found or dead!`).setTimestamp()] });
      }
      const result = game.vote(message.author.id, target.user.id);
      if (result.success) {
        const voteCount = game.votes.size;
        const aliveCount = game.getAlivePlayers().length;
        await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setDescription(`${result.message}\n📊 **${voteCount}/${aliveCount}** votes cast`).setTimestamp()] });
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
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active Mafia game!').setTimestamp()] });
      }
      const result = game.unvote(message.author.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(result.success ? 0x2ECC71 : 0xE74C3C).setDescription(result.message).setTimestamp()] });
    }

    /* ── w.votecount ── */
    if (cmd === 'w.votecount' || cmd === 'w.vc') {
      const game = activeGames.get(message.channel.id);
      if (!game || game.mode !== GAME_MODE.MAFIA) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active Mafia game!').setTimestamp()] });
      }
      const vc = game.getVoteCountString();
      return message.reply({ embeds: [new EmbedBuilder().setColor(0xFFD700).setTitle('🗳️ Vote Count').setDescription(vc).setTimestamp()] });
    }

    /* ── w.status ── */
    if (cmd === 'w.status' || cmd === 'w.st') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel! Use `w.in` to sign up.').setTimestamp()] });
      }
      const modeIcon = game.mode === GAME_MODE.POPCORN ? '🍿' : '🕵️';
      const phaseIcon = game.state === GAME_STATE.NIGHT ? '🌙' : game.state === GAME_STATE.DAY ? '☀️' : '⏳';

      let statusDesc = `━━━━━━━━━━━━━━━━━━━\n`;
      statusDesc += `┣ ${modeIcon} **Mode:** ${game.mode === GAME_MODE.POPCORN ? 'Popcorn' : 'Mafia'}\n`;
      statusDesc += `┣ ${phaseIcon} **Phase:** ${game.state === GAME_STATE.WAITING ? 'Waiting' : game.state === GAME_STATE.NIGHT ? `Night ${game.round}` : game.state === GAME_STATE.DAY ? `Day ${game.round}` : 'Ended'}\n`;
      statusDesc += `┣ 👥 **Players:** ${game.getAlivePlayers().length} alive / ${game.players.size} total\n`;

      if (game.mode === GAME_MODE.POPCORN && game.started) {
        const gunHolder = game.players.get(game.gunHolder);
        if (gunHolder) statusDesc += `┣ 🔫 **Gun:** ${gunHolder.user.username}\n`;
      }
      if (game.mode === GAME_MODE.MAFIA && game.state === GAME_STATE.DAY) {
        statusDesc += `┣ 🗳️ **Votes:** ${game.votes.size}/${game.getAlivePlayers().length}\n`;
      }
      statusDesc += `┗ 👑 **Host:** <@${game.hostId}>`;

      const aliveList = game.getPlayerListString();
      const deadList = game.getDeadListString();

      const statusEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🐺 Game Status')
        .setDescription(statusDesc);
      if (game.started) {
        statusEmbed.addFields({ name: `✅ Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false });
        if (deadList) statusEmbed.addFields({ name: '💀 Eliminated', value: deadList, inline: false });
      } else {
        statusEmbed.addFields({ name: `📝 Signed Up (${game.players.size})`, value: game.getPlayerListString() || 'None', inline: false });
      }
      statusEmbed.setTimestamp();
      return message.reply({ embeds: [statusEmbed] });
    }

    /* ── w.players ── */
    if (cmd === 'w.players') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel!').setTimestamp()] });
      }
      const aliveList = game.getPlayerListString();
      const deadList = game.getDeadListString();
      const embed = new EmbedBuilder().setColor(0xFF69B4).setTitle('🐺 Players');
      if (game.started) {
        embed.addFields({ name: `✅ Alive (${game.getAlivePlayers().length})`, value: aliveList || 'None', inline: false });
        if (deadList) embed.addFields({ name: '💀 Eliminated', value: deadList, inline: false });
      } else {
        embed.addFields({ name: `📝 Signed Up (${game.players.size})`, value: aliveList || 'None', inline: false });
      }
      embed.setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    /* ── w.end ── */
    if (cmd === 'w.end') {
      const game = activeGames.get(message.channel.id);
      if (!game) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game to end!').setTimestamp()] });
      }
      if (message.author.id !== game.hostId) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the **host** can end the game!').setTimestamp()] });
      }
      game.end();
      const playerList = game.getFullPlayerListString();
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🐺 Game Ended!')
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
        .setTitle('🏏 Hand Cricket — How to Play!')
        .setDescription('Indian childhood classic — now on Discord!')
        .addFields(
          { name: '🎮 Starting', value: '`hc.challenge @user` — Challenge someone\n`hc.accept` — Accept challenge\n`hc.decline` — Decline challenge\n`hc.quit` — Quit current game', inline: false },
          { name: '🪙 Toss', value: '`hc.toss odd` or `hc.toss even` — Choose toss side\nThen DM the bot a number (1-6)\nSum odd/even decides toss winner!', inline: false },
          { name: '🏏 Playing', value: 'DM the bot a number (1-6) each ball\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs', inline: false },
          { name: '📏 Format', value: '6 balls per innings, 2 wickets = all out\n2 innings each — highest score wins!', inline: false },
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

      const game = new HandCricketGame(message.author.id, target.id, message.channel.id, message.guild.id);
      game.channel = message.channel;
      activeHCGames.set(message.channel.id, game);
      hcPlayerMap.set(message.author.id, message.channel.id);
      hcPlayerMap.set(target.id, message.channel.id);

      const challengeEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏏 Hand Cricket Challenge!')
        .setDescription(
          `**${message.author.username}** challenged **${target.username}** to Hand Cricket!\n\n━━━━━━━━━━━━━━━━━━━\n┣ ✅ **${target.username}**: Type \`hc.accept\`\n┣ ❌ **${target.username}**: Type \`hc.decline\`\n┗ ⏰ Waiting for response...`
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
