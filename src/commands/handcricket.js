const { SlashCommandBuilder, MessageFlags, EmbedBuilder, userMention } = require('discord.js');
const { HandCricketGame, GAME_PHASE: HC_PHASE, EMOJI_NUMBERS, SLEDGE_MESSAGES, BOT_PROFILES, ECONOMY, MATCH_TURN_TIMEOUT, grantEconomyRewards } = require('../handcricket');

// These will be set by index.js on startup
let activeHCGames = null;
let hcPlayerMap = null;
let hcProfileManager = null;
let supabaseRef = null;

function init(games, players, profileMgr, supabase) {
  activeHCGames = games;
  hcPlayerMap = players;
  hcProfileManager = profileMgr;
  supabaseRef = supabase;
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
            .setMinValue(1).setMaxValue(10).setRequired(false)))
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
            .setMinValue(1).setMaxValue(10).setRequired(false)))
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
            )))
    .addSubcommand(sub =>
      sub.setName('sledge')
        .setDescription('🔥 Roast your friend!')
        .addUserOption(opt =>
          opt.setName('target')
            .setDescription('Who do you want to sledge?')
            .setRequired(true)))
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
        .setColor(0x2ECC71)
        .setTitle('🏏 Hand Cricket — Commands')
        .setDescription('Indian childhood classic — now on Discord! Fast, fun, and beginner friendly!')
        .addFields(
          { name: '🎮 Game Modes', value: '`/handcricket play [overs] [wickets]` — Play vs Bot\n`/handcricket challenge @user [overs] [wickets]` — Challenge a friend\n`/handcricket accept` — Accept challenge\n`/handcricket decline` — Decline challenge', inline: false },
          { name: '🪙 Toss', value: '`/handcricket toss odd/even` — Multiplayer toss\nDM `heads` or `tails` — Single player toss\nThen DM the bot a number (1-6)', inline: false },
          { name: '🏏 Playing', value: 'DM the bot a number (1-6) each ball\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs', inline: false },
          { name: '📊 Stats & Fun', value: '`/handcricket profile [user]` — Your stats\n`/handcricket score` — Current match score\n`/handcricket leaderboard [sort]` — Top players\n`/handcricket sledge @user` — Roast your friend 🔥', inline: false },
          { name: '📖 Other', value: '`/handcricket howtoplay` — Detailed guide\n`/handcricket quit` — Quit current game\n\n⏱️ **Match Timer:** You have ' + MATCH_TURN_TIMEOUT + 's to play each ball!', inline: false },
          { name: '💰 Economy', value: `Play a game: +₹${ECONOMY.PLAY_REWARD}\nWin a game: +₹${ECONOMY.WIN_BONUS}\nHit a FOUR: +₹${ECONOMY.FOUR_BONUS}\nHit a SIX: +₹${ECONOMY.SIX_BONUS}\nCentury (36+ runs): +₹${ECONOMY.CENTURY_BONUS}`, inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket | Also works with hc. prefix!' })
        .setTimestamp();
      return interaction.reply({ embeds: [helpEmbed] });
    }

    /* ── /handcricket howtoplay ── */
    if (subcommand === 'howtoplay') {
      const guideEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🏏 Hand Cricket — Complete Guide')
        .setDescription('The Indian childhood classic you love — now on Discord! Fast, interactive, and beginner friendly!')
        .addFields(
          { name: '🎮 Game Modes', value: '`/handcricket play [overs] [wickets]` — Play vs Bot (default: 1 over, 2 wickets)\n`/handcricket challenge @user` — Challenge a friend\n`/handcricket accept` / `/handcricket decline` — Respond to challenge', inline: false },
          { name: '🪙 Toss (Single Player)', value: 'DM the bot `heads` or `tails`\nCoin flip decides who wins the toss\nWinner chooses to bat or bowl', inline: false },
          { name: '🪙 Toss (Multiplayer)', value: '`/handcricket toss odd` or `/handcricket toss even`\nThen DM the bot a number (1-6)\nSum odd/even decides toss winner!\nWinner DMs `bat` or `bowl`', inline: false },
          { name: '🏏 Playing', value: 'DM the bot a number (1-6) each ball\n🏏 Batsman & Bowler both choose secretly\n💀 Same number = OUT!\n✅ Different = Batsman scores that many runs\n\n⏱️ You have ' + MATCH_TURN_TIMEOUT + ' seconds per ball!', inline: false },
          { name: '📏 Scoring', value: '1️⃣ = 1 run  ·  2️⃣ = 2 runs  ·  3️⃣ = 3 runs\n4️⃣ = 4 runs (FOUR!)  ·  5️⃣ = 5 runs  ·  6️⃣ = 6 runs (SIXER!)\nEach innings = overs × 6 balls\nAll wickets down = all out!', inline: false },
          { name: '🏆 Winning', value: '2 innings each — highest score wins!\nIn 2nd innings, if chaser passes target = instant win!\nEqual scores = TIE', inline: false },
          { name: '💰 Economy Rewards', value: `Play a game: +₹${ECONOMY.PLAY_REWARD}\nWin bonus: +₹${ECONOMY.WIN_BONUS}\nHit a FOUR: +₹${ECONOMY.FOUR_BONUS}\nHit a SIX: +₹${ECONOMY.SIX_BONUS}\nCentury (36+ runs): +₹${ECONOMY.CENTURY_BONUS}`, inline: false },
          { name: '📊 Other Commands', value: '`/handcricket profile [user]` — Your stats\n`/handcricket score` — Current match score\n`/handcricket leaderboard` — Top players\n`/handcricket sledge @user` — Roast your friend 🔥\n`/handcricket quit` — Quit current game', inline: false },
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [guideEmbed] });
    }

    /* ── /handcricket play ── */
    if (subcommand === 'play') {
      if (hcPlayerMap.has(userId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are already in a game! Use `/handcricket quit` first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (activeHCGames.has(channelId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 There\'s already a game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const overs = interaction.options.getInteger('overs') || 1;
      const wickets = interaction.options.getInteger('wickets') || 2;

      const botId = 'BOT_' + userId;
      const game = new HandCricketGame(userId, botId, channelId, interaction.guild.id, { isBot: true, overs, wickets });
      game.channel = interaction.channel;
      activeHCGames.set(channelId, game);
      hcPlayerMap.set(userId, channelId);

      const botProfile = game.botProfile;

      const playEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏏 Single Player — vs Bot!')
        .setDescription(
          `━━━━━━━━━━━━━━━━━━━\n` +
          `┣ 🏏 **You** vs **${botProfile.name}**\n` +
          `┣ 🧠 **Bot Style:** ${botProfile.style === 'aggressive' ? '🔥 Aggressive' : botProfile.style === 'defensive' ? '🛡️ Defensive' : '⚖️ Balanced'}\n` +
          `┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n` +
          `┣ 🪙 **Toss Time!**\n` +
          `┗ 📨 DM me **heads** or **tails** for the coin toss!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket | ⏱️ ' + MATCH_TURN_TIMEOUT + 's per ball' })
        .setTimestamp();
      return interaction.reply({ embeds: [playEmbed] });
    }

    /* ── /handcricket challenge ── */
    if (subcommand === 'challenge') {
      const target = interaction.options.getUser('opponent');
      if (!target) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🏏 Mention someone to challenge!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (target.id === userId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤦 You can\'t challenge yourself!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (target.bot) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤖 You can\'t challenge bots! Use `/handcricket play` for bot matches.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (hcPlayerMap.has(userId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are already in a game! Use `/handcricket quit` first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (hcPlayerMap.has(target.id)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(`🚫 **${target.username}** is already in a game!`).setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (activeHCGames.has(channelId)) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 There\'s already a game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const overs = interaction.options.getInteger('overs') || 1;
      const wickets = interaction.options.getInteger('wickets') || 2;

      const game = new HandCricketGame(userId, target.id, channelId, interaction.guild.id, { overs, wickets });
      game.channel = interaction.channel;
      activeHCGames.set(channelId, game);
      hcPlayerMap.set(userId, channelId);
      hcPlayerMap.set(target.id, channelId);

      const challengeEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏏 Hand Cricket Challenge!')
        .setDescription(
          `**${interaction.user.username}** challenged **${target.username}** to Hand Cricket!\n\n━━━━━━━━━━━━━━━━━━━\n┣ 📏 **${overs} over${overs > 1 ? 's' : ''}**, **${wickets} wicket${wickets > 1 ? 's' : ''}**\n┣ ✅ **${target.username}**: Use \`/handcricket accept\`\n┣ ❌ **${target.username}**: Use \`/handcricket decline\`\n┗ ⏰ Waiting for response...`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [challengeEmbed] });
    }

    /* ── /handcricket accept ── */
    if (subcommand === 'accept') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No pending challenge to accept!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (userId !== game.player2Id) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the challenged player can accept!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      game.accept();

      const acceptEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏏 Challenge Accepted!')
        .setDescription(
          `Game ON! 🎉\n\n━━━━━━━━━━━━━━━━━━━\n┣ 🪙 **Toss Time!**\n┣ Both players: use \`/handcricket toss odd\` or \`/handcricket toss even\`\n┣ Then DM me a number (1-6) for the toss\n┗ 🤫 Your number is secret!`
        )
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [acceptEmbed] });
    }

    /* ── /handcricket decline ── */
    if (subcommand === 'decline') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.WAITING) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No pending challenge to decline!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (userId !== game.player2Id) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 Only the challenged player can decline!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      game.decline();
      activeHCGames.delete(channelId);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🏏 Challenge Declined!').setDescription(`**${interaction.user.username}** declined the challenge.`).setTimestamp()] });
    }

    /* ── /handcricket toss ── */
    if (subcommand === 'toss') {
      const game = activeHCGames.get(channelId);
      if (!game || game.phase !== HC_PHASE.TOSS) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No active toss! Use `/handcricket challenge` first.').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      const choice = interaction.options.getString('choice');

      const result = game.setTossChoice(userId, choice);

      if (result.message === 'waiting') {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🪙 Toss Choice Recorded!').setDescription(`You chose **${choice}**!\n\nWaiting for the other player to choose...`).setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      if (result.message === 'both_chosen') {
        const p1Name = interaction.client.users.cache.get(game.players[0])?.username;
        const p2Name = interaction.client.users.cache.get(game.players[1])?.username;

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
        await interaction.reply({ embeds: [tossReadyEmbed] });

        // DM both players
        for (const pid of game.players) {
          try {
            await interaction.client.users.cache.get(pid)?.send({
              embeds: [new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('🪙 Toss Time!')
                .setDescription('Type a number **1-6** to submit your toss number!\n\nYour choice is secret — choose wisely!')
                .setTimestamp()]
            });
          } catch (e) {
            await interaction.channel.send(`⚠️ Could not DM <@${pid}> — tell them to enable DMs!`);
          }
        }
        return;
      }

      if (!result.success) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription(result.message).setTimestamp()], flags: MessageFlags.Ephemeral });
      }
    }

    /* ── /handcricket score ── */
    if (subcommand === 'score') {
      const game = activeHCGames.get(channelId);
      if (!game) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game in this channel!').setTimestamp()], flags: MessageFlags.Ephemeral });
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
      }

      const phaseNames = { waiting: 'Waiting', toss: 'Toss', toss_choice: 'Toss Choice', playing: 'Playing', innings_break: 'Innings Break', ended: 'Ended' };
      desc += `┗ 📋 **Phase:** ${phaseNames[game.phase] || game.phase}`;

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498DB).setTitle('🏏 Scoreboard').setDescription(desc).setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' }).setTimestamp()] });
    }

    /* ── /handcricket quit ── */
    if (subcommand === 'quit') {
      const hcChannelId = hcPlayerMap.get(userId);
      if (!hcChannelId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 You are not in any game!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      const game = activeHCGames.get(hcChannelId);
      if (!game) {
        hcPlayerMap.delete(userId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🚫 No game found!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const result = game.quit(userId);
      const winnerName = result.winner ? interaction.client.users.cache.get(result.winner)?.username : null;
      activeHCGames.delete(hcChannelId);
      hcPlayerMap.delete(game.players[0]);
      hcPlayerMap.delete(game.players[1]);

      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🏏 Game Quit!').setDescription(`**${interaction.user.username}** quit the game! ${winnerName ? `**${winnerName}** wins!` : ''}`).setTimestamp()] });
    }

    /* ── /handcricket profile ── */
    if (subcommand === 'profile') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const profile = await hcProfileManager.getOrCreateProfile(targetUser.id, targetUser.username);
      if (!profile) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ Profile not available (database issue).').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const winRate = profile.games_played > 0 ? ((profile.games_won / profile.games_played) * 100).toFixed(1) : '0.0';
      const avgRuns = profile.games_played > 0 ? (profile.total_runs / profile.games_played).toFixed(1) : '0.0';
      const strikeRate = profile.total_balls > 0 ? ((profile.total_runs / profile.total_balls) * 100).toFixed(1) : '0.0';

      // Determine rank tier
      let rank, rankEmoji;
      if (profile.games_won >= 50) { rank = 'Legend'; rankEmoji = '👑'; }
      else if (profile.games_won >= 30) { rank = 'Master'; rankEmoji = '💎'; }
      else if (profile.games_won >= 15) { rank = 'Expert'; rankEmoji = '🏆'; }
      else if (profile.games_won >= 5) { rank = 'Pro'; rankEmoji = '⭐'; }
      else if (profile.games_played >= 3) { rank = 'Rookie'; rankEmoji = '🌟'; }
      else { rank = 'Beginner'; rankEmoji = '🎯'; }

      const profileEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
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
          `┣ 4️⃣ **Fours:** ${profile.total_fours}\n` +
          `┗ 6️⃣ **Sixes:** ${profile.total_sixes}`
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
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
      } else {
        leaderboard = await hcProfileManager.getLeaderboard(10);
      }

      if (!leaderboard || leaderboard.length === 0) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('❌ No players found! Play some games first.').setTimestamp()], flags: MessageFlags.Ephemeral });
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
        } else {
          desc += `${medal} **${p.username}** — ${p.games_won} wins (${winRate}% WR)\n`;
        }
      }

      const sortLabel = sortBy === 'runs' ? '🏏 Most Runs' : sortBy === 'winrate' ? '📊 Best Win Rate' : '🏆 Most Wins';

      const lbEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏏 Hand Cricket Leaderboard — ${sortLabel}`)
        .setDescription(desc)
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket | Minimum 3 games for win rate' })
        .setTimestamp();
      return interaction.reply({ embeds: [lbEmbed] });
    }

    /* ── /handcricket sledge ── */
    if (subcommand === 'sledge') {
      const target = interaction.options.getUser('target');
      if (!target) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🏏 Mention someone to sledge!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }
      if (target.id === userId) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setDescription('🤦 You can\'t sledge yourself!').setTimestamp()], flags: MessageFlags.Ephemeral });
      }

      const sledge = SLEDGE_MESSAGES[Math.floor(Math.random() * SLEDGE_MESSAGES.length)]
        .replace(/{user}/g, interaction.user.username)
        .replace(/{target}/g, target.username);

      const sledgeEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🔥 SLEDGE!')
        .setDescription(sledge)
        .setFooter({ text: '💕 Sweetheart Bot — Hand Cricket' })
        .setTimestamp();
      return interaction.reply({ embeds: [sledgeEmbed] });
    }
  },
};

module.exports.init = init;
