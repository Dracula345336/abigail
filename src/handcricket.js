/* ═══════════════════════════════════════════
   🏏  Hand Cricket — Indian Childhood Classic!
   (Enhanced with Timers, Commentary, Economy & Leaderboards)

   Game Modes:
     - Single Player: Play against the Bot (hc.play)
     - Multiplayer 1v1: Challenge a friend (hc.challenge)

   Features:
     - Coin Toss (Heads/Tails) + Odd-Even Toss
     - DM-based number selection (1-6)
     - Customizable Overs & Wickets
     - Score tracking with wickets & run rate
     - Same number = OUT!
     - Match Timer with auto-end
     - Funny ball-by-ball commentary
     - Economy rewards (INR)
     - Player Profiles with stats
     - Leaderboards
     - Sledge your friends
     - Slash commands support

   Prefix Commands:
     hc.play [overs] [wickets]      — Play vs Bot
     hc.challenge @user [o] [w]     — Challenge someone
     hc.accept                       — Accept challenge
     hc.decline                      — Decline challenge
     hc.toss odd/even                — Multiplayer toss
     hc.quit                         — Quit current game
     hc.score                        — Current score
     hc.profile [@user]              — Stats
     hc.sledge @user                 — Roast friend
     hc.howtoplay                    — Guide
     hc.help                         — Quick help
     hc.leaderboard                  — Top players

   DM Commands:
     heads / tails  — Coin toss choice (vs Bot)
     odd / even     — Toss choice (multiplayer)
     bat / bowl     — Toss winner choice
     1-6            — Play your number
   ═══════════════════════════════════════════ */

const { EmbedBuilder } = require('discord.js');

const GAME_PHASE = {
  WAITING: 'waiting',
  TOSS: 'toss',
  TOSS_CHOICE: 'toss_choice',
  PLAYING: 'playing',
  INNINGS_BREAK: 'innings_break',
  ENDED: 'ended',
};

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

/* ── Match Timer Settings ── */
const MATCH_TURN_TIMEOUT = 45; // seconds to play a number before auto-out
const MATCH_INACTIVITY_TIMEOUT = 120; // seconds of total inactivity before game auto-ends

/* ── Economy Rewards ── */
const ECONOMY = {
  PLAY_REWARD: 10,          // INR for playing a game
  WIN_BONUS: 50,            // INR for winning
  FOUR_BONUS: 5,            // INR per boundary (4)
  SIX_BONUS: 10,            // INR per sixer (6)
  DUCK_PENALTY: 0,          // no penalty for 0 runs
  CENTURY_BONUS: 100,       // INR bonus for scoring 36+ (6 overs equivalent century)
  HATTRICK_BONUS: 30,       // INR bonus for taking 3 wickets in a row
  STREAK_WIN_BONUS: 20,     // INR per consecutive win (capped at 5)
};

/* ── Funny Ball-by-Ball Commentary ── */
const COMMENTARY_RUNS = {
  1: [
    '🏏 Quick single taken! Running like they stole something!',
    '🏃 Sneaky single! The fielder was napping!',
    '💪 Pushed into the gap for a comfortable single.',
    '👟 Just a single — keeping the scoreboard ticking!',
    '🏏 Nudged away for one. Smart cricket!',
  ],
  2: [
    '🏃‍♂️ Turning back for the second! Great running between the wickets!',
    '⚡ Quick feet! Two runs stolen with sheer speed!',
    '🔄 Doubled up! The field was a bit lazy there.',
    '💨 Two runs! Like a ninja between the wickets!',
    '🏏 Easy two — the gap was bigger than my will to live!',
  ],
  3: [
    '🏃‍♂️🏃‍♀️ Three runs! Throwing caution to the wind!',
    '⚡ TRIPLE! Running like their life depends on it!',
    '🔥 Three runs! The fielder is chasing shadows!',
    '🏏 Unbelievable running! Turned ones into threes!',
    '💨 Three! The outfield is lightning quick today!',
  ],
  4: [
    '🔥 FOUR! Smashed through the covers! The crowd goes wild!',
    '💥 BOUNDARY! Timed to perfection — pure class!',
    '🎯 FOUR! Right through the gap — surgical precision!',
    '🏏 BOOM! Four runs! That ball is in the stands!',
    '🌟 Elegant drive for FOUR! Poetry in motion!',
    '💪 Punched through the gap — FOUR! Nothing the fielder could do!',
  ],
  5: [
    '🌟 FIVE! Rare as a unicorn! Overthrows added bonus!',
    '🦄 Five runs! The fielder had a nightmare — two overthrows!',
    '🏏 FIVE! Scored 4 plus an overthrow — chaos on the field!',
    '⚡ Almost a six but... FIVE! The fielder fumbled at the boundary!',
  ],
  6: [
    '🚀 SIXER! Out of the ground! Gone! INTO ORBIT!',
    '💫 MASSIVE SIX! That ball is still traveling!',
    '🎉 SIX! Maximum! The bowler is hiding behind the umpire!',
    '🔥 SIXER! Hit it so hard the ball needs a passport!',
    '💥 INTO THE CROWD! SIX! Take a bow, that was HUGE!',
    '🌟 SIX! The bowler just fell to their knees! Absolute carnage!',
    '🚀 SIXER! NASA called — they want their ball back!',
  ],
};

