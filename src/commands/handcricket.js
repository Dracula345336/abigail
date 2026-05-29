const { SlashCommandBuilder, MessageFlags, EmbedBuilder, userMention, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { HandCricketGame, GAME_PHASE: HC_PHASE, EMOJI_NUMBERS, SLEDGE_MESSAGES, BOT_PROFILES, ECONOMY, MATCH_TURN_TIMEOUT, CELEBRATION_GIFS, MMR, COLORS, CRICKET_LEGENDS, grantEconomyRewards } = require('../handcricket');

let activeHCGames = null;
let hcPlayerMap = null;
let hcProfileManager = null;
let hcTournamentManager = null;
let hcLobbyManager = null;
let supabaseRef = null;

function init(games, players, profileMgr, supabase, tournamentMgr, lobbyMgr) {
  activeHCGames = games;
  hcPlayerMap = players;
  hcProfileManager = profileMgr;
  supabaseRef = supabase;
  hcTournamentManager = tournamentMgr;
  hcLobbyManager = lobbyMgr;
}

/* ── Button Builders ── */

function getAcceptDeclineButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_a_${channelId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hc_d_${channelId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
  );
}

function getTossButtons(channelId, isBotGame) {
  if (isBotGame) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`hc_th_${channelId}`).setLabel('👑 Heads').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`hc_tt_${channelId}`).setLabel('🦅 Tails').setStyle(ButtonStyle.Secondary),
    );
  }
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_to_${channelId}`).setLabel('🔴 Odd').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hc_te_${channelId}`).setLabel('🔵 Even').setStyle(ButtonStyle.Secondary),
  );
}

function getBatBowlButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_cb_${channelId}`).setLabel('🏏 Bat').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hc_cl_${channelId}`).setLabel('🎯 Bowl').setStyle(ButtonStyle.Danger),
  );
}

function getNumberButtons(channelId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_n1_${channelId}`).setLabel('1️⃣').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hc_n2_${channelId}`).setLabel('2️⃣').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hc_n3_${channelId}`).setLabel('3️⃣').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_n4_${channelId}`).setLabel('4️⃣').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hc_n5_${channelId}`).setLabel('5️⃣').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hc_n6_${channelId}`).setLabel('6️⃣').setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function getCatchActionButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_cd_${channelId}`).setLabel('🤿 Dive for Catch!').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`hc_cs_${channelId}`).setLabel('🧤 Safe Catch').setStyle(ButtonStyle.Primary),
  );
}

function getRematchButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_rm_${channelId}`).setLabel('🔄 Rematch!').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hc_qt_${channelId}`).setLabel('🚪 Leave').setStyle(ButtonStyle.Secondary),
  );
}

function getInningsReadyButton(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_ir_${channelId}`).setLabel('▶️ Ready — Start 2nd Innings!').setStyle(ButtonStyle.Success),
  );
}

function getSuperOverButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_so_${channelId}`).setLabel('🏟️ Super Over!').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`hc_qt_${channelId}`).setLabel('🚪 Leave').setStyle(ButtonStyle.Secondary),
  );
}

function getScoreQuitButtons(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hc_sc_${channelId}`).setLabel('📊 Score').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`hc_qt_${channelId}`).setLabel('🚪 Quit').setStyle(ButtonStyle.Danger),
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('handcricket')
    .setDescription('🏏 Indian childhood classic — Hand Cricket!')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('🎮 Play against the Bot!')
        .addIntegerOption(opt =>
          opt.setName('overs')
            .setDescription('Number of overs (1-10, default: 1)')
            .setMinValue(1).setMaxValue(10).setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('wickets')
            .setDescription('Number of wickets (1-10, default: 2)')
            .setMinValue(1).setMaxValue(10).setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('powerplay')
            .setDescription('Enable Powerplay mode? (bonus runs first over)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('challenge')
        .setDescription('⚔️ Challenge a friend to Hand Cricket!')
        .addUserOption(opt =>
          opt.setName('opponent')
            .setDescription('Who do you want to challenge?')
            .setRequired(true))
        .addIntegerOption(opt =>
          opt.setName('overs')
            .setDescription('Number of overs (1-10, default: 1)')
            .setMinValue(1).setMaxValue(10).setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('wickets')
            .setDescription('Number of wickets (1-10, default: 2)')
            .setMinValue(1).setMaxValue(10).setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('powerplay')
            .setDescription('Enable Powerplay mode?')
            .setRequired(false))
        .addBooleanOption(opt =>
          opt.setName('ranked')
            .setDescription('Ranked match? (affects MMR)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('accept')
      .setDescription('✅ Accept a Hand Cricket challenge'))
    .addSubcommand(sub =>
      sub.setName('decline')
      .setDescription('❌ Decline a Hand Cricket challenge'))
    .addSubcommand(sub =>
      sub.setName('toss')
        .setDescription('🪙 Choose odd or even for the toss (multiplayer)')
        .addStringOption(opt =>
          opt.setName('choice')
            .setDescription('Odd or Even?')
            .setRequired(true)
            .addChoices(
              { name: '🔴 Odd', value: 'odd' },
              { name: '🔵 Even', value: 'even' },
            )))
    .addSubcommand(sub =>
      sub.setName('score')
        .setDescription('📊 Check the current match score'))
    .addSubcommand(sub =>
      sub.setName('quit')
        .setDescription('🚪 Quit your current game'))
    .addSubcommand(sub =>
      sub.setName('profile')
        .setDescription('🏏 View Hand Cricket stats')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Whose profile? (defaults to you)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('leaderboard')
        .setDescription('🏆 Top Hand Cricket players!')
        .addStringOption(opt =>
          opt.setName('sort')
            .setDescription('Sort by what?')
            .setRequired(false)
            .addChoices(
              { name: '🏆 Wins', value: 'wins' },
              { name: '🏏 Runs', value: 'runs' },
              { name: '📊 Win Rate', value: 'winrate' },
              { name: '🧤 Catches', value: 'catches' },
              { name: '📈 MMR', value: 'mmr' },
              { name: '🎯 Wickets', value: 'wickets' },
              { name: '💥 Highest Score', value: 'highest' },
            )))
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('📜 View match history')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Whose history? (defaults to you)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('sledge')
        .setDescription('🔥 Roast your friend!')
        .addUserOption(opt =>
          opt.setName('target')
            .setDescription('Who do you want to sledge?')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('tournament')
        .setDescription('🏟️ Tournament commands')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Tournament action')
            .setRequired(true)
            .addChoices(
              { name: '📝 Create', value: 'create' },
              { name: '✅ Join', value: 'join' },
              { name: '🚀 Start', value: 'start' },
              { name: '📋 List', value: 'list' },
              { name: '🗑️ Delete', value: 'delete' },
            ))
        .addStringOption(opt =>
          opt.setName('name')
            .setDescription('Tournament name')
            .setRequired(false))
        .addIntegerOption(opt =>
          opt.setName('max_players')
            .setDescription('Max players for create (4-16)')
            .setMinValue(4).setMaxValue(16).setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('lobby')
        .setDescription('🔒 Private lobby commands')
        .addStringOption(opt =>
          opt.setName('action')
            .setDescription('Lobby action')
            .setRequired(true)
            .addChoices(
              { name: '📝 Create', value: 'create' },
              { name: '✅ Join', value: 'join' },
              { name: '🚪 Leave', value: 'leave' },
            ))
        .addStringOption(opt =>
          opt.setName('code')
            .setDescription('Lobby code (for join)')
            .setRequired(false))
        .addStringOption(opt =>
          opt.setName('password')
            .setDescription('Password (for create/join)')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('howtoplay')
        .setDescription('📖 Complete guide to Hand Cricket'))
    .addSubcommand(sub =>
      sub.setName('help')
        .setDescription('❓ Quick help for Hand Cricket')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const channelId = interaction.channel.id;

    /* ── /handcricket help ── */
    if (subcommand === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('🏏 Hand Cricket — Commands')
        .setDescription('Indian childhood classic — now with **interactive buttons**! Fast, fun, and cinematic!')
        .addFields(
          { name: '🎮 Game Modes', value: '`/handcricket play` — Play vs Bot\n`/handcricket challenge @user` — Challenge a friend\nButtons: Accept/Decline, Toss, Bat/Bowl', inline: false },
          { name: '🏏 Playing', value: 'Click number buttons (1-6) **below**!\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n🧤 Catch combos trigger interactive catch buttons!\n✅ Different = Batsman scores that many runs', inline: false },
          { name: '⚡ Special Modes', value: '**Powerplay** — Bonus runs first over!\n**Ranked** — MMR-based rating!\n**Super Over** — Tiebreaker!', inline: false },
          { name: '📊 Stats & Fun', value: '`/handcricket profile [user]` — Your stats\n`/handcricket score` — Current match score\n`/handcricket leaderboard [sort]` — Top players\n`/handcricket history [user]` — Match history\n`/handcricket sledge @user` — Roast your friend 🔥', inline: false },
          { name: '🏟️ Tournaments', value: '`/handcricket tournament create` — Create tournament\n`/handcricket tournament join` — Join tournament\n`/handcricket tournament start` — Start tournament', inline: false },
          { name: '🔒 Lobbies', value: '`/handcricket lobby create [password]` — Create private lobby\n`/handcricket lobby join <code> [password]` — Join lobby', inline: false },
          { name: '💰 Economy', value: `Play: +₹${ECONOMY.PLAY_REWARD} | Win: +₹${ECONOMY.WIN_BONUS}\nFOUR: +₹${ECONOMY.FOUR_BONUS} | SIX: +₹${ECONOMY.SIX_BONUS}\nCatch: +₹${ECONOMY.CATCH_BONUS} | 50 runs: +₹${ECONOMY.MILESTONE_50_BONUS}\nCentury: +₹${ECONOMY.MILESTONE_100_BONUS}`, inline: false },
        )
        .setFooter({ text: '🏏 King Kohli Mode | Interactive Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [helpEmbed] });
    }

    /* ── /handcricket howtoplay ── */
    if (subcommand === 'howtoplay') {
      const guideEmbed = new EmbedBuilder()
        .setColor(COLORS.SECONDARY)
        .setTitle('🏏 Hand Cricket — Complete Guide')
        .setDescription('The Indian childhood classic you love — now with **interactive buttons**, catch system, milestones, and cinematic gameplay!')
        .addFields(
          { name: '🎮 Starting', value: '`/handcricket play [overs] [wickets]` — Play vs Bot\n`/handcricket challenge @user` — Challenge a friend\nUse buttons to Accept/Decline!', inline: false },
          { name: '🪙 Toss', value: 'Bot game: Click **Heads** or **Tails** button\nMultiplayer: Click **Odd** or **Even** button, then choose 1-6 below!\nWinner clicks **Bat** or **Bowl** button', inline: false },
          { name: '🏏 Playing', value: 'Click number buttons (1-6) right here in the channel!\n🏏 Both players choose secretly within 30s\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs\n\n⏱️ You have 30 seconds per ball!', inline: false },
          { name: '🧤 Catch System', value: 'Certain combos trigger **Catch Chance**!\nBowler gets buttons: **Dive** (50% success) or **Safe** (70% success)\nSuccessful catch = Batter OUT!\nDropped catch = Batter survives + scores runs!', inline: false },
          { name: '🏆 Milestones & GIFs', value: '50 runs = **HALF CENTURY!** Kohli GIF!\n100 runs = **CENTURY!** Special GIF!\nFours, Sixes, Wickets, Catches — all have GIFs!\nMatch-winning moments = Cinematic celebrations!', inline: false },
          { name: '⚡ Special Modes', value: '**Powerplay** — +2 bonus runs on every scoring ball in first over!\n**Ranked** — MMR rating (start: 1000, win: +25, lose: -20)\n**Super Over** — 1 over, 2 wickets tiebreaker!', inline: false },
          { name: '🏆 Winning', value: '2 innings each — highest score wins!\nIn 2nd innings, chaser passes target = instant win!\nTie = Super Over option!\nEqual in Super Over = Coin flip!', inline: false },
          { name: '📊 Other Commands', value: '`/handcricket profile` — Stats & MMR rank\n`/handcricket leaderboard` — Global rankings\n`/handcricket history` — Match history\n`/handcricket sledge @user` — Roast! 🔥\n`/handcricket quit` — Quit game', inline: false },
        )
        .setFooter({ text: '🏏 Hitman Mode | Interactive Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [guideEmbed] });
    }

    /* ── /handcricket play ── */
    if (subcommand === 'play') {
      if (hcPlayerMap.has(userId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 You are already in a game! Use `/handcricket quit` first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (activeHCGames.has(channelId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 There\'s already a game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const overs = interaction.options.getInteger('overs') || 1;
      const wickets = interaction.options.getInteger('wickets') || 2;
      const powerplay = interaction.options.getBoolean('powerplay') || false;

      const botId = 'BOT_' + userId;
      const game = new HandCricketGame(userId, botId, channelId, interaction.guild.id, { isBot: true, overs, wickets, powerplay });
      game.channel = interaction.channel;
      game.accept();
      activeHCGames.set(channelId, game);
      hcPlayerMap.set(userId, channelId);

      const botProfile = game.botProfile;

      const playEmbed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle('🏏 Single Player — vs Bot!')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🏏 **You** vs **${botProfile.name}**\n` +
          `┣ 🧠 **Bot Style:** ${botProfile.style === 'aggressive' ? '🔥 Aggressive' : botProfile.style === 'defensive' ? '🛡️ Defensive' : '⚖️ Balanced'}\n` +
          `┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n` +
          `┣ 🧤 **Catch System:** Active!\n` +
          `${powerplay ? '┣ ⚡ **Powerplay:** Active!\n' : ''}` +
          `┣ 🪙 **Toss Time!**\n` +
          `┗ 👇 Click **Heads** or **Tails**!`
        )
        .setFooter({ text: '🏏 King Kohli Mode | Interactive Hand Cricket | ⏱️ 30s per ball' })
        .setTimestamp();
      return interaction.reply({ embeds: [playEmbed], components: [getTossButtons(channelId, true)] });
    }

    /* ── /handcricket challenge ── */
    if (subcommand === 'challenge') {
      const target = interaction.options.getUser('opponent');
      if (!target) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🏏 Mention someone to challenge!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (target.id === userId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🤦 You can\'t challenge yourself!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (target.bot) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🤖 Use `/handcricket play` for bot matches.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (hcPlayerMap.has(userId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 You are already in a game! Quit first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (hcPlayerMap.has(target.id)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(`🚫 **${target.username}** is already in a game!`).setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (activeHCGames.has(channelId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 There\'s already a game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const overs = interaction.options.getInteger('overs') || 1;
      const wickets = interaction.options.getInteger('wickets') || 2;
      const powerplay = interaction.options.getBoolean('powerplay') || false;
      const ranked = interaction.options.getBoolean('ranked') || false;

      const game = new HandCricketGame(userId, target.id, channelId, interaction.guild.id, { overs, wickets, powerplay, ranked });
      game.channel = interaction.channel;
      activeHCGames.set(channelId, game);
      hcPlayerMap.set(userId, channelId);
      hcPlayerMap.set(target.id, channelId);

      const challengeEmbed = new EmbedBuilder()
        .setColor(COLORS.GOLD)
        .setTitle('🏏 Hand Cricket Challenge!')
        .setDescription(
          `**${interaction.user.username}** challenged **${target.username}**!\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n` +
          `┣ 🧤 **Catch System:** Active!\n` +
          `${powerplay ? '┣ ⚡ **Powerplay:** Active!\n' : ''}` +
          `${ranked ? '┣ 🏆 **Ranked Match!** MMR on the line!\n' : ''}` +
          `┣ 👇 **${target.username}**: Accept or Decline!\n` +
          `┗ ⏰ Waiting for response...`
        )
        .setFooter({ text: '🏏 Hitman Mode | Interactive Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [challengeEmbed], components: [getAcceptDeclineButtons(channelId)] });
    }

    /* ── /handcricket accept ── */
    if (subcommand === 'accept') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 No pending challenge to accept!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (userId !== game.player2Id) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 Only the challenged player can accept!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      game.accept();

      const acceptEmbed = new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle('🏏 Challenge Accepted!')
        .setDescription(
          `Game ON! 🎉\n\n━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🪙 **Toss Time!**\n` +
          `┣ 👇 Both players: Click **Odd** or **Even**!\n` +
          `┗ Then choose your number (1-6) below!`
        )
        .setFooter({ text: '🏏 Captain Cool Mode | Interactive Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [acceptEmbed], components: [getTossButtons(channelId, false)] });
    }

    /* ── /handcricket decline ── */
    if (subcommand === 'decline') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 No pending challenge!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (userId !== game.player2Id) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 Only the challenged player can decline!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      game.decline();
      activeHCGames.delete(channelId);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setTitle('🏏 Challenge Declined!').setDescription(`**${interaction.user.username}** declined.`).setTimestamp()] });
    }

    /* ── /handcricket toss ── */
    if (subcommand === 'toss') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.TOSS) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 No active toss!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      const choice = interaction.options.getString('choice');

      const result = game.setTossChoice(userId, choice);

      if (result.message === 'waiting') {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.ACCENT).setTitle('🪙 Toss Choice Recorded!').setDescription(`You chose **${choice}**!\n\nWaiting for the other player...`).setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      if (result.message === 'both_chosen') {
        const p1Name = interaction.client.users.cache.get(game.players[0])?.username;
        const p2Name = interaction.client.users.cache.get(game.players[1])?.username;

        const tossReadyEmbed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('🪙 Toss — Both Chosen!')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ **${p1Name}**: ${result.p1Choice === 'odd' ? '🔴 Odd' : '🔵 Even'}\n` +
            `┣ **${p2Name}**: ${result.p2Choice === 'odd' ? '🔴 Odd' : '🔵 Even'}\n` +
            `┗ 👇 **Click a number (1-6) below!**`
          )
          .setFooter({ text: '🏏 Captain Cool Mode | Interactive Hand Cricket' })
          .setTimestamp();
        await interaction.reply({ embeds: [tossReadyEmbed], components: getNumberButtons(channelId) });
        return;
      }

      if (!result.success) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });
      }
    }

    /* ── /handcricket score ── */
    if (subcommand === 'score') {
      const game = activeHCGames.get(channelId);
      if (!game) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 No game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const playerNames = {};
      for (const pid of game.players) {
        playerNames[pid] = interaction.client.users.cache.get(pid)?.username || (pid.startsWith('BOT_') ? game.botProfile?.name || '🤖 Bot' : 'Player');
      }

      const sc = game.getFormattedScorecard(playerNames);
      const timeLeft = game.getTimeRemaining();
      const remaining = game.getRemainingBalls();

      let desc = `━━━━━━━━━━━━━━━━━━━\n`;
      desc += `┣ 🏏 **${sc.p1Name}**: ${sc.p1Score}\n`;
      desc += `┣ 🏏 **${sc.p2Name}**: ${sc.p2Score}\n`;

      if (game.phase === HC_PHASE.PLAYING || game.phase === HC_PHASE.INNINGS_BREAK) {
        const batName = playerNames[game.battingNow];
        const bowlName = playerNames[game.bowlingNow];
        desc += `┣ 🏏 **Batting:** ${batName}\n`;
        desc += `┣ 🎯 **Bowling:** ${bowlName}\n`;
        desc += `┣ 📏 **Innings:** ${sc.innings}/2\n`;
        if (sc.target) desc += `┣ 🎯 **Target:** ${sc.target} | **Need:** ${sc.need}\n`;
        if (remaining) desc += `┣ ⏱️ **Balls Left:** ${remaining.ballsLeft}\n`;
        if (timeLeft) desc += `┣ ⏱️ **Turn Timer:** ${timeLeft}s left\n`;
        if (game.isPowerplayActive) desc += `┣ ⚡ **POWERPLAY ACTIVE!**\n`;
        if (game.isRanked) desc += `┣ 🏆 **RANKED MATCH**\n`;
        if (game.isSuperOver) desc += `┣ 🏟️ **SUPER OVER #${game.superOverCount}**\n`;
        desc += `┣ 🧤 **Catches:** ${game.catchesTaken}/${game.catchChances} (${game.catchesDropped} dropped)\n`;
      }

      const phaseNames = { waiting: 'Waiting', toss: 'Toss', toss_choice: 'Toss Choice', playing: 'Playing', innings_break: 'Innings Break', ended: 'Ended', catch_action: 'Catch Action', super_over_toss: 'Super Over Toss' };
      desc += `┗ 📋 **Phase:** ${phaseNames[game.phase] || game.phase}`;

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.ACCENT).setTitle('🏏 Scoreboard').setDescription(desc).setFooter({ text: '🏏 King Kohli Mode | Interactive Hand Cricket' }).setTimestamp()] });
    }

    /* ── /handcricket quit ── */
    if (subcommand === 'quit') {
      const hcChannelId = hcPlayerMap.get(userId);
      if (!hcChannelId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 You are not in any game!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      const game = activeHCGames.get(hcChannelId);
      if (!game) {
        hcPlayerMap.delete(userId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🚫 No game found!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const result = game.quit(userId);
      const winnerName = result.winner ? interaction.client.users.cache.get(result.winner)?.username : null;
      activeHCGames.delete(hcChannelId);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setTitle('🏏 Game Quit!').setDescription(`**${interaction.user.username}** quit! ${winnerName ? `**${winnerName}** wins!` : ''}`).setTimestamp()] });
    }

    /* ── /handcricket profile ── */
    if (subcommand === 'profile') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const profile = await hcProfileManager.getOrCreateProfile(targetUser.id, targetUser.username);
      if (!profile) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Profile not available (database issue).').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const winRate = profile.games_played > 0 ? ((profile.games_won / profile.games_played) * 100).toFixed(1) : '0.0';
      const avgRuns = profile.games_played > 0 ? (profile.total_runs / profile.games_played).toFixed(1) : '0.0';
      const strikeRate = profile.total_balls > 0 ? ((profile.total_runs / profile.total_balls) * 100).toFixed(1) : '0.0';
      const mmrTier = ProfileManager.getMMRTier ? ProfileManager.getMMRTier(profile.mmr || 1000) : '🥈 Silver';

      let rank, rankEmoji;
      if (profile.games_won >= 50) { rank = 'Legend'; rankEmoji = '👑'; }
      else if (profile.games_won >= 30) { rank = 'Master'; rankEmoji = '💎'; }
      else if (profile.games_won >= 15) { rank = 'Expert'; rankEmoji = '🏆'; }
      else if (profile.games_won >= 5) { rank = 'Pro'; rankEmoji = '⭐'; }
      else if (profile.games_played >= 3) { rank = 'Rookie'; rankEmoji = '🌟'; }
      else { rank = 'Beginner'; rankEmoji = '🎯'; }

      // Pick a random cricket legend for the profile comparison
      const legend = CRICKET_LEGENDS[Math.floor(Math.random() * CRICKET_LEGENDS.length)];

      const profileEmbed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setAuthor({ name: `${targetUser.username}'s Profile`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
        .setTitle(`${rankEmoji} ${rank} — Hand Cricket Stats`)
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🎮 **Games:** ${profile.games_played}\n` +
          `┣ 🏆 **Wins:** ${profile.games_won}\n` +
          `┣ 📊 **Win Rate:** ${winRate}%\n` +
          `┣ 🔥 **Win Streak:** ${profile.win_streak || 0} (Best: ${profile.best_win_streak || 0})\n` +
          `┣ 🏏 **Total Runs:** ${profile.total_runs}\n` +
          `┣ 📈 **Avg Runs:** ${avgRuns}\n` +
          `┣ 💥 **Highest Score:** ${profile.highest_score}\n` +
          `┣ 🔥 **Strike Rate:** ${strikeRate}\n` +
          `┣ 🎯 **Total Wickets:** ${profile.total_wickets}\n` +
          `┣ 🧤 **Catches:** ${profile.total_catches || 0}\n` +
          `┣ 4️⃣ **Fours:** ${profile.total_fours}\n` +
          `┣ 6️⃣ **Sixes:** ${profile.total_sixes}\n` +
          `┣ 📈 **MMR:** ${profile.mmr || 1000}\n` +
          `┣ 🏅 **MMR Tier:** ${mmrTier}\n` +
          `┗ ${legend.emoji} **Legend Style:** ${legend.name} — ${legend.style}`
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `🏏 ${legend.name} Mode | Interactive Hand Cricket` })
        .setTimestamp();
      return interaction.reply({ embeds: [profileEmbed] });
    }

    /* ── /handcricket leaderboard ── */
    if (subcommand === 'leaderboard') {
      const sortBy = interaction.options.getString('sort') || 'wins';

      let leaderboard;
      if (sortBy === 'runs') {
        leaderboard = await hcProfileManager.getLeaderboardByRuns(10);
      } else if (sortBy === 'winrate') {
        leaderboard = await hcProfileManager.getLeaderboardByWinRate(10);
      } else if (sortBy === 'mmr') {
        leaderboard = await hcProfileManager.getLeaderboardByMMR(10);
      } else if (sortBy === 'wickets') {
        leaderboard = await hcProfileManager.getLeaderboardByWickets(10);
      } else if (sortBy === 'highest') {
        leaderboard = await hcProfileManager.getLeaderboardByHighestScore(10);
      } else if (sortBy === 'catches') {
        leaderboard = await hcProfileManager.getLeaderboard(10);
      } else {
        leaderboard = await hcProfileManager.getLeaderboard(10);
      }

      if (!leaderboard || leaderboard.length === 0) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ No players found! Play some games first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const medals = ['🥇', '🥈', '🥉'];
      let desc = '';
      for (let i = 0; i < leaderboard.length; i++) {
        const p = leaderboard[i];
        const medal = i < 3 ? medals[i] : `**${i + 1}.**`;
        const winRate = p.games_played > 0 ? ((p.games_won / p.games_played) * 100).toFixed(0) : '0';

        if (sortBy === 'runs') {
          desc += `${medal} **${p.username}** — ${p.total_runs} runs (${winRate}% WR)\n`;
        } else if (sortBy === 'winrate') {
          desc += `${medal} **${p.username}** — ${winRate}% WR (${p.games_won}W / ${p.games_played}G)\n`;
        } else if (sortBy === 'mmr') {
          const tier = ProfileManager.getMMRTier ? ProfileManager.getMMRTier(p.mmr || 1000) : '';
          desc += `${medal} **${p.username}** — ${p.mmr || 1000} MMR ${tier}\n`;
        } else if (sortBy === 'wickets') {
          desc += `${medal} **${p.username}** — ${p.total_wickets} wickets\n`;
        } else if (sortBy === 'highest') {
          desc += `${medal} **${p.username}** — ${p.highest_score} highest score\n`;
        } else if (sortBy === 'catches') {
          desc += `${medal} **${p.username}** — ${p.total_catches || 0} catches\n`;
        } else {
          desc += `${medal} **${p.username}** — ${p.games_won} wins (${winRate}% WR)\n`;
        }
      }

      const sortLabels = {
        runs: '🏏 Most Runs', winrate: '📊 Best Win Rate', mmr: '📈 MMR Rankings',
        wickets: '🎯 Most Wickets', highest: '💥 Highest Scores', catches: '🧤 Most Catches',
        wins: '🏆 Most Wins',
      };
      const sortLabel = sortLabels[sortBy] || '🏆 Most Wins';

      const lbEmbed = new EmbedBuilder()
        .setColor(COLORS.GOLD)
        .setTitle(`🏏 Leaderboard — ${sortLabel}`)
        .setDescription(desc)
        .setFooter({ text: '🏏 Hitman Mode | Interactive Hand Cricket | Min 3 games for WR' })
        .setTimestamp();
      return interaction.reply({ embeds: [lbEmbed] });
    }

    /* ── /handcricket history ── */
    if (subcommand === 'history') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const history = await hcProfileManager.getMatchHistory(targetUser.id, 5);
      if (!history || history.length === 0) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(`❌ No match history for **${targetUser.username}**!`).setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      let desc = '';
      for (let i = 0; i < history.length; i++) {
        const match = history[i];
        const date = match.start_time ? new Date(match.start_time).toLocaleDateString() : 'Unknown';
        const isWinner = match.winner === targetUser.id;
        desc += `${isWinner ? '🏆' : '❌'} **Match ${i + 1}** — ${date}\n`;
        desc += `┣ 📏 ${match.overs} overs, ${match.wickets} wickets\n`;
        if (match.catch_chances > 0) {
          desc += `┣ 🧤 Catches: ${match.catches_taken}/${match.catch_chances}\n`;
        }
        desc += `┗ ${isWinner ? '**Won!**' : match.winner ? 'Lost' : 'Tied'}\n\n`;
      }

      const histEmbed = new EmbedBuilder()
        .setColor(COLORS.ACCENT)
        .setTitle(`🏏 Match History — ${targetUser.username}`)
        .setDescription(desc)
        .setFooter({ text: '🏏 Last 5 matches' })
        .setTimestamp();
      return interaction.reply({ embeds: [histEmbed] });
    }

    /* ── /handcricket tournament ── */
    if (subcommand === 'tournament') {
      const action = interaction.options.getString('action');
      const name = interaction.options.getString('name');

      if (action === 'create') {
        const tName = name || `tournament_${Date.now()}`;
        const maxPlayers = interaction.options.getInteger('max_players') || 8;
        const result = hcTournamentManager.create(tName, userId, channelId, interaction.guild.id, { maxPlayers });
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });

        const tEmbed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('🏟️ Tournament Created!')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 📛 **Name:** ${tName}\n` +
            `┣ 👥 **Players:** 1/${result.tournament.maxPlayers}\n` +
            `┣ 🏏 **Host:** ${interaction.user.username}\n` +
            `┣ 📝 Join: \`/handcricket tournament action:join name:${tName}\`\n` +
            `┗ 🚀 Start: \`/handcricket tournament action:start name:${tName}\``
          )
          .setFooter({ text: '🏏 Tournament' })
          .setTimestamp();
        return interaction.reply({ embeds: [tEmbed] });
      }

      if (action === 'join') {
        if (!name) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Provide tournament name!').setTimestamp()], flags: MessageFlags.Ephemeral });
        const result = hcTournamentManager.join(name, userId);
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle('✅ Joined!').setDescription(`**${interaction.user.username}** joined! (${result.playerCount}/${result.maxPlayers})`).setTimestamp()] });
      }

      if (action === 'start') {
        if (!name) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Provide tournament name!').setTimestamp()], flags: MessageFlags.Ephemeral });
        const result = hcTournamentManager.start(name);
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });

        let matchesDesc = '';
        for (let i = 0; i < result.firstRoundMatches.length; i++) {
          const m = result.firstRoundMatches[i];
          const p1 = interaction.client.users.cache.get(m.player1)?.username || `<@${m.player1}>`;
          const p2 = m.player2 ? (interaction.client.users.cache.get(m.player2)?.username || `<@${m.player2}>`) : 'BYE';
          matchesDesc += `**Match ${i + 1}:** ${p1} vs ${p2}\n`;
        }

        const tEmbed = new EmbedBuilder()
          .setColor(COLORS.GOLD)
          .setTitle('🏟️ Tournament Started!')
          .setDescription(`**${result.tournament.name}** — ${result.tournament.players.length} players, ${result.numRounds} rounds!\n\n**Round 1:**\n${matchesDesc}`)
          .setFooter({ text: '🏏 Tournament' })
          .setTimestamp();
        return interaction.reply({ embeds: [tEmbed] });
      }

      if (action === 'delete') {
        if (!name) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Provide tournament name!').setTimestamp()], flags: MessageFlags.Ephemeral });
        const result = hcTournamentManager.delete(name, userId);
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setTitle('🗑️ Tournament Deleted!').setTimestamp()] });
      }

      if (action === 'list') {
        const list = hcTournamentManager.list();
        if (list.length === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ No tournaments!').setTimestamp()], flags: MessageFlags.Ephemeral });

        let desc = '';
        for (const t of list) {
          const statusEmoji = t.status === 'registration' ? '📝' : t.status === 'in_progress' ? '🏏' : '🏆';
          desc += `${statusEmoji} **${t.name}** — ${t.players}/${t.maxPlayers} (${t.status})\n`;
        }

        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.ACCENT).setTitle('🏟️ Tournaments').setDescription(desc).setTimestamp()] });
      }
    }

    /* ── /handcricket lobby ── */
    if (subcommand === 'lobby') {
      const action = interaction.options.getString('action');

      if (action === 'create') {
        const password = interaction.options.getString('password');
        const result = hcLobbyManager.create(userId, channelId, interaction.guild.id, password);
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Failed!').setTimestamp()], flags: MessageFlags.Ephemeral });

        const lEmbed = new EmbedBuilder()
          .setColor(COLORS.SUCCESS)
          .setTitle('🔒 Private Lobby Created!')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━\n` +
            `┣ 🏷️ **Code:** \`${result.code}\`\n` +
            `┣ 🔑 **Password:** ${password ? `\`${password}\`` : 'None'}\n` +
            `┣ 👥 **Players:** 1/2\n` +
            `┗ 📝 Share the code with your friend!`
          )
          .setFooter({ text: '🏏 Private Lobby' })
          .setTimestamp();
        return interaction.reply({ embeds: [lEmbed] });
      }

      if (action === 'join') {
        const code = interaction.options.getString('code')?.toUpperCase();
        const password = interaction.options.getString('password');
        if (!code) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Provide lobby code!').setTimestamp()], flags: MessageFlags.Ephemeral });

        const result = hcLobbyManager.join(code, userId, password);
        if (!result.success) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });

        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle('✅ Joined Lobby!').setDescription(`Ready! (${result.lobby.players.length}/${result.lobby.maxPlayers})`).setTimestamp()] });
      }

      if (action === 'leave') {
        const existing = hcLobbyManager.getByPlayer(userId);
        if (!existing) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('❌ Not in any lobby!').setTimestamp()], flags: MessageFlags.Ephemeral });
        hcLobbyManager.leave(existing.code, userId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.SUCCESS).setDescription('✅ Left the lobby!').setTimestamp()] });
      }
    }

    /* ── /handcricket sledge ── */
    if (subcommand === 'sledge') {
      const target = interaction.options.getUser('target');
      if (!target) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🏏 Mention someone!').setTimestamp()], flags: MessageFlags.Ephemeral });
      if (target.id === userId) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.DANGER).setDescription('🤦 Can\'t sledge yourself!').setTimestamp()], flags: MessageFlags.Ephemeral });

      const sledge = SLEDGE_MESSAGES[Math.floor(Math.random() * SLEDGE_MESSAGES.length)]
        .replace(/{user}/g, interaction.user.username)
        .replace(/{target}/g, target.username);

      const sledgeEmbed = new EmbedBuilder()
        .setColor(COLORS.DANGER)
        .setTitle('🔥 SLEDGE!')
        .setDescription(sledge)
        .setFooter({ text: '🏏 Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [sledgeEmbed] });
    }
  },
};

module.exports.init = init;

// Export button builders for use in index.js
module.exports.getAcceptDeclineButtons = getAcceptDeclineButtons;
module.exports.getTossButtons = getTossButtons;
module.exports.getBatBowlButtons = getBatBowlButtons;
module.exports.getNumberButtons = getNumberButtons;
module.exports.getCatchActionButtons = getCatchActionButtons;
module.exports.getRematchButtons = getRematchButtons;
module.exports.getInningsReadyButton = getInningsReadyButton;
module.exports.getSuperOverButtons = getSuperOverButtons;
module.exports.getScoreQuitButtons = getScoreQuitButtons;
