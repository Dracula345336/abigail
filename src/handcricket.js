/* ═══════════════════════════════════════════
   🏏  Hand Cricket — Indian Childhood Classic!
   (Enhanced with Catch System, Milestones, Strike System,
    Bowling Rotation, Tournaments, Match History & More)

   Game Modes:
     - Single Player: Play against the Bot (hc.play)
     - Multiplayer 1v1: Challenge a friend (hc.challenge)
     - Team Matches: 2v2, 3v3 (hc.team)
     - Tournaments: Bracket-style (hc.tournament)
     - Private Lobbies: Password-protected (hc.lobby)

   Features:
     - Coin Toss (Heads/Tails) + Odd-Even Toss
     - DM-based number selection (1-6) with 30s timer
     - Catch System with diving catches, dropped catches
     - Milestone celebrations (50 runs, 100 runs)
     - Strike/Non-Strike rotation
     - Bowling rotation
     - Customizable Overs & Wickets
     - Real-time score tracking with embeds
     - Same number = OUT!
     - Match Timer with auto-end
     - Funny ball-by-ball commentary
     - Economy rewards (INR)
     - Player Profiles with stats
     - Leaderboards
     - Match History
     - Tournament system
     - Private lobbies
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
     hc.history                      — Match history
     hc.tournament create [name]     — Create tournament
     hc.tournament join [name]       — Join tournament
     hc.tournament start [name]      — Start tournament
     hc.lobby create [password]      — Create private lobby
     hc.lobby join [password]        — Join private lobby

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
const MATCH_TURN_TIMEOUT = 30; // seconds to play a number before auto-out
const MATCH_INACTIVITY_TIMEOUT = 120; // seconds of total inactivity before game auto-ends

/* ── Economy Rewards ── */
const ECONOMY = {
  PLAY_REWARD: 10,
  WIN_BONUS: 50,
  FOUR_BONUS: 5,
  SIX_BONUS: 10,
  DUCK_PENALTY: 0,
  CENTURY_BONUS: 100,
  HATTRICK_BONUS: 30,
  STREAK_WIN_BONUS: 20,
  CATCH_BONUS: 15,
  MILESTONE_50_BONUS: 25,
  MILESTONE_100_BONUS: 50,
};

/* ── Catch System ── */
// Combinations that trigger catch chance: [batNum, bowlNum] → catch probability
const CATCH_COMBOS = {
  '4_3': { chance: 0.30, type: 'edge', fielder: 'slip' },      // Edged to slip
  '6_1': { chance: 0.25, type: 'sky', fielder: 'long_on' },    // Skied to long-on
  '6_5': { chance: 0.35, type: 'boundary', fielder: 'deep_mid' }, // Caught at deep midwicket
  '5_2': { chance: 0.20, type: 'drive', fielder: 'cover' },    // Driven to cover
  '4_1': { chance: 0.15, type: 'cut', fielder: 'point' },      // Cut to point
  '3_6': { chance: 0.25, type: 'pull', fielder: 'fine_leg' },  // Pulled to fine leg
  '2_4': { chance: 0.20, type: 'flick', fielder: 'mid_wicket' }, // Flicked to midwicket
  '5_3': { chance: 0.30, type: 'lofted', fielder: 'long_off' }, // Lofted to long-off
};

const CATCH_COMMENTARY_SUCCESS = [
  '🧤 WHAT A CATCH! That was stunning! The fielder flew like Superman!',
  '🤯 CAUGHT! Unbelievable grab! The crowd goes absolutely ballistic!',
  '💪 DIVING CATCH! Full stretch and taken! Poetry in motion!',
  '🔥 ONE-HANDED WONDER! How did they even catch that?!',
  '🎯 CAUGHT AND BOWLED! The bowler takes it themselves!',
  '😭 GONE! The fielder makes no mistake! What a grab!',
  '🌟 SENSATIONAL! That catch will be on highlight reels forever!',
  '🦅 SOARING EAGLE! The fielder plucked it out of thin air!',
  '📸 Picture perfect catch! That one is framed on the wall!',
  '🎪 CIRCUS CATCH! The acrobatics were unbelievable!',
];

const CATCH_COMMENTARY_DROPPED = [
  '😰 DROPPED! Oh no! The fielder put it down! What a let-off!',
  '😱 SHELL SHOCKED! How did they drop that?! The batter survives!',
  '💥 DROPPED CATCH! The fielder will have nightmares about that!',
  '😅 ESCAPED! The ball went through the hands! Lucky batter!',
  '🤦 WHAT A HOWLER! That should have been caught! Dropped!',
  '😬 BUTTER FINGERS! The fielder can\'t believe they dropped it!',
  '🎉 SURVIVES! The catch goes down and the batter lives to fight another ball!',
  '🙈 GIFT HORSE! The fielder had it and dropped it! What a let-off!',
  '😤 COSTLY DROP! That could come back to haunt them!',
  '🫣 OH MY! The simplest of chances and it\'s DROPPED!',
];

