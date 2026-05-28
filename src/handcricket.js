/* ═══════════════════════════════════════════
   🏏  Hand Cricket — Indian Childhood Classic!
   (Inspired by HandCricket Discord Bot)

   Game Modes:
     - Single Player: Play against the Bot (hc.play)
     - Multiplayer 1v1: Challenge a friend (hc.challenge)

   Features:
     - Coin Toss (Heads/Tails)
     - Odd-Even Toss system
     - DM-based number selection (1-6)
     - Customizable Overs & Wickets
     - Innings: Batting & Bowling
     - Score tracking with wickets
     - Same number = OUT!
     - Player Profiles with stats (hc.profile)
     - Sledge your friends (hc.sledge)
     - How to Play guide (hc.howtoplay)

   Commands:
     hc.play              — Play vs Bot (single player)
     hc.challenge @user   — Challenge someone
     hc.accept            — Accept challenge
     hc.decline           — Decline challenge
     hc.quit              — Quit current game
     hc.score             — Current score
     hc.profile           — Your stats
     hc.profile @user     — Someone's stats
     hc.sledge @user      — Sledge a friend
     hc.howtoplay         — Detailed guide
     hc.help              — Quick help

   DM Commands:
     heads / tails        — Coin toss choice (vs Bot)
     odd / even           — Toss choice (multiplayer)
     bat / bowl           — Toss winner choice
     1-6                  — Play your number
   ═══════════════════════════════════════════ */

const { EmbedBuilder } = require('discord.js');

const GAME_PHASE = {
  WAITING: 'waiting',           // Waiting for opponent to accept
  TOSS: 'toss',                // Both choosing odd/even then numbers
  TOSS_CHOICE: 'toss_choice',  // Toss winner choosing bat/bowl
  PLAYING: 'playing',          // Active gameplay
  INNINGS_BREAK: 'innings_break', // Between innings
  ENDED: 'ended',
};

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

/* ── Sledge Messages ── */
const SLEDGE_MESSAGES = [
  'yo {target}, {user} says your batting is weaker than a wet tissue! 🧻',
  '{user} thinks {target} plays like they\'re wearing oven mitts! 🧤',
  '{target}, {user} says your bowling is slower than a snail on vacation! 🐌',
  '{user} roasts {target}: "Even my grandma hits sixes off your bowling!" 👵',
  '{target}, {user} says you couldn\'t catch a cold, let alone a cricket ball! 🤧',
  '{user} to {target}: "You bat like you\'re scared of the ball!" 😱',
  '{target}, {user} says your hand cricket skills are from the Stone Age! 🪨',
  '{user} taunts {target}: "I\'ve seen better cricket from a 5-year-old!" 👶',
  '{target}, {user} says your batting average is lower than the temperature in Antarctica! 🥶',
  '{user} sledges {target}: "Even the bot plays better than you!" 🤖',
  '{target}, {user} thinks you need a map to find the boundary! 🗺️',
  '{user} says {target}\'s bowling is more predictable than sunrise! 🌅',
  '{target}, {user} bets you\'d get out on the first ball... again! 💀',
  '{user} roasts {target}: "Your cricket is like WiFi — it keeps disconnecting!" 📶',
  '{target}, {user} says you play hand cricket like it\'s hand soccer! ⚽',
];

/* ── Bot AI Names ── */
const BOT_NAMES = ['🤖 AbiBot', '🤖 CricketBot', '🤖 HandBot', '🤖 SpinMaster', '🤖 YorkerKing'];