const COMMENTARY_OUT = [
  '💀 OUT! Same number — the walk of shame begins!',
  '🔥 BOWLED HIM! The numbers matched — disaster!',
  '⚡ CAUGHT! Same number = instant OUT! What a delivery!',
  '💥 TIMBER! The stumps are shattered! Same number — GONE!',
  '🎯 CLEAN BOWLED! The batsman walks back in disbelief!',
  '💀 TRAPPED IN FRONT! That was dead straight — OUT!',
  '🔥 What a delivery! Same number — you gotta walk back, mate!',
  '⚡ GONE! The bowler is doing a victory dance!',
  '💥 OUT! The batsman looks at the sky — why me?!',
  '🎯 BULLSEYE! Same number — no mercy shown!',
  '💀 The bowler predicted it perfectly! OUT!',
  '🔥 SEND HIM BACK! Same number — easy wicket!',
];

const COMMENTARY_WIDE = [
  '📊 The tension is building...',
  '⏳ The crowd waits in anticipation...',
  '🎤 What will happen next? Stay tuned!',
  '🎭 Drama on the pitch!',
];

const COMMENTARY_TOSS = [
  '🪙 The coin is in the air... time stands still!',
  '🪙 Up goes the coin! The entire stadium holds its breath!',
  '🪙 The toss that could decide everything!',
  '🪙 Flip of destiny! History hangs in the balance!',
];

const COMMENTARY_INNINGS_BREAK = [
  '⏸️ The players take a breather. Can the chaser pull it off?',
  '⏸️ Strategic timeout! The target is set — drama awaits!',
  '⏸️ Halftime show! Who will rise to the occasion?',
  '⏸️ The chase is on! Can they do the impossible?',
];

const COMMENTARY_GAME_OVER_WIN = [
  '🏆 What a match! The champion takes it all!',
  '🏆 Victory! The crowd erupts in celebration!',
  '🏆 And that\'s that! Dominant performance!',
  '🏆 Game, Set, Match! What a player!',
  '🏆 Unbelievable scenes! The underdog triumphs!',
];

const COMMENTARY_GAME_OVER_TIE = [
  '🤝 A TIE! Neither team could be separated!',
  '🤝 Dead even! What a nail-biter!',
  '🤝 Points shared! You can\'t write this script!',
];

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
  '{user}: "{target}, your batting stance looks like you\'re dancing at a wedding!" 💃',
  '{target}, {user} says your cricket IQ is lower than your ping! 🏓',
  '{user} to {target}: "Bro you bat like the WiFi signal — keeps dropping!" 📶',
  '{target}, {user}: "You\'re the kind of player who gets out and blames the pitch!" 🏗️',
  '{user} fires: "{target}, your bowling is so slow, even a sloth could hit it for six!" 🦥',
  '{target}, {user} says your hand cricket career has a shorter lifespan than a mayfly! 🪰',
];

/* ── Bot AI Names & Personalities ── */
const BOT_PROFILES = [
  { name: '🤖 AbiBot', style: 'aggressive' },
  { name: '🤖 SpinMaster', style: 'defensive' },
  { name: '🤖 YorkerKing', style: 'balanced' },
  { name: '🤖 BatSmasher', style: 'aggressive' },
  { name: '🤖 WallBuilder', style: 'defensive' },
];

