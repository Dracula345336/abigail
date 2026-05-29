/* ═══════════════════════════════════════════
   🏏  Hand Cricket — Indian Childhood Classic!
   (Modern Button-Based Interactive Edition)

   Game Modes:
     - Single Player: Play against the Bot
     - Multiplayer 1v1: Challenge a friend
     - Tournaments: Bracket-style
     - Private Lobbies: Password-protected
     - Ranked: MMR-based matchmaking
     - Super Over: Tiebreaker

   Features:
     - Interactive BUTTONS for all gameplay
     - Coin Toss (Heads/Tails) + Odd-Even Toss
     - Channel-based number selection via buttons (no DM needed)
     - Catch System with diving catches, dropped catches
     - Interactive catch action buttons
     - Milestone celebrations with GIFs
     - Strike/Non-Strike rotation
     - Bowling rotation
     - Powerplay mode
     - Super Over tiebreaker
     - Ranked/MMR system
     - Customizable Overs & Wickets
     - Real-time score tracking with dark embeds
     - Same number = OUT!
     - Match Timer with auto-end
     - Funny ball-by-ball commentary
     - Economy rewards (INR)
     - Player Profiles with stats & ranks
     - Leaderboards (Global + Server)
     - Match History
     - Tournament system
     - Private lobbies
     - Sledge your friends
     - Rematch system
     - Slash commands + Button interactions
   ═══════════════════════════════════════════ */

const { EmbedBuilder } = require('discord.js');

const GAME_PHASE = {
  WAITING: 'waiting',
  TOSS: 'toss',
  TOSS_CHOICE: 'toss_choice',
  PLAYING: 'playing',
  CATCH_ACTION: 'catch_action',
  INNINGS_BREAK: 'innings_break',
  SUPER_OVER_TOSS: 'super_over_toss',
  ENDED: 'ended',
};

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

/* ── Dark Theme Colors ── */
const COLORS = {
  PRIMARY: 0x1a1a2e,      // Dark navy
  SECONDARY: 0x16213e,    // Deep blue
  ACCENT: 0x0f3460,       // Blue accent
  SUCCESS: 0x00b894,      // Green
  DANGER: 0xe94560,       // Red accent
  WARNING: 0xf39c12,      // Orange
  GOLD: 0xffd700,         // Gold
  PURPLE: 0x6c5ce7,       // Purple
  CRICKET: 0x00cec9,      // Teal
  SIX: 0xff6b6b,          // Bright red
  FOUR: 0xfeca57,         // Yellow
  CATCH: 0xa29bfe,        // Lavender
  WICKET: 0xe17055,       // Coral
  MILESTONE: 0xfdcb6e,    // Light gold
  BROADCAST: 0x2d3436,    // Dark broadcast
};

/* ── Match Timer Settings ── */
const MATCH_TURN_TIMEOUT = 30;
const MATCH_INACTIVITY_TIMEOUT = 120;

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
  POWERPLAY_BONUS: 5,
  RANKED_WIN_BONUS: 30,
  SUPER_OVER_BONUS: 20,
};

/* ── MMR / Ranked System ── */
const MMR = {
  STARTING: 1000,
  WIN_GAIN: 25,
  LOSS_LOSS: 20,
  UPSET_BONUS: 10,
  TIERS: [
    { name: '🥉 Bronze', min: 0, max: 999 },
    { name: '🥈 Silver', min: 1000, max: 1199 },
    { name: '🥇 Gold', min: 1200, max: 1399 },
    { name: '💎 Platinum', min: 1400, max: 1599 },
    { name: '👑 Diamond', min: 1600, max: 1899 },
    { name: '🏆 Master', min: 1900, max: 2199 },
    { name: '🌟 Grandmaster', min: 2200, max: 99999 },
  ],
};

/* ── Catch System ── */
const CATCH_COMBOS = {
  '4_3': { chance: 0.30, type: 'edge', fielder: 'slip' },
  '6_1': { chance: 0.25, type: 'sky', fielder: 'long_on' },
  '6_5': { chance: 0.35, type: 'boundary', fielder: 'deep_mid' },
  '5_2': { chance: 0.20, type: 'drive', fielder: 'cover' },
  '4_1': { chance: 0.15, type: 'cut', fielder: 'point' },
  '3_6': { chance: 0.25, type: 'pull', fielder: 'fine_leg' },
  '2_4': { chance: 0.20, type: 'flick', fielder: 'mid_wicket' },
  '5_3': { chance: 0.30, type: 'lofted', fielder: 'long_off' },
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
  '⚡ Absolute blinder! The crowd can\'t believe what they just saw!',
  '🔥 That was Kohli-level fielding! Incredible stuff!',
  '🔥 Kohli at covers! What a catch! King of fielding!',
  '💪 Jadeja-style catch! Sir RJ does it again!',
  '⚡ Suresh Raina at slip! Caught! Gone!',
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
  '💀 That drop could cost them the match! Pressure getting to them!',
  '😱 The fielder had it in their hands and it slipped! Heartbreak!',
];