const CATCH_DIVE_COMMENTARY = [
  '🤿 DIVING EFFORT! The fielder launches themselves through the air!',
  '🏃 SPRINTING CATCH! The fielder covered incredible ground!',
  '🌊 SLIDING CATCH! The fielder slides and just gets there!',
  '✈️ AIRBORNE! The fielder is literally flying to take this!',
];

/* ── Milestone Celebrations ── */
const MILESTONES = {
  HALF_CENTURY: 50,
  CENTURY: 100,
  DOUBLE_CENTURY: 200,
};

// GIF URLs for celebrations (using known cricket GIF URLs)
const CELEBRATION_GIFS = {
  fifty: [
    'https://media.tenor.com/vJx5Ml6O7XEAAAAC/virat-kohli-celebration.gif',
    'https://media.tenor.com/4nMPKFE9WQ4AAAAC/cricket-fifty.gif',
    'https://media.tenor.com/dHkWxXEQ4QAAAAC/virat-kohli-fifty.gif',
    'https://media.tenor.com/N3qI-7Xv7qoAAAAC/kohli-celebration.gif',
  ],
  century: [
    'https://media.tenor.com/3LpFGf6Y1YkAAAAC/virat-kohli-century.gif',
    'https://media.tenor.com/bOOa8VfN0TMAAAAC/kohli-hundred-celebration.gif',
    'https://media.tenor.com/7vPz0BqXv_kAAAAC/cricket-century-bat.gif',
    'https://media.tenor.com/FIYvE1hq0mUAAAAC/virat-kohli-100.gif',
  ],
  wicket: [
    'https://media.tenor.com/0a8R1OqB7JIAAAAC/cricket-wicket-bowled.gif',
    'https://media.tenor.com/9hJ3HqvDxnMAAAAC/cricket-out.gif',
    'https://media.tenor.com/JWQmHlGkZSMAAAAC/bowled-cricket.gif',
  ],
  six: [
    'https://media.tenor.com/aKqFr0g7oFMAAAAC/cricket-six-hit.gif',
    'https://media.tenor.com/7HKDYbFi8XIAAAAC/sixer-cricket.gif',
    'https://media.tenor.com/Z5qwQj0QbLkAAAAC/six-cricket-boundary.gif',
  ],
  four: [
    'https://media.tenor.com/bXGYmEkX-54AAAAC/cricket-four-boundary.gif',
    'https://media.tenor.com/q9sGfYe5J5sAAAAC/four-cricket-cover-drive.gif',
  ],
  catch: [
    'https://media.tenor.com/GCWfVjMqFxwAAAAC/cricket-catch-diving.gif',
    'https://media.tenor.com/FqyXVEHs7E4AAAAC/amazing-catch-cricket.gif',
  ],
  matchWin: [
    'https://media.tenor.com/HYbJwG1DKYoAAAAC/cricket-celebration-win.gif',
    'https://media.tenor.com/tMJBqGqHB2EAAAAC/team-celebration-cricket.gif',
  ],
};

const MILESTONE_MESSAGES = {
  fifty: [
    '🏆 **HALF CENTURY!** What a knock! The crowd is on their feet!',
    '🔥 **FIFTY!** The batter reaches the milestone! Outstanding innings!',
    '⭐ **50 RUNS!** Halfway to glory! What a player!',
    '🏏 **FIFTY UP!** Class act! The bowlers have no answer!',
  ],
  century: [
    '👑 **CENTURY!** 100 RUNS! The stadium erupts! Absolute legend!',
    '🚀 **HUNDRED!** Take a bow! What an absolute masterclass!',
    '💎 **100 RUNS!** The batter has reached three figures! Incredible!',
    '🎯 **CENTURY!** History in the making! Unbelievable batting!',
  ],
  doubleCentury: [
    '🌟 **DOUBLE CENTURY!** 200 RUNS! This is legendary stuff!',
    '🔱 **200!** Unbelievable! The batter is unstoppable!',
  ],
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
  { name: '🤖 PaceDemon', style: 'aggressive' },
  { name: '🤖 CoolRunner', style: 'balanced' },
  { name: '🤖 SixMachine', style: 'aggressive' },
];