/* ── Bot AI ── */
function getBotNumber(style, playerHistory = [], currentBall = 0) {
  // Smart bot AI based on style and player patterns
  if (playerHistory.length >= 3) {
    // Try to predict player's next number based on recent pattern
    const recent = playerHistory.slice(-3);
    const mostCommon = recent.sort((a, b) =>
      recent.filter(v => v === b).length - recent.filter(v => v === a).length
    )[0];

    if (style === 'aggressive' && Math.random() < 0.4) {
      return mostCommon; // Try to match (bowl them out)
    }
    if (style === 'defensive' && Math.random() < 0.3) {
      return mostCommon;
    }
  }

  // Style-based tendencies
  switch (style) {
    case 'aggressive':
      // Favors higher numbers
      return [1, 2, 3, 4, 5, 6][Math.floor(Math.random() * 6)];
    case 'defensive':
      // Favors lower numbers
      return [1, 1, 2, 2, 3, 4][Math.floor(Math.random() * 6)];
    default: // balanced
      return Math.floor(Math.random() * 6) + 1;
  }
}

/* ═══════════════════════════════════════════
   🏏 HandCricketGame Class
   ═══════════════════════════════════════════ */

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
    this.botProfile = this.isBotGame
      ? BOT_PROFILES[Math.floor(Math.random() * BOT_PROFILES.length)]
      : null;

    // Toss
    this.tossNumbers = {};
    this.tossChoice = {};
    this.tossWinner = null;
    this.tossLoser = null;
    this.coinResult = null;

    // Innings
    this.battingFirst = null;
    this.bowlingFirst = null;
    this.currentInnings = 1;
    this.battingNow = null;
    this.bowlingNow = null;

    // Score
    this.scores = {};
    this.scores[player1Id] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0 };
    this.scores[player2Id] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0 };

    // Current ball
    this.currentNumbers = {};

    // Customizable settings
    this.maxOvers = options.overs || 1;
    this.maxWickets = options.wickets || 2;
    this.maxBalls = this.maxOvers * 6;

    // Ball-by-ball log
    this.ballLog = [];

    // Player history for bot AI
    this.playerHistory = [];

    // Consecutive wickets for hat-trick tracking
    this.consecutiveWickets = 0;

    // Match Timer
    this.lastActivity = Date.now();
    this.turnTimer = null;
    this.inactivityTimer = null;
    this.turnStartTime = null;

    // Commentary
    this.lastCommentary = '';
  }

  /**
   * Accept the challenge
   */
  accept() {
    if (this.phase !== GAME_PHASE.WAITING) {
      return { success: false, message: '🚫 Game is not waiting for acceptance!' };
    }
    this.phase = GAME_PHASE.TOSS;
    this.lastActivity = Date.now();
    return { success: true };
  }

  /**
   * Decline the challenge
   */
  decline() {
    this.clearTimers();
    this.phase = GAME_PHASE.ENDED;
    return { success: true };
  }

  /**
   * Clear all timers
   */
  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
  }

  /**
   * Start turn timer — auto-out if player doesn't respond
   */
  startTurnTimer(onTurnTimeout, onInactivityTimeout) {
    this.clearTimers();
    this.turnStartTime = Date.now();
    this.lastActivity = Date.now();

    // Turn timer: auto-out if one player doesn't respond
    this.turnTimer = setTimeout(() => {
      onTurnTimeout(this);
    }, MATCH_TURN_TIMEOUT * 1000);

    // Inactivity timer: end game if no activity for too long
    this.inactivityTimer = setTimeout(() => {
      onInactivityTimeout(this);
    }, MATCH_INACTIVITY_TIMEOUT * 1000);
  }

  /**
   * Reset turn timer after a ball is played
   */
  resetTurnTimer(onTurnTimeout, onInactivityTimeout) {
    this.lastActivity = Date.now();
    this.startTurnTimer(onTurnTimeout, onInactivityTimeout);
  }

  /* ═══════════════════════════════════════════
     🪙 SINGLE PLAYER TOSS — Coin Flip
     ═══════════════════════════════════════════ */

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
    this.lastActivity = Date.now();

    return {
      success: true,
      coinResult: this.coinResult,
      playerChoice: choice,
      playerWon,
      tossWinner: this.tossWinner,
      commentary: COMMENTARY_TOSS[Math.floor(Math.random() * COMMENTARY_TOSS.length)],
    };
  }

  /* ═══════════════════════════════════════════
     🪙 MULTIPLAYER TOSS — Odd/Even
     ═══════════════════════════════════════════ */

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
    this.lastActivity = Date.now();

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
      this.lastActivity = Date.now();

      return {
        success: true,
        message: 'toss_resolved',
        p1Num,
        p2Num,
        sum,
        result,
        winner: this.tossWinner,
        commentary: COMMENTARY_TOSS[Math.floor(Math.random() * COMMENTARY_TOSS.length)],
      };
    }

    return { success: true, message: 'waiting_for_opponent' };
  }

  /* ═══════════════════════════════════════════
     🏏 BAT/BOWL CHOICE
     ═══════════════════════════════════════════ */

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
    this.lastActivity = Date.now();

    return { success: true, battingFirst: this.battingFirst, bowlingFirst: this.bowlingFirst };
  }

  /**
   * Bot chooses bat or bowl automatically
   */
  botChooseBatBowl() {
    if (this.phase !== GAME_PHASE.TOSS_CHOICE) return { success: false };
    const choice = this.botProfile?.style === 'aggressive' ? 'bat' :
                   this.botProfile?.style === 'defensive' ? 'bowl' :
                   (Math.random() < 0.5 ? 'bat' : 'bowl');
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
    this.lastActivity = Date.now();

    // Track player history for bot AI
    if (!this.isBotGame || userId === this.player1Id) {
      this.playerHistory.push(number);
    }

    // If bot game, generate bot number using AI
    if (this.isBotGame) {
      const botId = this.player2Id;
      if (this.currentNumbers[botId] === undefined) {
        // Bot AI — use style-based logic
        const isBotBatting = this.battingNow === botId;
        const style = this.botProfile?.style || 'balanced';

        if (isBotBatting) {
          // Bot is batting — try to avoid player's predicted number
          const botNum = getBotNumber(style, this.playerHistory, this.scores[botId].balls);
          this.currentNumbers[botId] = botNum;
        } else {
          // Bot is bowling — try to match player's predicted number
          const botNum = getBotNumber(style, this.playerHistory, this.scores[this.player1Id].balls);
          this.currentNumbers[botId] = botNum;
        }
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

    let commentary = '';

    if (isOut) {
      this.scores[batsman].wickets++;
      this.consecutiveWickets++;
      commentary = COMMENTARY_OUT[Math.floor(Math.random() * COMMENTARY_OUT.length)];
    } else {
      this.consecutiveWickets = 0;
      this.scores[batsman].runs += batNum;
      if (batNum === 4) this.scores[batsman].fours++;
      if (batNum === 6) this.scores[batsman].sixes++;
      commentary = (COMMENTARY_RUNS[batNum] || [])[Math.floor(Math.random() * (COMMENTARY_RUNS[batNum] || ['🏏 Runs scored!']).length)] || '🏏 Runs scored!';
    }

    this.lastCommentary = commentary;

    let result;

    if (isOut) {
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
        commentary,
        isHatTrick: this.consecutiveWickets >= 3,
      };

      if (this.scores[batsman].wickets >= this.maxWickets || this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    } else {
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
        isFour: batNum === 4,
        isSix: batNum === 6,
        commentary,
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
          result.gameOverCommentary = COMMENTARY_GAME_OVER_WIN[Math.floor(Math.random() * COMMENTARY_GAME_OVER_WIN.length)];
        }
      }

      if (!result.gameOver && this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    }

    // Calculate economy rewards for this ball
    result.economyBonus = this.calculateBallEconomy(batNum, isOut);

    return result;
  }

  /**
   * Calculate economy bonus for a single ball
   */
  calculateBallEconomy(runs, isOut) {
    let bonus = 0;
    if (runs === 4) bonus += ECONOMY.FOUR_BONUS;
    if (runs === 6) bonus += ECONOMY.SIX_BONUS;
    return bonus;
  }

  /**
   * Calculate total economy rewards for game end
   */
  calculateGameEconomy(winnerId) {
    const rewards = {
      [this.players[0]]: ECONOMY.PLAY_REWARD,
      [this.players[1]]: ECONOMY.PLAY_REWARD,
    };

    // Win bonus
    if (winnerId) {
      rewards[winnerId] += ECONOMY.WIN_BONUS;
    }

    // Boundary bonuses
    for (const pid of this.players) {
      if (!pid.startsWith('BOT_')) {
        rewards[pid] += (this.scores[pid].fours || 0) * ECONOMY.FOUR_BONUS;
        rewards[pid] += (this.scores[pid].sixes || 0) * ECONOMY.SIX_BONUS;

        // Century bonus (36+ runs in 6 overs = century equivalent)
        if (this.scores[pid].runs >= 36) {
          rewards[pid] += ECONOMY.CENTURY_BONUS;
        }

        // Duck (0 runs)
        if (this.scores[pid].runs === 0 && this.scores[pid].balls > 0) {
          // No extra penalty, just no run bonus
        }
      }
    }

    // Remove rewards for bot players
    for (const pid of this.players) {
      if (pid.startsWith('BOT_')) {
        delete rewards[pid];
      }
    }

    return rewards;
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
      this.consecutiveWickets = 0;
      this.lastActivity = Date.now();

      return {
        nextPhase: 'innings_break',
        target: this.scores[this.battingFirst].runs + 1,
        nextBatsman: this.battingNow,
        nextBowler: this.bowlingNow,
        commentary: COMMENTARY_INNINGS_BREAK[Math.floor(Math.random() * COMMENTARY_INNINGS_BREAK.length)],
        firstInningsScore: `${this.scores[this.battingFirst].runs}/${this.scores[this.battingFirst].wickets}`,
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
      this.clearTimers();

      const isTie = winner === null;
      const commentary = isTie
        ? COMMENTARY_GAME_OVER_TIE[Math.floor(Math.random() * COMMENTARY_GAME_OVER_TIE.length)]
        : COMMENTARY_GAME_OVER_WIN[Math.floor(Math.random() * COMMENTARY_GAME_OVER_WIN.length)];

      const economyRewards = this.calculateGameEconomy(winner);

      return {
        nextPhase: 'game_over',
        winner,
        loser,
        isTie,
        commentary,
        economyRewards,
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
    this.lastActivity = Date.now();
    return { success: true };
  }

  /**
   * Handle turn timeout — player who didn't respond is auto-out
   */
  handleTurnTimeout() {
    if (this.phase !== GAME_PHASE.PLAYING) return null;

    // Figure out who didn't play yet
    const battingPlayed = this.currentNumbers[this.battingNow] !== undefined;
    const bowlingPlayed = this.currentNumbers[this.bowlingNow] !== undefined;

    let timedOutPlayer;
    if (!battingPlayed && !bowlingPlayed) {
      // Both timed out — batsman is out
      timedOutPlayer = this.battingNow;
    } else if (!battingPlayed) {
      timedOutPlayer = this.battingNow;
    } else {
      timedOutPlayer = this.bowlingNow;
    }

    this.currentNumbers = {};
    this.scores[this.battingNow].balls++;
    this.scores[this.battingNow].wickets++;
    this.consecutiveWickets++;

    const result = {
      timeout: true,
      timedOutPlayer,
      batsman: this.battingNow,
      bowler: this.bowlingNow,
      totalRuns: this.scores[this.battingNow].runs,
      wickets: this.scores[this.battingNow].wickets,
      balls: this.scores[this.battingNow].balls,
    };

    // Check if innings over
    if (this.scores[this.battingNow].wickets >= this.maxWickets || this.scores[this.battingNow].balls >= this.maxBalls) {
      result.inningsOver = true;
      const inningsResult = this.handleInningsEnd();
      return { ...result, ...inningsResult };
    }

    return result;
  }

  /**
   * Handle full inactivity timeout — game ends
   */
  handleInactivityTimeout() {
    this.clearTimers();
    this.phase = GAME_PHASE.ENDED;

    // Current leader wins
    const p1Runs = this.scores[this.players[0]].runs;
    const p2Runs = this.scores[this.players[1]].runs;
    let winner = null;
    if (p1Runs > p2Runs) winner = this.players[0];
    else if (p2Runs > p1Runs) winner = this.players[1];

    return {
      inactivityEnd: true,
      winner,
      p1Score: this.scores[this.players[0]],
      p2Score: this.scores[this.players[1]],
    };
  }

  /**
   * Quit the game
   */
  quit(userId) {
    if (!this.players.includes(userId)) {
      return { success: false, message: '🚫 You are not in this game!' };
    }
    this.clearTimers();
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
   * Get formatted scorecard
   */
  getFormattedScorecard(playerNames) {
    const p1 = this.scores[this.players[0]];
    const p2 = this.scores[this.players[1]];
    const p1Name = playerNames[this.players[0]] || 'Player 1';
    const p2Name = playerNames[this.players[1]] || 'Player 2';

    const formatScore = (s) => {
      const overs = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
      const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
      return `${s.runs}/${s.wickets} (${overs} ov) | SR: ${sr} | 4s: ${s.fours} | 6s: ${s.sixes}`;
    };

    return {
      p1Name,
      p2Name,
      p1Score: formatScore(p1),
      p2Score: formatScore(p2),
      innings: this.currentInnings,
      target: this.currentInnings === 2 ? this.scores[this.battingFirst].runs + 1 : null,
      need: this.currentInnings === 2 ? Math.max(0, this.scores[this.battingFirst].runs + 1 - this.scores[this.battingNow].runs) : null,
    };
  }

  /**
   * Get game summary for profile stats
   */
  getGameSummary(userId) {
    const score = this.scores[userId];
    const won = this.phase === GAME_PHASE.ENDED && this.getWinner() === userId;
    return {
      runs: score.runs,
      wickets: score.wickets,
      balls: score.balls,
      fours: score.fours || 0,
      sixes: score.sixes || 0,
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
    return null;
  }

  /**
   * Get remaining balls and overs
   */
  getRemainingBalls() {
    if (!this.battingNow) return null;
    return {
      ballsLeft: this.maxBalls - this.scores[this.battingNow].balls,
      oversBowled: `${Math.floor(this.scores[this.battingNow].balls / 6)}.${this.scores[this.battingNow].balls % 6}`,
    };
  }

  /**
   * Get time remaining on turn timer
   */
  getTimeRemaining() {
    if (!this.turnStartTime) return null;
    const elapsed = (Date.now() - this.turnStartTime) / 1000;
    return Math.max(0, MATCH_TURN_TIMEOUT - Math.floor(elapsed));
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

      if (data) {
        // Update username if changed
        if (data.username !== username && username) {
          await this.supabase
            .from('hc_profiles')
            .update({ username })
            .eq('user_id', userId);
          data.username = username;
        }
        return data;
      }

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
          win_streak: 0,
          best_win_streak: 0,
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

      const newWinStreak = gameSummary.won ? (profile.win_streak || 0) + 1 : 0;
      const bestStreak = Math.max(profile.best_win_streak || 0, newWinStreak);

      const updates = {
        games_played: profile.games_played + 1,
        games_won: profile.games_won + (gameSummary.won ? 1 : 0),
        total_runs: profile.total_runs + gameSummary.runs,
        total_wickets: profile.total_wickets + gameSummary.wickets,
        highest_score: Math.max(profile.highest_score, gameSummary.runs),
        total_balls: profile.total_balls + gameSummary.balls,
        total_fours: profile.total_fours + (gameSummary.fours || 0),
        total_sixes: profile.total_sixes + (gameSummary.sixes || 0),
        win_streak: newWinStreak,
        best_win_streak: bestStreak,
      };

      await this.supabase
        .from('hc_profiles')
        .update(updates)
        .eq('user_id', userId);

      return { winStreak: newWinStreak, bestStreak };
    } catch (err) {
      console.error('Profile update error:', err.message);
      return null;
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

  async getLeaderboardByRuns(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .order('total_runs', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }

  async getLeaderboardByWinRate(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .gte('games_played', 3) // minimum 3 games to qualify
        .limit(50);

      if (error) return [];

      // Sort by win rate
      const sorted = (data || []).sort((a, b) => {
        const rateA = a.games_played > 0 ? a.games_won / a.games_played : 0;
        const rateB = b.games_played > 0 ? b.games_won / b.games_played : 0;
        return rateB - rateA;
      });

      return sorted.slice(0, limit);
    } catch (err) {
      return [];
    }
  }
}

/* ═══════════════════════════════════════════
   💰 Economy Helper — Grant INR rewards
   ═══════════════════════════════════════════ */

async function grantEconomyRewards(supabase, economyRewards) {
  if (!supabase || !economyRewards) return;
  for (const [userId, amount] of Object.entries(economyRewards)) {
    if (userId.startsWith('BOT_') || amount <= 0) continue;
    try {
      // Use the wallet system to add INR
      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from('wallets')
          .update({ balance: wallet.balance + amount })
          .eq('user_id', userId);
      } else {
        await supabase
          .from('wallets')
          .insert({ user_id: userId, balance: amount });
      }
    } catch (err) {
      console.error(`Economy reward error for ${userId}:`, err.message);
    }
  }
}

module.exports = {
  HandCricketGame,
  GAME_PHASE,
  ProfileManager,
  EMOJI_NUMBERS,
  SLEDGE_MESSAGES,
  BOT_PROFILES,
  COMMENTARY_RUNS,
  COMMENTARY_OUT,
  COMMENTARY_TOSS,
  COMMENTARY_INNINGS_BREAK,
  COMMENTARY_GAME_OVER_WIN,
  COMMENTARY_GAME_OVER_TIE,
  ECONOMY,
  MATCH_TURN_TIMEOUT,
  MATCH_INACTIVITY_TIMEOUT,
  grantEconomyRewards,
};