class HandCricketGame {
  constructor(player1Id, player2Id, channelId, guildId, options = {}) {
    this.player1Id = player1Id;
    this.player2Id = player2Id;
    this.channelId = channelId;
    this.guildId = guildId;
    this.channel = null;

    this.phase = GAME_PHASE.WAITING;

    // Players: [0] = player1 (challenger), [1] = player2 (opponent/bot)
    this.players = [player1Id, player2Id];

    // Is this a single player (vs bot) game?
    this.isBotGame = options.isBot || false;

    // Toss
    this.tossNumbers = {};      // userId → number (1-6)
    this.tossChoice = {};       // userId → 'odd' or 'even' / 'heads' or 'tails'
    this.tossWinner = null;
    this.tossLoser = null;
    this.coinResult = null;     // 'heads' or 'tails' (single player)

    // Innings
    this.battingFirst = null;
    this.bowlingFirst = null;
    this.currentInnings = 1;
    this.battingNow = null;
    this.bowlingNow = null;

    // Score
    this.scores = {};
    this.scores[player1Id] = { runs: 0, wickets: 0, balls: 0 };
    this.scores[player2Id] = { runs: 0, wickets: 0, balls: 0 };

    // Current ball
    this.currentNumbers = {};

    // Customizable settings
    this.maxOvers = options.overs || 1;     // overs per innings
    this.maxWickets = options.wickets || 2;  // wickets = all out
    this.maxBalls = this.maxOvers * 6;      // balls per innings

    // Ball-by-ball log for this game
    this.ballLog = [];  // [{innings, ball, batNum, bowlNum, runs, out}]

    this.lastActivity = Date.now();
    this.timeoutTimer = null;
  }

  /**
   * Accept the challenge
   */
  accept() {
    if (this.phase !== GAME_PHASE.WAITING) {
      return { success: false, message: '🚫 Game is not waiting for acceptance!' };
    }
    this.phase = GAME_PHASE.TOSS;
    return { success: true };
  }

  /**
   * Decline the challenge
   */
  decline() {
    this.phase = GAME_PHASE.ENDED;
    return { success: true };
  }

  /* ═══════════════════════════════════════════
     🪙 SINGLE PLAYER TOSS — Coin Flip
     ═══════════════════════════════════════════ */

  /**
   * Player chooses heads or tails for coin toss (single player)
   */
  coinTossChoice(userId, choice) {
    if (this.phase !== GAME_PHASE.TOSS) {
      return { success: false, message: '🚫 Not in toss phase!' };
    }
    if (!this.isBotGame) {
      return { success: false, message: '🚫 Coin toss is for single player! Use `hc.toss odd/even` for multiplayer.' };
    }
    if (!['heads', 'tails'].includes(choice)) {
      return { success: false, message: '❌ Choose `heads` or `tails`!' };
    }

    // Flip the coin
    this.coinResult = Math.random() < 0.5 ? 'heads' : 'tails';
    const playerWon = this.coinResult === choice;

    if (playerWon) {
      this.tossWinner = this.player1Id;
      this.tossLoser = this.player2Id;
    } else {
      this.tossWinner = this.player2Id;
      this.tossLoser = this.player1Id;
    }

    this.phase = GAME_PHASE.TOSS_CHOICE;

    return {
      success: true,
      coinResult: this.coinResult,
      playerChoice: choice,
      playerWon,
      tossWinner: this.tossWinner,
    };
  }

  /* ═══════════════════════════════════════════
     🪙 MULTIPLAYER TOSS — Odd/Even
     ═══════════════════════════════════════════ */

  /**
   * Set toss choice (odd/even) for a player (multiplayer)
   */
  setTossChoice(userId, choice) {
    if (this.phase !== GAME_PHASE.TOSS) {
      return { success: false, message: '🚫 Not in toss phase!' };
    }
    if (!this.players.includes(userId)) {
      return { success: false, message: '🚫 You are not in this game!' };
    }
    if (!['odd', 'even'].includes(choice)) {
      return { success: false, message: '❌ Choose `odd` or `even`!' };
    }
    if (this.tossChoice[userId]) {
      return { success: false, message: '❌ You already chose! Wait for the toss.' };
    }

    this.tossChoice[userId] = choice;

    const p1Choice = this.tossChoice[this.players[0]];
    const p2Choice = this.tossChoice[this.players[1]];

    if (p1Choice && p2Choice) {
      return { success: true, message: 'both_chosen', p1Choice, p2Choice };
    }

    return { success: true, message: 'waiting' };
  }