/* ── Bot AI ── */
function getBotNumber(style, playerHistory = [], currentBall = 0) {
  if (playerHistory.length >= 3) {
    const recent = playerHistory.slice(-3);
    const mostCommon = recent.sort((a, b) =>
      recent.filter(v => v === b).length - recent.filter(v => v === a).length
    )[0];

    if (style === 'aggressive' && Math.random() < 0.4) {
      return mostCommon;
    }
    if (style === 'defensive' && Math.random() < 0.3) {
      return mostCommon;
    }
  }

  switch (style) {
    case 'aggressive':
      return [1, 2, 3, 4, 5, 6][Math.floor(Math.random() * 6)];
    case 'defensive':
      return [1, 1, 2, 2, 3, 4][Math.floor(Math.random() * 6)];
    default:
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

    // Strike/Non-Strike System
    this.striker = null;       // Current striker (facing the ball)
    this.nonStriker = null;    // Non-striker at the other end
    this.strikeRotated = false;

    // Bowling Rotation
    this.bowlerOrder = [];     // Queue of bowlers
    this.currentBowlerIdx = 0;
    this.bowlerStats = {};     // Track each bowler's stats
    this.ballsThisOver = 0;    // Balls bowled in current over
    this.currentOverBowler = null;

    // Score
    this.scores = {};
    this.scores[player1Id] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0, catches: 0, ducks: 0 };
    this.scores[player2Id] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0, catches: 0, ducks: 0 };

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

    // Catch tracking
    this.catchChances = 0;
    this.catchesTaken = 0;
    this.catchesDropped = 0;

    // Milestone tracking
    this.milestonesReached = []; // Track which milestones have been shown

    // Match Timer
    this.lastActivity = Date.now();
    this.turnTimer = null;
    this.inactivityTimer = null;
    this.turnStartTime = null;

    // Commentary
    this.lastCommentary = '';

    // Match ID for history
    this.matchId = `HC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.startTime = Date.now();
    this.endTime = null;

    // 30-second DM selection window tracking
    this.selectionWindow = null;
    this.selectionDeadline = null;
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
    if (this.selectionWindow) { clearTimeout(this.selectionWindow); this.selectionWindow = null; }
  }

  /**
   * Start turn timer — 30 second window for BOTH players to choose
   */
  startTurnTimer(onTurnTimeout, onInactivityTimeout) {
    this.clearTimers();
    this.turnStartTime = Date.now();
    this.lastActivity = Date.now();
    this.selectionDeadline = Date.now() + (MATCH_TURN_TIMEOUT * 1000);

    // Turn timer: auto-out if player doesn't respond within 30s
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

    // Initialize strike/non-strike
    this.striker = this.battingNow;
    this.nonStriker = this.bowlingNow;

    // Initialize bowling rotation
    this.bowlerOrder = [this.bowlingNow];
    this.currentBowlerIdx = 0;
    this.currentOverBowler = this.bowlingNow;
    this.ballsThisOver = 0;

    // Initialize bowler stats
    this.bowlerStats[this.bowlingNow] = { balls: 0, runs: 0, wickets: 0, overs: 0 };

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
     🧤 CATCH SYSTEM
     ═══════════════════════════════════════════ */

  /**
   * Check if a catch chance is triggered for this ball
   * Returns catch result or null if no catch triggered
   */
  checkCatchChance(batNum, bowlNum) {
    const key = `${batNum}_${bowlNum}`;
    const combo = CATCH_COMBOS[key];

    if (!combo) return null;

    // Roll for catch
    const catchRoll = Math.random();
    if (catchRoll > combo.chance) {
      // No catch triggered this time
      return null;
    }

    this.catchChances++;

    // Determine if catch is successful (70% success, 30% dropped)
    const catchSuccess = Math.random() < 0.70;

    // Determine if it's a diving catch (40% of catch chances)
    const isDiving = Math.random() < 0.40;

    if (catchSuccess) {
      this.catchesTaken++;
      return {
        triggered: true,
        success: true,
        isDiving,
        fielder: combo.fielder,
        type: combo.type,
        commentary: CATCH_COMMENTARY_SUCCESS[Math.floor(Math.random() * CATCH_COMMENTARY_SUCCESS.length)],
        diveCommentary: isDiving ? CATCH_DIVE_COMMENTARY[Math.floor(Math.random() * CATCH_DIVE_COMMENTARY.length)] : null,
      };
    } else {
      this.catchesDropped++;
      return {
        triggered: true,
        success: false,
        isDiving,
        fielder: combo.fielder,
        type: combo.type,
        commentary: CATCH_COMMENTARY_DROPPED[Math.floor(Math.random() * CATCH_COMMENTARY_DROPPED.length)],
        diveCommentary: isDiving ? CATCH_DIVE_COMMENTARY[Math.floor(Math.random() * CATCH_DIVE_COMMENTARY.length)] : null,
      };
    }
  }

  /* ═══════════════════════════════════════════
     🏆 MILESTONE CHECKER
     ═══════════════════════════════════════════ */

  /**
   * Check if the batsman has reached a milestone
   * Returns milestone info or null
   */
  checkMilestone(batsmanId, currentRuns) {
    const milestones = [];

    // Check half century (50 runs)
    if (currentRuns >= MILESTONES.HALF_CENTURY && !this.milestonesReached.includes(`${batsmanId}_50`)) {
      this.milestonesReached.push(`${batsmanId}_50`);
      const gif = CELEBRATION_GIFS.fifty[Math.floor(Math.random() * CELEBRATION_GIFS.fifty.length)];
      const msg = MILESTONE_MESSAGES.fifty[Math.floor(Math.random() * MILESTONE_MESSAGES.fifty.length)];
      milestones.push({
        type: 'fifty',
        runs: MILESTONES.HALF_CENTURY,
        message: msg,
        gif,
        economyBonus: ECONOMY.MILESTONE_50_BONUS,
      });
    }

    // Check century (100 runs)
    if (currentRuns >= MILESTONES.CENTURY && !this.milestonesReached.includes(`${batsmanId}_100`)) {
      this.milestonesReached.push(`${batsmanId}_100`);
      const gif = CELEBRATION_GIFS.century[Math.floor(Math.random() * CELEBRATION_GIFS.century.length)];
      const msg = MILESTONE_MESSAGES.century[Math.floor(Math.random() * MILESTONE_MESSAGES.century.length)];
      milestones.push({
        type: 'century',
        runs: MILESTONES.CENTURY,
        message: msg,
        gif,
        economyBonus: ECONOMY.MILESTONE_100_BONUS,
      });
    }

    // Check double century (200 runs)
    if (currentRuns >= MILESTONES.DOUBLE_CENTURY && !this.milestonesReached.includes(`${batsmanId}_200`)) {
      this.milestonesReached.push(`${batsmanId}_200`);
      const gif = CELEBRATION_GIFS.century[Math.floor(Math.random() * CELEBRATION_GIFS.century.length)];
      const msg = MILESTONE_MESSAGES.doubleCentury[Math.floor(Math.random() * MILESTONE_MESSAGES.doubleCentury.length)];
      milestones.push({
        type: 'double_century',
        runs: MILESTONES.DOUBLE_CENTURY,
        message: msg,
        gif,
        economyBonus: ECONOMY.MILESTONE_100_BONUS * 2,
      });
    }

    return milestones.length > 0 ? milestones : null;
  }

  /* ═══════════════════════════════════════════
     🔄 STRIKE ROTATION
     ═══════════════════════════════════════════ */

  /**
   * Rotate strike — happens on odd runs and at end of over
   */
  rotateStrike(runsScored) {
    // Rotate on odd runs
    if (runsScored % 2 !== 0) {
      const temp = this.striker;
      this.striker = this.nonStriker;
      this.nonStriker = temp;
      this.strikeRotated = true;
    } else {
      this.strikeRotated = false;
    }
  }

  /* ═══════════════════════════════════════════
     🎯 BOWLING ROTATION
     ═══════════════════════════════════════════ */

  /**
   * Update bowling rotation at end of over
   */
  updateBowlingRotation() {
    this.ballsThisOver = 0;

    // For 1v1 games, there's only one bowler, so no rotation needed
    if (this.bowlerOrder.length <= 1) return;

    // Move to next bowler
    this.currentBowlerIdx = (this.currentBowlerIdx + 1) % this.bowlerOrder.length;
    this.currentOverBowler = this.bowlerOrder[this.currentBowlerIdx];
    this.bowlingNow = this.currentOverBowler;

    // Update bowler overs
    if (this.bowlerStats[this.bowlingNow]) {
      this.bowlerStats[this.bowlingNow].overs++;
    }
  }

  /* ═══════════════════════════════════════════
     🏏 GAMEPLAY
     ═══════════════════════════════════════════ */

  /**
   * Submit play number (DM) — 1-6 during gameplay
   * Both batter AND bowler choose simultaneously within 30 seconds
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
        const isBotBatting = this.battingNow === botId;
        const style = this.botProfile?.style || 'balanced';

        if (isBotBatting) {
          const botNum = getBotNumber(style, this.playerHistory, this.scores[botId].balls);
          this.currentNumbers[botId] = botNum;
        } else {
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
   * Includes catch system and milestone checking
   */
  resolveBall(batNum, bowlNum) {
    const batsman = this.battingNow;
    const bowler = this.bowlingNow;
    const isOut = batNum === bowlNum;

    this.currentNumbers = {};
    this.scores[batsman].balls++;
    this.ballsThisOver++;

    // Update bowler stats
    if (this.bowlerStats[bowler]) {
      this.bowlerStats[bowler].balls++;
    }

    // Log the ball
    this.ballLog.push({
      innings: this.currentInnings,
      ball: this.scores[batsman].balls,
      batNum,
      bowlNum,
      runs: isOut ? 0 : batNum,
      out: isOut,
      catchAttempt: false,
      catchSuccess: false,
    });

    let commentary = '';
    let catchResult = null;
    let milestoneResults = null;
    let catchOut = false;

    if (isOut) {
      this.scores[batsman].wickets++;
      this.consecutiveWickets++;

      // Track duck
      if (this.scores[batsman].runs === 0) {
        this.scores[batsman].ducks++;
      }

      // Update bowler wicket stats
      if (this.bowlerStats[bowler]) {
        this.bowlerStats[bowler].wickets++;
      }

      commentary = COMMENTARY_OUT[Math.floor(Math.random() * COMMENTARY_OUT.length)];
    } else {
      // Check for catch chance BEFORE scoring runs
      catchResult = this.checkCatchChance(batNum, bowlNum);

      if (catchResult && catchResult.success) {
        // Successful catch = OUT!
        catchOut = true;
        this.scores[batsman].wickets++;
        this.scores[batsman].catches++;
        this.consecutiveWickets++;

        // Update bowler wicket stats
        if (this.bowlerStats[bowler]) {
          this.bowlerStats[bowler].wickets++;
        }

        // Update ball log
        this.ballLog[this.ballLog.length - 1].out = true;
        this.ballLog[this.ballLog.length - 1].catchAttempt = true;
        this.ballLog[this.ballLog.length - 1].catchSuccess = true;

        const diveStr = catchResult.isDiving ? ` ${catchResult.diveCommentary}` : '';
        commentary = `${diveStr} ${catchResult.commentary}`;
      } else if (catchResult && !catchResult.success) {
        // Dropped catch — batter survives and scores runs
        this.consecutiveWickets = 0;
        this.scores[batsman].runs += batNum;
        if (batNum === 4) this.scores[batsman].fours++;
        if (batNum === 6) this.scores[batsman].sixes++;

        // Update bowler runs conceded
        if (this.bowlerStats[bowler]) {
          this.bowlerStats[bowler].runs += batNum;
        }

        // Strike rotation on runs scored
        this.rotateStrike(batNum);

        // Check milestones
        milestoneResults = this.checkMilestone(batsman, this.scores[batsman].runs);

        const diveStr = catchResult.isDiving ? ` ${catchResult.diveCommentary}` : '';
        const runsCommentary = (COMMENTARY_RUNS[batNum] || [])[Math.floor(Math.random() * (COMMENTARY_RUNS[batNum] || ['🏏 Runs scored!']).length)] || '🏏 Runs scored!';
        commentary = `${diveStr} ${catchResult.commentary}\n${runsCommentary}`;

        // Update ball log
        this.ballLog[this.ballLog.length - 1].catchAttempt = true;
        this.ballLog[this.ballLog.length - 1].catchSuccess = false;
      } else {
        // Normal play — no catch triggered
        this.consecutiveWickets = 0;
        this.scores[batsman].runs += batNum;
        if (batNum === 4) this.scores[batsman].fours++;
        if (batNum === 6) this.scores[batsman].sixes++;

        // Update bowler runs conceded
        if (this.bowlerStats[bowler]) {
          this.bowlerStats[bowler].runs += batNum;
        }

        // Strike rotation on runs scored
        this.rotateStrike(batNum);

        // Check milestones
        milestoneResults = this.checkMilestone(batsman, this.scores[batsman].runs);

        commentary = (COMMENTARY_RUNS[batNum] || [])[Math.floor(Math.random() * (COMMENTARY_RUNS[batNum] || ['🏏 Runs scored!']).length)] || '🏏 Runs scored!';
      }
    }

    // Check bowling rotation at end of over
    if (this.ballsThisOver >= 6) {
      this.updateBowlingRotation();
    }

    this.lastCommentary = commentary;

    let result;

    if (isOut || catchOut) {
      const outType = catchOut ? 'catch_out' : 'out';
      result = {
        success: true,
        message: outType,
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
        isCatchOut: catchOut,
        catchResult: catchOut ? catchResult : null,
        milestoneResults,
        isDuck: this.scores[batsman].runs === 0 && this.scores[batsman].balls === 1,
      };

      // Get appropriate GIF for wicket
      result.gif = CELEBRATION_GIFS.wicket[Math.floor(Math.random() * CELEBRATION_GIFS.wicket.length)];
      if (catchOut) {
        result.gif = CELEBRATION_GIFS.catch[Math.floor(Math.random() * CELEBRATION_GIFS.catch.length)];
      }

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
        milestoneResults,
        catchDropped: catchResult && !catchResult.success,
        catchResult: catchResult && !catchResult.success ? catchResult : null,
        strikeRotated: this.strikeRotated,
      };

      // Get GIF for boundaries
      if (batNum === 6) {
        result.gif = CELEBRATION_GIFS.six[Math.floor(Math.random() * CELEBRATION_GIFS.six.length)];
      } else if (batNum === 4) {
        result.gif = CELEBRATION_GIFS.four[Math.floor(Math.random() * CELEBRATION_GIFS.four.length)];
      }

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
          result.gif = CELEBRATION_GIFS.matchWin[Math.floor(Math.random() * CELEBRATION_GIFS.matchWin.length)];
        }
      }

      if (!result.gameOver && this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    }

    // Calculate economy rewards for this ball
    result.economyBonus = this.calculateBallEconomy(batNum, isOut || catchOut);

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

    if (winnerId) {
      rewards[winnerId] += ECONOMY.WIN_BONUS;
    }

    for (const pid of this.players) {
      if (!pid.startsWith('BOT_')) {
        rewards[pid] += (this.scores[pid].fours || 0) * ECONOMY.FOUR_BONUS;
        rewards[pid] += (this.scores[pid].sixes || 0) * ECONOMY.SIX_BONUS;
        rewards[pid] += (this.scores[pid].catches || 0) * ECONOMY.CATCH_BONUS;

        // Century bonus
        if (this.scores[pid].runs >= 36) {
          rewards[pid] += ECONOMY.CENTURY_BONUS;
        }
        // Half century bonus
        if (this.scores[pid].runs >= 50) {
          rewards[pid] += ECONOMY.MILESTONE_50_BONUS;
        }
        // Full century bonus
        if (this.scores[pid].runs >= 100) {
          rewards[pid] += ECONOMY.MILESTONE_100_BONUS;
        }
      }
    }

    // Add milestone bonuses that were tracked
    for (const milestone of this.milestonesReached) {
      const [pid] = milestone.split('_');
      if (!pid.startsWith('BOT_') && rewards[pid] !== undefined) {
        const runThreshold = parseInt(milestone.split('_')[1]);
        if (runThreshold === 50) rewards[pid] += ECONOMY.MILESTONE_50_BONUS;
        if (runThreshold === 100) rewards[pid] += ECONOMY.MILESTONE_100_BONUS;
        if (runThreshold === 200) rewards[pid] += ECONOMY.MILESTONE_100_BONUS * 2;
      }
    }

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

      // Reset strike/non-strike for new innings
      this.striker = this.battingNow;
      this.nonStriker = this.bowlingNow;

      // Reset bowling rotation for new innings
      this.bowlerOrder = [this.bowlingNow];
      this.currentBowlerIdx = 0;
      this.currentOverBowler = this.bowlingNow;
      this.ballsThisOver = 0;
      this.bowlerStats[this.bowlingNow] = { balls: 0, runs: 0, wickets: 0, overs: 0 };

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
      this.endTime = Date.now();
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

    const battingPlayed = this.currentNumbers[this.battingNow] !== undefined;
    const bowlingPlayed = this.currentNumbers[this.bowlingNow] !== undefined;

    let timedOutPlayer;
    if (!battingPlayed && !bowlingPlayed) {
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
    this.endTime = Date.now();

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
    this.endTime = Date.now();
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
   * Get formatted scorecard with enhanced stats
   */
  getFormattedScorecard(playerNames) {
    const p1 = this.scores[this.players[0]];
    const p2 = this.scores[this.players[1]];
    const p1Name = playerNames[this.players[0]] || 'Player 1';
    const p2Name = playerNames[this.players[1]] || 'Player 2';

    const formatScore = (s) => {
      const overs = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
      const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
      return `${s.runs}/${s.wickets} (${overs} ov) | SR: ${sr} | 4s: ${s.fours} | 6s: ${s.sixes} | Catches: ${s.catches || 0}`;
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
      catches: score.catches || 0,
      overs: `${Math.floor(score.balls / 6)}.${score.balls % 6}`,
      won,
    };
  }

  /**
   * Get match history entry
   */
  getMatchHistory() {
    return {
      matchId: this.matchId,
      players: this.players.map(p => p.startsWith('BOT_') ? (this.botProfile?.name || 'Bot') : p),
      scores: {
        [this.players[0]]: { ...this.scores[this.players[0]] },
        [this.players[1]]: { ...this.scores[this.players[1]] },
      },
      winner: this.getWinner(),
      overs: this.maxOvers,
      wickets: this.maxWickets,
      startTime: this.startTime,
      endTime: this.endTime || Date.now(),
      catchChances: this.catchChances,
      catchesTaken: this.catchesTaken,
      catchesDropped: this.catchesDropped,
      milestones: this.milestonesReached,
      ballLog: this.ballLog.slice(-20), // Last 20 balls only for history
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

  /**
   * Get selection deadline remaining time
   */
  getSelectionTimeRemaining() {
    if (!this.selectionDeadline) return null;
    const remaining = (this.selectionDeadline - Date.now()) / 1000;
    return Math.max(0, Math.floor(remaining));
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
        if (data.username !== username && username) {
          await this.supabase
            .from('hc_profiles')
            .update({ username })
            .eq('user_id', userId);
          data.username = username;
        }
        return data;
      }

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
          total_catches: 0,
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
        total_catches: (profile.total_catches || 0) + (gameSummary.catches || 0),
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

  async saveMatchHistory(matchHistory) {
    if (!this.supabase) return;
    try {
      await this.supabase
        .from('hc_match_history')
        .insert({
          match_id: matchHistory.matchId,
          players: matchHistory.players,
          scores: matchHistory.scores,
          winner: matchHistory.winner,
          overs: matchHistory.overs,
          wickets: matchHistory.wickets,
          start_time: new Date(matchHistory.startTime).toISOString(),
          end_time: new Date(matchHistory.endTime).toISOString(),
          catch_chances: matchHistory.catchChances,
          catches_taken: matchHistory.catchesTaken,
          catches_dropped: matchHistory.catchesDropped,
          milestones: matchHistory.milestones,
        });
    } catch (err) {
      console.error('Match history save error:', err.message);
    }
  }

  async getMatchHistory(userId, limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_match_history')
        .select('*')
        .contains('players', [userId])
        .order('start_time', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
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
        .gte('games_played', 3)
        .limit(50);

      if (error) return [];

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
   🏟️ Tournament System
   ═══════════════════════════════════════════ */

class TournamentManager {
  constructor() {
    this.tournaments = new Map(); // tournamentName → Tournament
  }

  create(name, creatorId, channelId, guildId, options = {}) {
    if (this.tournaments.has(name)) {
      return { success: false, message: '🚫 A tournament with that name already exists!' };
    }

    const tournament = {
      name,
      creatorId,
      channelId,
      guildId,
      players: [creatorId],
      bracket: [],
      currentRound: 0,
      maxPlayers: options.maxPlayers || 8,
      overs: options.overs || 1,
      wickets: options.wickets || 2,
      status: 'registration', // registration, in_progress, completed
      winner: null,
      createdAt: Date.now(),
    };

    this.tournaments.set(name, tournament);
    return { success: true, tournament };
  }

  join(name, userId) {
    const tournament = this.tournaments.get(name);
    if (!tournament) return { success: false, message: '🚫 Tournament not found!' };
    if (tournament.status !== 'registration') return { success: false, message: '🚫 Registration is closed!' };
    if (tournament.players.includes(userId)) return { success: false, message: '🚫 You already joined!' };
    if (tournament.players.length >= tournament.maxPlayers) return { success: false, message: '🚫 Tournament is full!' };

    tournament.players.push(userId);
    return { success: true, playerCount: tournament.players.length, maxPlayers: tournament.maxPlayers };
  }

  leave(name, userId) {
    const tournament = this.tournaments.get(name);
    if (!tournament) return { success: false, message: '🚫 Tournament not found!' };
    if (tournament.status !== 'registration') return { success: false, message: '🚫 Cannot leave — tournament already started!' };
    if (!tournament.players.includes(userId)) return { success: false, message: '🚫 You are not in this tournament!' };
    if (userId === tournament.creatorId) return { success: false, message: '🚫 The creator cannot leave! Use delete instead.' };

    tournament.players = tournament.players.filter(p => p !== userId);
    return { success: true, playerCount: tournament.players.length };
  }

  start(name) {
    const tournament = this.tournaments.get(name);
    if (!tournament) return { success: false, message: '🚫 Tournament not found!' };
    if (tournament.status !== 'registration') return { success: false, message: '🚫 Tournament already started!' };
    if (tournament.players.length < 2) return { success: false, message: '🚫 Need at least 2 players!' };

    // Check if player count is power of 2, if not fill with byes
    let playerCount = tournament.players.length;
    // Shuffle players
    tournament.players = tournament.players.sort(() => Math.random() - 0.5);

    // Create bracket
    tournament.bracket = [];
    const numRounds = Math.ceil(Math.log2(playerCount));
    let currentRound = [];

    for (let i = 0; i < tournament.players.length; i += 2) {
      const match = {
        player1: tournament.players[i],
        player2: tournament.players[i + 1] || null, // null = bye
        winner: null,
        round: 1,
      };
      currentRound.push(match);
    }

    tournament.bracket.push(currentRound);
    tournament.currentRound = 1;
    tournament.status = 'in_progress';

    return { success: true, tournament, numRounds, firstRoundMatches: currentRound };
  }

  getTournament(name) {
    return this.tournaments.get(name);
  }

  delete(name, userId) {
    const tournament = this.tournaments.get(name);
    if (!tournament) return { success: false, message: '🚫 Tournament not found!' };
    if (tournament.creatorId !== userId) return { success: false, message: '🚫 Only the creator can delete!' };
    this.tournaments.delete(name);
    return { success: true };
  }

  list() {
    const list = [];
    for (const [name, t] of this.tournaments) {
      list.push({
        name,
        players: t.players.length,
        maxPlayers: t.maxPlayers,
        status: t.status,
        creator: t.creatorId,
      });
    }
    return list;
  }
}

/* ═══════════════════════════════════════════
   🔒 Private Lobby System
   ═══════════════════════════════════════════ */

class LobbyManager {
  constructor() {
    this.lobbies = new Map(); // lobbyCode → Lobby
  }

  create(creatorId, channelId, guildId, password = null) {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const lobby = {
      code,
      creatorId,
      channelId,
      guildId,
      password,
      players: [creatorId],
      maxPlayers: 2,
      overs: 1,
      wickets: 2,
      status: 'waiting', // waiting, playing
      createdAt: Date.now(),
    };

    this.lobbies.set(code, lobby);
    return { success: true, code, lobby };
  }

  join(code, userId, password = null) {
    const lobby = this.lobbies.get(code);
    if (!lobby) return { success: false, message: '🚫 Lobby not found! Check the code.' };
    if (lobby.password && lobby.password !== password) return { success: false, message: '🚫 Wrong password!' };
    if (lobby.players.includes(userId)) return { success: false, message: '🚫 You are already in this lobby!' };
    if (lobby.players.length >= lobby.maxPlayers) return { success: false, message: '🚫 Lobby is full!' };
    if (lobby.status !== 'waiting') return { success: false, message: '🚫 Game already in progress!' };

    lobby.players.push(userId);
    return { success: true, lobby };
  }

  leave(code, userId) {
    const lobby = this.lobbies.get(code);
    if (!lobby) return { success: false, message: '🚫 Lobby not found!' };
    if (!lobby.players.includes(userId)) return { success: false, message: '🚫 You are not in this lobby!' };

    lobby.players = lobby.players.filter(p => p !== userId);
    if (lobby.players.length === 0) {
      this.lobbies.delete(code);
      return { success: true, deleted: true };
    }
    if (lobby.creatorId === userId) {
      lobby.creatorId = lobby.players[0];
    }
    return { success: true };
  }

  getLobby(code) {
    return this.lobbies.get(code);
  }

  getByPlayer(userId) {
    for (const [code, lobby] of this.lobbies) {
      if (lobby.players.includes(userId)) return { code, lobby };
    }
    return null;
  }

  delete(code) {
    this.lobbies.delete(code);
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
  TournamentManager,
  LobbyManager,
  EMOJI_NUMBERS,
  SLEDGE_MESSAGES,
  BOT_PROFILES,
  COMMENTARY_RUNS,
  COMMENTARY_OUT,
  COMMENTARY_TOSS,
  COMMENTARY_INNINGS_BREAK,
  COMMENTARY_GAME_OVER_WIN,
  COMMENTARY_GAME_OVER_TIE,
  CATCH_COMBOS,
  CATCH_COMMENTARY_SUCCESS,
  CATCH_COMMENTARY_DROPPED,
  CELEBRATION_GIFS,
  MILESTONE_MESSAGES,
  ECONOMY,
  MATCH_TURN_TIMEOUT,
  MATCH_INACTIVITY_TIMEOUT,
  grantEconomyRewards,
};