const CATCH_DIVE_COMMENTARY = [
  '🤿 DIVING EFFORT! The fielder launches themselves through the air!',
  '🏃 SPRINTING CATCH! The fielder covered incredible ground!',
  '🌊 SLIDING CATCH! The fielder slides and just gets there!',
  '✈️ AIRBORNE! The fielder is literally flying to take this!',
  '🦅 Full stretch dive! The crowd holds its breath!',
];

/* ── Milestone Celebrations ── */
const MILESTONES = {
  HALF_CENTURY: 50,
  CENTURY: 100,
  DOUBLE_CENTURY: 200,
};

// GIF URLs for celebrations
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
  dhoni: [
    'https://media.tenor.com/dhoni-celebration.gif',
    'https://media.tenor.com/dhoni-six-finisher.gif',
  ],
  rohit: [
    'https://media.tenor.com/rohit-sharma-century.gif',
    'https://media.tenor.com/rohit-sharma-six.gif',
  ],
  kohli: [
    'https://media.tenor.com/vJx5Ml6O7XEAAAAC/virat-kohli-celebration.gif',
    'https://media.tenor.com/N3qI-7Xv7qoAAAAC/kohli-celebration.gif',
  ],
};

const MILESTONE_MESSAGES = {
  fifty: [
    '🏆 **HALF CENTURY!** What a knock! The crowd is on their feet!',
    '🔥 **FIFTY!** The batter reaches the milestone! Outstanding innings!',
    '⭐ **50 RUNS!** Halfway to glory! What a player!',
    '🏏 **FIFTY UP!** Class act! The bowlers have no answer!',
    '💪 **50!** Kohli would be proud of that innings!',
    '👑 **FIFTY!** King Kohli nods in approval! Royal innings!',
    '🎯 **50!** Dhoni-calculated chase! Captain Cool style!',
    '🚀 **HALF CENTURY!** Rohit Sharma level elegance!',
  ],
  century: [
    '👑 **CENTURY!** 100 RUNS! The stadium erupts! Absolute legend!',
    '🚀 **HUNDRED!** Take a bow! What an absolute masterclass!',
    '💎 **100 RUNS!** The batter has reached three figures! Incredible!',
    '🎯 **CENTURY!** History in the making! Unbelievable batting!',
    '🌟 **100!** That\'s Kohli-level batting! Sensational!',
    '👑 **CENTURY!** VIRAT KOHLI MODE ACTIVATED! The King reigns!',
    '🎯 **100!** Dhoni would have finished it in style! Incredible!',
    '🚀 **HUNDRED!** Hitman Rohit would be jealous! Outstanding!',
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
    '🏏 BOOM! Four runs! That ball raced to the boundary!',
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
    '🏏 Dhoni-style finish! SIX! Into the stands!',
    '🏏 Virat Kohli would be proud! SIX! The King approves!',
    '🎯 MS Dhoni helicopter shot! SIX! Finisher mode activated!',
    '💥 Rohit Sharma pull shot! SIX! Hitman sends it into orbit!',
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
  '🏏 YOU ARE OUT! The number matched — walk back!',
  '💀 Clutch wicket! The pressure was too much!',
  '💀 OUT! Even Kohli gets out sometimes! Walk back, champ!',
  '🔥 Bumrah-esque yorker! Unplayable! OUT!',
  '🎯 Dhoni stamp the stumps! RUN OUT! Same number!',
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
  '🏏 Clutch finish! What a game of cricket!',
];

const COMMENTARY_GAME_OVER_TIE = [
  '🤝 A TIE! Neither team could be separated!',
  '🤝 Dead even! What a nail-biter!',
  '🤝 Points shared! You can\'t write this script!',
];

const COMMENTARY_POWERPLAY = [
  '⚡ **POWERPLAY!** Double excitement! Bonus runs active!',
  '🔥 **POWERPLAY OVER!** Runs are flowing like water!',
  '💪 **POWERPLAY!** The field is up — go big or go home!',
  '🎯 **POWERPLAY ACTIVE!** Maximum rewards on every ball!',
];

const COMMENTARY_SUPER_OVER = [
  '🏟️ **SUPER OVER!** Tiebreaker time! Everything on the line!',
  '🔥 **SUPER OVER!** One over to decide it all!',
  '💀 **SUPER OVER!** Who will hold their nerve?',
  '⚡ **SUPER OVER!** The crowd is going absolutely ballistic!',
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
  '{user} to {target}: "You get out so fast, even Fast & Furious is jealous!" 🏎️',
  '{target}, {user}: "Your cricket skills are like a participation trophy — just for showing up!" 🏅',
];

/* ── Cricket Legend Bot Profiles ── */
const BOT_PROFILES = [
  { name: '🏏 Virat Kohli', style: 'aggressive', emoji: '👑', title: 'King Kohli' },
  { name: '🧤 MS Dhoni', style: 'balanced', emoji: '🎯', title: 'Captain Cool' },
  { name: '💥 Rohit Sharma', style: 'aggressive', emoji: '🚀', title: 'Hitman' },
  { name: '🎯 Jasprit Bumrah', style: 'defensive', emoji: '🔥', title: 'Yorker King' },
  { name: '⚡ Shubman Gill', style: 'aggressive', emoji: '🌟', title: 'Prince' },
  { name: '🛡️ Ravindra Jadeja', style: 'balanced', emoji: '⚔️', title: 'Sir Jadeja' },
  { name: '🔥 Suryakumar Yadav', style: 'aggressive', emoji: '💫', title: 'SKY 360' },
  { name: '🎯 KL Rahul', style: 'balanced', emoji: '🏏', title: 'The Wall Jr' },
];

/* ── Cricket Legends for Random Commentary References ── */
const CRICKET_LEGENDS = [
  { name: 'Virat Kohli', emoji: '👑', style: 'aggressive batting' },
  { name: 'MS Dhoni', emoji: '🎯', style: 'finisher' },
  { name: 'Rohit Sharma', emoji: '🚀', style: 'power hitting' },
  { name: 'Sachin Tendulkar', emoji: '🏏', style: 'master class' },
  { name: 'Jasprit Bumrah', emoji: '🔥', style: 'death bowling' },
  { name: 'Ravindra Jadeja', emoji: '⚔️', style: 'all-round' },
  { name: 'Shubman Gill', emoji: '🌟', style: 'elegant batting' },
  { name: 'Suryakumar Yadav', emoji: '💫', style: '360 batting' },
  { name: 'KL Rahul', emoji: '🏏', style: 'classical batting' },
  { name: 'Hardik Pandya', emoji: '💪', style: 'explosive finishing' },
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

    this.players = [player1Id, player2Id];

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
    this.striker = null;
    this.nonStriker = null;
    this.strikeRotated = false;

    // Bowling Rotation
    this.bowlerOrder = [];
    this.currentBowlerIdx = 0;
    this.bowlerStats = {};
    this.ballsThisOver = 0;
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

    // Powerplay
    this.powerplayEnabled = options.powerplay || false;
    this.powerplayOver = 1; // First over is powerplay
    this.isPowerplayActive = false;
    this.powerplayBonusRuns = 0;

    // Super Over
    this.isSuperOver = options.superOver || false;
    this.superOverCount = 0;
    this.originalOvers = this.maxOvers;
    this.originalWickets = this.maxWickets;

    // Ranked
    this.isRanked = options.ranked || false;

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

    // Interactive catch action
    this.catchActionPending = false;
    this.pendingCatch = null;

    // Milestone tracking
    this.milestonesReached = [];

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

    // Selection window tracking
    this.selectionWindow = null;
    this.selectionDeadline = null;

    // Rematch tracking
    this.rematchCount = 0;
    this.rematchOffered = false;

    // Message ID for updating game message
    this.gameMessageId = null;

    // Over-by-over summary
    this.overSummaries = [];
    this.currentOverRuns = 0;
    this.currentOverWickets = 0;
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

  decline() {
    this.clearTimers();
    this.phase = GAME_PHASE.ENDED;
    return { success: true };
  }

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
    if (this.selectionWindow) { clearTimeout(this.selectionWindow); this.selectionWindow = null; }
  }

  startTurnTimer(onTurnTimeout, onInactivityTimeout) {
    this.clearTimers();
    this.turnStartTime = Date.now();
    this.lastActivity = Date.now();
    this.selectionDeadline = Date.now() + (MATCH_TURN_TIMEOUT * 1000);

    this.turnTimer = setTimeout(() => {
      onTurnTimeout(this);
    }, MATCH_TURN_TIMEOUT * 1000);

    this.inactivityTimer = setTimeout(() => {
      onInactivityTimeout(this);
    }, MATCH_INACTIVITY_TIMEOUT * 1000);
  }

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
      return { success: false, message: '🚫 Coin toss is for single player! Use buttons for multiplayer.' };
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

  submitTossNumber(userId, number) {
    if (this.phase !== GAME_PHASE.TOSS) {
      return { success: false, message: '🚫 Not in toss phase!' };
    }
    if (!this.players.includes(userId)) {
      return { success: false, message: '🚫 You are not in this game!' };
    }
    if (!this.tossChoice[userId]) {
      return { success: false, message: '❌ First choose odd or even!' };
    }
    if (number < 1 || number > 6) {
      return { success: false, message: '❌ Choose a number between 1 and 6!' };
    }
    if (this.tossNumbers[userId] !== undefined) {
      return { success: false, message: '❌ You already submitted your toss number!' };
    }

    this.tossNumbers[userId] = number;

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

    this.striker = this.battingNow;
    this.nonStriker = this.bowlingNow;

    this.bowlerOrder = [this.bowlingNow];
    this.currentBowlerIdx = 0;
    this.currentOverBowler = this.bowlingNow;
    this.ballsThisOver = 0;
    this.bowlerStats[this.bowlingNow] = { balls: 0, runs: 0, wickets: 0, overs: 0 };

    this.currentInnings = 1;
    this.phase = GAME_PHASE.PLAYING;
    this.currentNumbers = {};
    this.lastActivity = Date.now();

    // Check powerplay for first over
    this.updatePowerplayStatus();

    return { success: true, battingFirst: this.battingFirst, bowlingFirst: this.bowlingFirst };
  }

  botChooseBatBowl() {
    if (this.phase !== GAME_PHASE.TOSS_CHOICE) return { success: false };
    const choice = this.botProfile?.style === 'aggressive' ? 'bat' :
                   this.botProfile?.style === 'defensive' ? 'bowl' :
                   (Math.random() < 0.5 ? 'bat' : 'bowl');
    return this.chooseBatBowl(this.tossWinner, choice);
  }

  /* ═══════════════════════════════════════════
     ⚡ POWERPLAY SYSTEM
     ═══════════════════════════════════════════ */

  updatePowerplayStatus() {
    if (!this.powerplayEnabled) {
      this.isPowerplayActive = false;
      return;
    }
    const currentOver = Math.floor(this.scores[this.battingNow]?.balls / 6) + 1;
    this.isPowerplayActive = currentOver <= this.powerplayOver;
  }

  calculatePowerplayBonus(runs) {
    if (!this.isPowerplayActive) return 0;
    // Powerplay: bonus 2 runs on every scoring ball
    return 2;
  }

  /* ═══════════════════════════════════════════
     🧤 CATCH SYSTEM
     ═══════════════════════════════════════════ */

  checkCatchChance(batNum, bowlNum) {
    const key = `${batNum}_${bowlNum}`;
    const combo = CATCH_COMBOS[key];

    if (!combo) return null;

    const catchRoll = Math.random();
    if (catchRoll > combo.chance) return null;

    this.catchChances++;

    // Return pending catch for interactive buttons
    return {
      triggered: true,
      fielder: combo.fielder,
      type: combo.type,
      combo: combo,
    };
  }

  /**
   * Resolve catch action — called when bowler clicks Dive or Safe
   */
  resolveCatchAction(action) {
    if (!this.pendingCatch) return null;

    const catchData = this.pendingCatch;
    this.catchActionPending = false;
    this.pendingCatch = null;

    let catchSuccess, isDiving;

    if (action === 'dive') {
      isDiving = true;
      catchSuccess = Math.random() < 0.50; // 50% on dive
    } else {
      isDiving = false;
      catchSuccess = Math.random() < 0.70; // 70% on safe
    }

    if (catchSuccess) {
      this.catchesTaken++;
      return {
        triggered: true,
        success: true,
        isDiving,
        fielder: catchData.fielder,
        type: catchData.type,
        commentary: CATCH_COMMENTARY_SUCCESS[Math.floor(Math.random() * CATCH_COMMENTARY_SUCCESS.length)],
        diveCommentary: isDiving ? CATCH_DIVE_COMMENTARY[Math.floor(Math.random() * CATCH_DIVE_COMMENTARY.length)] : null,
      };
    } else {
      this.catchesDropped++;
      return {
        triggered: true,
        success: false,
        isDiving,
        fielder: catchData.fielder,
        type: catchData.type,
        commentary: CATCH_COMMENTARY_DROPPED[Math.floor(Math.random() * CATCH_COMMENTARY_DROPPED.length)],
        diveCommentary: isDiving ? CATCH_DIVE_COMMENTARY[Math.floor(Math.random() * CATCH_DIVE_COMMENTARY.length)] : null,
      };
    }
  }

  /* ═══════════════════════════════════════════
     🏆 MILESTONE CHECKER
     ═══════════════════════════════════════════ */

  checkMilestone(batsmanId, currentRuns) {
    const milestones = [];

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

  rotateStrike(runsScored) {
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

  updateBowlingRotation() {
    // Save over summary before rotation
    this.overSummaries.push({
      over: this.overSummaries.length + 1,
      runs: this.currentOverRuns,
      wickets: this.currentOverWickets,
    });
    this.currentOverRuns = 0;
    this.currentOverWickets = 0;
    this.ballsThisOver = 0;

    if (this.bowlerOrder.length <= 1) return;

    this.currentBowlerIdx = (this.currentBowlerIdx + 1) % this.bowlerOrder.length;
    this.currentOverBowler = this.bowlerOrder[this.currentBowlerIdx];
    this.bowlingNow = this.currentOverBowler;

    if (this.bowlerStats[this.bowlingNow]) {
      this.bowlerStats[this.bowlingNow].overs++;
    }
  }

  /* ═══════════════════════════════════════════
     🏏 GAMEPLAY — Submit Play Number (via buttons)
     ═══════════════════════════════════════════ */

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

    if (!this.isBotGame || userId === this.player1Id) {
      this.playerHistory.push(number);
    }

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
   */
  resolveBall(batNum, bowlNum) {
    const batsman = this.battingNow;
    const bowler = this.bowlingNow;
    const isOut = batNum === bowlNum;

    this.currentNumbers = {};
    this.scores[batsman].balls++;
    this.ballsThisOver++;

    if (this.bowlerStats[bowler]) {
      this.bowlerStats[bowler].balls++;
    }

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
      this.currentOverWickets++;

      if (this.scores[batsman].runs === 0) {
        this.scores[batsman].ducks++;
      }

      if (this.bowlerStats[bowler]) {
        this.bowlerStats[bowler].wickets++;
      }

      commentary = COMMENTARY_OUT[Math.floor(Math.random() * COMMENTARY_OUT.length)];
    } else {
      // Check for catch chance — interactive!
      const catchCheck = this.checkCatchChance(batNum, bowlNum);

      if (catchCheck && catchCheck.triggered) {
        // Set pending catch for interactive resolution
        this.catchActionPending = true;
        this.pendingCatch = catchCheck;

        // Temporarily score the runs (will be reversed if catch is successful)
        const powerplayBonus = this.calculatePowerplayBonus(batNum);
        this.scores[batsman].runs += batNum + powerplayBonus;
        this.powerplayBonusRuns += powerplayBonus;
        if (batNum === 4) this.scores[batsman].fours++;
        if (batNum === 6) this.scores[batsman].sixes++;
        this.currentOverRuns += batNum + powerplayBonus;

        if (this.bowlerStats[bowler]) {
          this.bowlerStats[bowler].runs += batNum + powerplayBonus;
        }

        this.rotateStrike(batNum);
        milestoneResults = this.checkMilestone(batsman, this.scores[batsman].runs);

        // Return with catch action pending — game pauses for button input
        let result = {
          success: true,
          message: 'catch_pending',
          batNum,
          bowlNum,
          batsman,
          bowler,
          runsThisBall: batNum,
          powerplayBonus,
          totalRuns: this.scores[batsman].runs,
          wickets: this.scores[batsman].wickets,
          balls: this.scores[batsman].balls,
          commentary: `🧤 **CATCH CHANCE at ${catchCheck.fielder}!** ${catchCheck.type.toUpperCase()} — Bowler, choose your action!`,
          catchFielder: catchCheck.fielder,
          catchType: catchCheck.type,
          milestoneResults,
          strikeRotated: this.strikeRotated,
        };

        // Check for innings end after adding runs
        if (this.currentInnings === 2) {
          const firstBattingScore = this.scores[this.battingFirst].runs;
          if (this.scores[batsman].runs > firstBattingScore) {
            result.gameOver = true;
            result.winner = batsman;
            result.loser = bowler;
            this.phase = GAME_PHASE.ENDED;
            result.gameOverCommentary = COMMENTARY_GAME_OVER_WIN[Math.floor(Math.random() * COMMENTARY_GAME_OVER_WIN.length)];
            result.gif = CELEBRATION_GIFS.matchWin[Math.floor(Math.random() * CELEBRATION_GIFS.matchWin.length)];
          }
        }

        result.economyBonus = this.calculateBallEconomy(batNum, false);
        return result;
      }

      // Normal play — no catch triggered
      this.consecutiveWickets = 0;
      const powerplayBonus = this.calculatePowerplayBonus(batNum);
      this.scores[batsman].runs += batNum + powerplayBonus;
      this.powerplayBonusRuns += powerplayBonus;
      if (batNum === 4) this.scores[batsman].fours++;
      if (batNum === 6) this.scores[batsman].sixes++;
      this.currentOverRuns += batNum + powerplayBonus;

      if (this.bowlerStats[bowler]) {
        this.bowlerStats[bowler].runs += batNum + powerplayBonus;
      }

      this.rotateStrike(batNum);
      milestoneResults = this.checkMilestone(batsman, this.scores[batsman].runs);

      let ppComment = '';
      if (this.isPowerplayActive) {
        ppComment = COMMENTARY_POWERPLAY[Math.floor(Math.random() * COMMENTARY_POWERPLAY.length)] + '\n';
      }

      commentary = ppComment + (COMMENTARY_RUNS[batNum] || [])[Math.floor(Math.random() * (COMMENTARY_RUNS[batNum] || ['🏏 Runs scored!']).length)] || '🏏 Runs scored!';
    }

    // Check bowling rotation at end of over
    if (this.ballsThisOver >= 6) {
      this.updateBowlingRotation();
      this.updatePowerplayStatus();
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
        isCatchOut: false,
        catchResult: null,
        milestoneResults,
        isDuck: this.scores[batsman].runs === 0 && this.scores[batsman].balls === 1,
      };

      result.gif = CELEBRATION_GIFS.wicket[Math.floor(Math.random() * CELEBRATION_GIFS.wicket.length)];

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
        powerplayBonus: this.calculatePowerplayBonus(batNum),
        totalRuns: this.scores[batsman].runs,
        wickets: this.scores[batsman].wickets,
        balls: this.scores[batsman].balls,
        isFour: batNum === 4,
        isSix: batNum === 6,
        commentary,
        milestoneResults,
        catchDropped: false,
        catchResult: null,
        strikeRotated: this.strikeRotated,
        isPowerplay: this.isPowerplayActive,
      };

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

    result.economyBonus = this.calculateBallEconomy(batNum, isOut);
    return result;
  }

  /**
   * Handle catch resolution (after interactive button click)
   */
  resolveCatchAfterAction(action) {
    const catchResult = this.resolveCatchAction(action);
    if (!catchResult) return null;

    const batsman = this.battingNow;
    const bowler = this.bowlingNow;
    const batNum = this.ballLog[this.ballLog.length - 1]?.batNum;
    const bowlNum = this.ballLog[this.ballLog.length - 1]?.bowlNum;

    let milestoneResults = null;
    let result;

    if (catchResult.success) {
      // Catch taken = OUT! Reverse the runs we temporarily added
      this.scores[batsman].runs -= batNum;
      this.scores[batsman].wickets++;
      this.scores[batsman].catches++;
      this.consecutiveWickets++;
      this.currentOverWickets++;

      // Fix the bowler runs
      if (this.bowlerStats[bowler]) {
        this.bowlerStats[bowler].runs -= batNum;
        this.bowlerStats[bowler].wickets++;
      }

      // Update ball log
      if (this.ballLog.length > 0) {
        this.ballLog[this.ballLog.length - 1].out = true;
        this.ballLog[this.ballLog.length - 1].catchAttempt = true;
        this.ballLog[this.ballLog.length - 1].catchSuccess = true;
        this.ballLog[this.ballLog.length - 1].runs = 0;
      }

      const diveStr = catchResult.isDiving ? ` ${catchResult.diveCommentary}` : '';
      const commentary = `${diveStr} ${catchResult.commentary}`;

      result = {
        success: true,
        message: 'catch_out',
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
        isCatchOut: true,
        catchResult,
        milestoneResults: null,
        isDuck: this.scores[batsman].runs === 0 && this.scores[batsman].balls === 1,
      };

      result.gif = CELEBRATION_GIFS.catch[Math.floor(Math.random() * CELEBRATION_GIFS.catch.length)];

      if (this.scores[batsman].wickets >= this.maxWickets || this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    } else {
      // Catch dropped — runs stand
      this.consecutiveWickets = 0;
      milestoneResults = this.checkMilestone(batsman, this.scores[batsman].runs);

      if (this.ballLog.length > 0) {
        this.ballLog[this.ballLog.length - 1].catchAttempt = true;
        this.ballLog[this.ballLog.length - 1].catchSuccess = false;
      }

      const diveStr = catchResult.isDiving ? ` ${catchResult.diveCommentary}` : '';
      const runsCommentary = (COMMENTARY_RUNS[batNum] || [])[Math.floor(Math.random() * (COMMENTARY_RUNS[batNum] || ['🏏 Runs scored!']).length)] || '🏏 Runs scored!';
      const commentary = `${diveStr} ${catchResult.commentary}\n${runsCommentary}`;

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
        catchDropped: true,
        catchResult,
        strikeRotated: this.strikeRotated,
      };

      // 2nd innings chase check
      if (this.currentInnings === 2) {
        const firstBattingScore = this.scores[this.battingFirst].runs;
        if (this.scores[batsman].runs > firstBattingScore) {
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

    // Check bowling rotation at end of over
    if (this.ballsThisOver >= 6) {
      this.updateBowlingRotation();
      this.updatePowerplayStatus();
    }

    this.lastCommentary = result.commentary;
    result.economyBonus = this.calculateBallEconomy(batNum || 0, catchResult.success);
    return result;
  }

  calculateBallEconomy(runs, isOut) {
    let bonus = 0;
    if (runs === 4) bonus += ECONOMY.FOUR_BONUS;
    if (runs === 6) bonus += ECONOMY.SIX_BONUS;
    if (this.isPowerplayActive) bonus += ECONOMY.POWERPLAY_BONUS;
    return bonus;
  }

  calculateGameEconomy(winnerId) {
    const rewards = {
      [this.players[0]]: ECONOMY.PLAY_REWARD,
      [this.players[1]]: ECONOMY.PLAY_REWARD,
    };

    if (winnerId) {
      rewards[winnerId] += ECONOMY.WIN_BONUS;
      if (this.isRanked) rewards[winnerId] += ECONOMY.RANKED_WIN_BONUS;
      if (this.isSuperOver) rewards[winnerId] += ECONOMY.SUPER_OVER_BONUS;
    }

    for (const pid of this.players) {
      if (!pid.startsWith('BOT_')) {
        rewards[pid] += (this.scores[pid].fours || 0) * ECONOMY.FOUR_BONUS;
        rewards[pid] += (this.scores[pid].sixes || 0) * ECONOMY.SIX_BONUS;
        rewards[pid] += (this.scores[pid].catches || 0) * ECONOMY.CATCH_BONUS;

        if (this.scores[pid].runs >= 50) rewards[pid] += ECONOMY.MILESTONE_50_BONUS;
        if (this.scores[pid].runs >= 100) rewards[pid] += ECONOMY.MILESTONE_100_BONUS;
      }
    }

    for (const pid of this.players) {
      if (pid.startsWith('BOT_')) delete rewards[pid];
    }

    return rewards;
  }

  /* ═══════════════════════════════════════════
     🏟️ SUPER OVER
     ═══════════════════════════════════════════ */

  initSuperOver() {
    this.isSuperOver = true;
    this.superOverCount++;
    this.maxOvers = 1;
    this.maxWickets = 2;
    this.maxBalls = 6;
    this.currentInnings = 1;

    // Reset scores for super over
    this.scores[this.players[0]] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0, catches: 0, ducks: 0 };
    this.scores[this.players[1]] = { runs: 0, wickets: 0, balls: 0, fours: 0, sixes: 0, catches: 0, ducks: 0 };

    this.ballLog = [];
    this.consecutiveWickets = 0;
    this.milestonesReached = [];
    this.catchChances = 0;
    this.catchesTaken = 0;
    this.catchesDropped = 0;
    this.overSummaries = [];
    this.currentOverRuns = 0;
    this.currentOverWickets = 0;
    this.powerplayBonusRuns = 0;

    // Reset bowling
    this.bowlerOrder = [];
    this.currentBowlerIdx = 0;
    this.ballsThisOver = 0;
    this.bowlerStats = {};

    this.phase = GAME_PHASE.TOSS;
    this.tossNumbers = {};
    this.tossChoice = {};
    this.tossWinner = null;
    this.tossLoser = null;
    this.coinResult = null;
    this.battingFirst = null;
    this.bowlingFirst = null;
    this.currentNumbers = {};

    this.lastActivity = Date.now();

    return {
      success: true,
      superOverCount: this.superOverCount,
      commentary: COMMENTARY_SUPER_OVER[Math.floor(Math.random() * COMMENTARY_SUPER_OVER.length)],
    };
  }

  /* ═══════════════════════════════════════════
     📊 INNINGS / GAME END
     ═══════════════════════════════════════════ */

  handleInningsEnd() {
    if (this.currentInnings === 1) {
      this.currentInnings = 2;
      this.battingNow = this.bowlingFirst;
      this.bowlingNow = this.battingFirst;

      this.striker = this.battingNow;
      this.nonStriker = this.bowlingNow;

      this.bowlerOrder = [this.bowlingNow];
      this.currentBowlerIdx = 0;
      this.currentOverBowler = this.bowlingNow;
      this.ballsThisOver = 0;
      this.bowlerStats[this.bowlingNow] = { balls: 0, runs: 0, wickets: 0, overs: 0 };

      this.phase = GAME_PHASE.INNINGS_BREAK;
      this.consecutiveWickets = 0;
      this.lastActivity = Date.now();
      this.currentOverRuns = 0;
      this.currentOverWickets = 0;

      this.updatePowerplayStatus();

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
        canSuperOver: isTie && !this.isSuperOver,
      };
    }
  }

  startSecondInnings() {
    if (this.phase !== GAME_PHASE.INNINGS_BREAK) {
      return { success: false, message: '🚫 Not in innings break!' };
    }
    this.phase = GAME_PHASE.PLAYING;
    this.currentNumbers = {};
    this.lastActivity = Date.now();
    return { success: true };
  }

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

  /* ═══════════════════════════════════════════
     📊 SCORE FORMATTING
     ═══════════════════════════════════════════ */

  getScoreString() {
    return {
      p1: { id: this.players[0], ...this.scores[this.players[0]] },
      p2: { id: this.players[1], ...this.scores[this.players[1]] },
      currentInnings: this.currentInnings,
      battingNow: this.battingNow,
      bowlingNow: this.bowlingNow,
    };
  }

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
   * Get broadcast-style scoreboard for live updates
   */
  getBroadcastScoreboard(playerNames) {
    const battingScore = this.scores[this.battingNow];
    const overs = `${Math.floor(battingScore.balls / 6)}.${battingScore.balls % 6}`;
    const sr = battingScore.balls > 0 ? ((battingScore.runs / battingScore.balls) * 100).toFixed(1) : '0.0';
    const remaining = this.maxBalls - battingScore.balls;
    const ballsLeftStr = `${Math.floor(remaining / 6)}.${remaining % 6}`;

    let targetStr = '';
    if (this.currentInnings === 2) {
      const target = this.scores[this.battingFirst].runs + 1;
      const need = Math.max(0, target - battingScore.runs);
      targetStr = `\n┣ 🎯 **Target:** ${target} | **Need:** ${need} from ${remaining} ball${remaining !== 1 ? 's' : ''}`;
    }

    const ppStr = this.isPowerplayActive ? '\n┣ ⚡ **POWERPLAY ACTIVE!** Bonus runs on!' : '';
    const rankedStr = this.isRanked ? '\n┣ 🏆 **RANKED MATCH**' : '';
    const superOverStr = this.isSuperOver ? `\n┣ 🏟️ **SUPER OVER #${this.superOverCount}**` : '';

    return (
      `\`\`\`\n` +
      `  🏏 SCORECARD — ${this.currentInnings === 1 ? '1st' : '2nd'} Innings\n` +
      `  ━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `  ${playerNames[this.battingNow] || 'Batting'}: ${battingScore.runs}/${battingScore.wickets}\n` +
      `  Overs: ${overs}/${this.maxOvers} | SR: ${sr}\n` +
      `  4s: ${battingScore.fours} | 6s: ${battingScore.sixes}\n` +
      `  Balls Left: ${remaining}${targetStr}${ppStr}${rankedStr}${superOverStr}\n` +
      `\`\`\``
    );
  }

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
      isRanked: this.isRanked,
      isSuperOver: this.isSuperOver,
      powerplayEnabled: this.powerplayEnabled,
      ballLog: this.ballLog.slice(-20),
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

  getRemainingBalls() {
    if (!this.battingNow) return null;
    return {
      ballsLeft: this.maxBalls - this.scores[this.battingNow].balls,
      oversBowled: `${Math.floor(this.scores[this.battingNow].balls / 6)}.${this.scores[this.battingNow].balls % 6}`,
    };
  }

  getTimeRemaining() {
    if (!this.turnStartTime) return null;
    const elapsed = (Date.now() - this.turnStartTime) / 1000;
    return Math.max(0, MATCH_TURN_TIMEOUT - Math.floor(elapsed));
  }

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
          mmr: MMR.STARTING,
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

      // Update MMR
      const currentMMR = profile.mmr || MMR.STARTING;
      let mmrChange = gameSummary.won ? MMR.WIN_GAIN : -MMR.LOSS_LOSS;

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
        mmr: Math.max(0, currentMMR + mmrChange),
      };

      await this.supabase
        .from('hc_profiles')
        .update(updates)
        .eq('user_id', userId);

      return { winStreak: newWinStreak, bestStreak, mmrChange };
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

  async getLeaderboardByMMR(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .order('mmr', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }

  async getLeaderboardByWickets(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .order('total_wickets', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }

  async getLeaderboardByHighestScore(limit = 10) {
    if (!this.supabase) return [];
    try {
      const { data, error } = await this.supabase
        .from('hc_profiles')
        .select('*')
        .order('highest_score', { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }

  static getMMRTier(mmr) {
    for (const tier of MMR.TIERS) {
      if (mmr >= tier.min && mmr <= tier.max) return tier.name;
    }
    return MMR.TIERS[0].name;
  }
}

/* ═══════════════════════════════════════════
   🏟️ Tournament System
   ═══════════════════════════════════════════ */

class TournamentManager {
  constructor() {
    this.tournaments = new Map();
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
      status: 'registration',
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

    let playerCount = tournament.players.length;
    tournament.players = tournament.players.sort(() => Math.random() - 0.5);

    tournament.bracket = [];
    const numRounds = Math.ceil(Math.log2(playerCount));
    let currentRound = [];

    for (let i = 0; i < tournament.players.length; i += 2) {
      const match = {
        player1: tournament.players[i],
        player2: tournament.players[i + 1] || null,
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
    this.lobbies = new Map();
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
      status: 'waiting',
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
  CRICKET_LEGENDS,
  COMMENTARY_RUNS,
  COMMENTARY_OUT,
  COMMENTARY_TOSS,
  COMMENTARY_INNINGS_BREAK,
  COMMENTARY_GAME_OVER_WIN,
  COMMENTARY_GAME_OVER_TIE,
  COMMENTARY_POWERPLAY,
  COMMENTARY_SUPER_OVER,
  CATCH_COMBOS,
  CATCH_COMMENTARY_SUCCESS,
  CATCH_COMMENTARY_DROPPED,
  CELEBRATION_GIFS,
  MILESTONE_MESSAGES,
  MILESTONES,
  ECONOMY,
  MMR,
  COLORS,
  MATCH_TURN_TIMEOUT,
  MATCH_INACTIVITY_TIMEOUT,
  grantEconomyRewards,
};