  /**
   * Submit toss number (DM) — multiplayer
   */
  submitTossNumber(userId, number) {
    if (this.phase !== GAME_PHASE.TOSS) {
      return { success: false, message: '🚫 Not in toss phase!' };
    }
    if (!this.players.includes(userId)) {
      return { success: false, message: '🚫 You are not in this game!' };
    }
    if (!this.tossChoice[userId]) {
      return { success: false, message: '❌ First choose odd or even in the channel! Use `hc.toss odd` or `hc.toss even`' };
    }
    if (number < 1 || number > 6) {
      return { success: false, message: '❌ Choose a number between 1 and 6!' };
    }
    if (this.tossNumbers[userId] !== undefined) {
      return { success: false, message: '❌ You already submitted your toss number!' };
    }

    this.tossNumbers[userId] = number;

    // If bot game, generate bot number
    if (this.isBotGame && this.tossNumbers[this.player2Id] === undefined) {
      this.tossNumbers[this.player2Id] = Math.floor(Math.random() * 6) + 1;
    }

    const p1Num = this.tossNumbers[this.players[0]];
    const p2Num = this.tossNumbers[this.players[1]];

    if (p1Num !== undefined && p2Num !== undefined) {
      const sum = p1Num + p2Num;
      const isEven = sum % 2 === 0;
      const result = isEven ? 'even' : 'odd';

      if (this.tossChoice[this.players[0]] === result) {
        this.tossWinner = this.players[0];
        this.tossLoser = this.players[1];
      } else {
        this.tossWinner = this.players[1];
        this.tossLoser = this.players[0];
      }

      this.phase = GAME_PHASE.TOSS_CHOICE;

      return {
        success: true,
        message: 'toss_resolved',
        p1Num,
        p2Num,
        sum,
        result,
        winner: this.tossWinner,
      };
    }

    return { success: true, message: 'waiting_for_opponent' };
  }

  /* ═══════════════════════════════════════════
     🏏 BAT/BOWL CHOICE
     ═══════════════════════════════════════════ */

  /**
   * Toss winner chooses to bat or bowl
   */
  chooseBatBowl(userId, choice) {
    if (this.phase !== GAME_PHASE.TOSS_CHOICE) {
      return { success: false, message: '🚫 Not in toss choice phase!' };
    }
    if (userId !== this.tossWinner) {
      return { success: false, message: '🚫 Only the toss winner can choose!' };
    }
    if (!['bat', 'bowl'].includes(choice)) {
      return { success: false, message: '❌ Choose `bat` or `bowl`!' };
    }

    if (choice === 'bat') {
      this.battingFirst = this.tossWinner;
      this.bowlingFirst = this.tossLoser;
    } else {
      this.battingFirst = this.tossLoser;
      this.bowlingFirst = this.tossWinner;
    }

    this.battingNow = this.battingFirst;
    this.bowlingNow = this.bowlingFirst;
    this.currentInnings = 1;
    this.phase = GAME_PHASE.PLAYING;
    this.currentNumbers = {};

    return { success: true, battingFirst: this.battingFirst, bowlingFirst: this.bowlingFirst };
  }

  /**
   * Bot chooses bat or bowl automatically
   */
  botChooseBatBowl() {
    if (this.phase !== GAME_PHASE.TOSS_CHOICE) return { success: false };
    // Bot randomly chooses
    const choice = Math.random() < 0.5 ? 'bat' : 'bowl';
    return this.chooseBatBowl(this.tossWinner, choice);
  }

  /* ═══════════════════════════════════════════
     🏏 GAMEPLAY
     ═══════════════════════════════════════════ */

  /**
   * Submit play number (DM) — 1-6 during gameplay
   */
  submitPlayNumber(userId, number) {
    if (this.phase !== GAME_PHASE.PLAYING) {
      return { success: false, message: '🚫 Game is not in playing phase!' };
    }
    if (userId !== this.battingNow && userId !== this.bowlingNow) {
      return { success: false, message: '🚫 It\'s not your turn to play!' };
    }
    if (number < 1 || number > 6) {
      return { success: false, message: '❌ Choose a number between 1 and 6!' };
    }
    if (this.currentNumbers[userId] !== undefined) {
      return { success: false, message: '❌ You already chose your number! Wait for the other player.' };
    }

    this.currentNumbers[userId] = number;

    // If bot game, generate bot number
    if (this.isBotGame) {
      const botId = this.player2Id;
      if (this.currentNumbers[botId] === undefined) {
        this.currentNumbers[botId] = Math.floor(Math.random() * 6) + 1;
      }
    }

    const batNum = this.currentNumbers[this.battingNow];
    const bowlNum = this.currentNumbers[this.bowlingNow];

    if (batNum !== undefined && bowlNum !== undefined) {
      return this.resolveBall(batNum, bowlNum);
    }

    return { success: true, message: 'waiting_for_opponent' };
  }

  /**
   * Resolve a ball — both numbers are in
   */
  resolveBall(batNum, bowlNum) {
    const batsman = this.battingNow;
    const bowler = this.bowlingNow;
    const isOut = batNum === bowlNum;

    this.currentNumbers = {};
    this.scores[batsman].balls++;

    // Log the ball
    this.ballLog.push({
      innings: this.currentInnings,
      ball: this.scores[batsman].balls,
      batNum,
      bowlNum,
      runs: isOut ? 0 : batNum,
      out: isOut,
    });

    let result;

    if (isOut) {
      this.scores[batsman].wickets++;
      result = {
        success: true,
        message: 'out',
        batNum,
        bowlNum,
        batsman,
        bowler,
        runsThisBall: 0,
        totalRuns: this.scores[batsman].runs,
        wickets: this.scores[batsman].wickets,
        balls: this.scores[batsman].balls,
      };

      if (this.scores[batsman].wickets >= this.maxWickets || this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    } else {
      this.scores[batsman].runs += batNum;
      result = {
        success: true,
        message: 'runs',
        batNum,
        bowlNum,
        batsman,
        bowler,
        runsThisBall: batNum,
        totalRuns: this.scores[batsman].runs,
        wickets: this.scores[batsman].wickets,
        balls: this.scores[batsman].balls,
      };

      // 2nd innings chase check
      if (this.currentInnings === 2) {
        const firstBattingScore = this.scores[this.battingFirst].runs;
        const secondBattingScore = this.scores[batsman].runs;
        if (secondBattingScore > firstBattingScore) {
          result.gameOver = true;
          result.winner = batsman;
          result.loser = bowler;
          this.phase = GAME_PHASE.ENDED;
        }
      }

      if (!result.gameOver && this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    }

    return result;
  }

  /**
   * Handle end of an innings
   */
  handleInningsEnd() {
    if (this.currentInnings === 1) {
      this.currentInnings = 2;
      this.battingNow = this.bowlingFirst;
      this.bowlingNow = this.battingFirst;
      this.phase = GAME_PHASE.INNINGS_BREAK;
      return {
        nextPhase: 'innings_break',
        target: this.scores[this.battingFirst].runs + 1,
        nextBatsman: this.battingNow,
        nextBowler: this.bowlingNow,
      };
    } else {
      const p1Runs = this.scores[this.players[0]].runs;
      const p2Runs = this.scores[this.players[1]].runs;

      let winner, loser;
      if (p1Runs > p2Runs) {
        winner = this.players[0];
        loser = this.players[1];
      } else if (p2Runs > p1Runs) {
        winner = this.players[1];
        loser = this.players[0];
      } else {
        winner = null;
        loser = null;
      }

      this.phase = GAME_PHASE.ENDED;

      return {
        nextPhase: 'game_over',
        winner,
        loser,
        isTie: winner === null,
      };
    }
  }

  /**
   * Start 2nd innings after break
   */
  startSecondInnings() {
    if (this.phase !== GAME_PHASE.INNINGS_BREAK) {
      return { success: false, message: '🚫 Not in innings break!' };
    }
    this.phase = GAME_PHASE.PLAYING;
    this.currentNumbers = {};
    return { success: true };
  }

  /**
   * Quit the game
   */
  quit(userId) {
    if (!this.players.includes(userId)) {
      return { success: false, message: '🚫 You are not in this game!' };
    }
    this.phase = GAME_PHASE.ENDED;
    const winner = this.players.find(p => p !== userId);
    return { success: true, quitter: userId, winner };
  }

  /**
   * Get score string
   */
  getScoreString() {
    const p1Score = this.scores[this.players[0]];
    const p2Score = this.scores[this.players[1]];

    return {
      p1: { id: this.players[0], ...p1Score },
      p2: { id: this.players[1], ...p2Score },
      currentInnings: this.currentInnings,
      battingNow: this.battingNow,
      bowlingNow: this.bowlingNow,
    };
  }

  /**
   * Get game summary string for profile stats
   */
  getGameSummary(userId) {
    const score = this.scores[userId];
    const won = this.phase === GAME_PHASE.ENDED && this.getWinner() === userId;
    return {
      runs: score.runs,
      wickets: score.wickets,
      balls: score.balls,
      overs: `${Math.floor(score.balls / 6)}.${score.balls % 6}`,
      won,
    };
  }

  getWinner() {
    if (this.phase !== GAME_PHASE.ENDED) return null;
    const p1Runs = this.scores[this.players[0]].runs;
    const p2Runs = this.scores[this.players[1]].runs;
    if (p1Runs > p2Runs) return this.players[0];
    if (p2Runs > p1Runs) return this.players[1];
    return null; // tie
  }
}

/* ═══════════════════════════════════════════
   📊 Player Profile Manager (Supabase)
   ═══════════════════════════════════════════ */

class ProfileManager {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async getOrCreateProfile(userId, username) {
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error.message);
        return null;
      }

      if (data) return data;

      // Create new profile
      const { data: newProfile, error: insertError } = await this.supabase
        .from('hc_profiles')
        .insert({
          user_id: userId,
          username: username,
          games_played: 0,
          games_won: 0,
          total_runs: 0,
          total_wickets: 0,
          highest_score: 0,
          total_balls: 0,
          total_fours: 0,
          total_sixes: 0,
        })
        .select()
        .maybeSingle();

      if (insertError) {
        console.error('Profile create error:', insertError.message);
        return null;
      }

      return newProfile;
    } catch (err) {
      console.error('Profile error:', err.message);
      return null;
    }
  }

  async updateProfile(userId, gameSummary) {
    if (!this.supabase) return;
    try {
      const profile = await this.getOrCreateProfile(userId, '');
      if (!profile) return;

      const fours = gameSummary.runs >= 4 ? 1 : 0;   // simplified: 4+ runs = boundary
      const sixes = gameSummary.runs >= 6 ? 1 : 0;

      const updates = {
        games_played: profile.games_played + 1,
        games_won: profile.games_won + (gameSummary.won ? 1 : 0),
        total_runs: profile.total_runs + gameSummary.runs,
        total_wickets: profile.total_wickets + gameSummary.wickets,
        highest_score: Math.max(profile.highest_score, gameSummary.runs),
        total_balls: profile.total_balls + gameSummary.balls,
        total_fours: profile.total_fours + fours,
        total_sixes: profile.total_sixes + sixes,
      };

      await this.supabase
        .from('hc_profiles')
        .update(updates)
        .eq('user_id', userId);
    } catch (err) {
      console.error('Profile update error:', err.message);
    }
  }

  async getLeaderboard(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .order('games_won', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }
}

module.exports = { HandCricketGame, GAME_PHASE, ProfileManager, EMOJI_NUMBERS, SLEDGE_MESSAGES, BOT_NAMES };
