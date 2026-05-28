/* ═══════════════════════════════════════════
   🏏  Hand Cricket — Indian Childhood Classic!

   Features:
     - Odd-Even Toss system
     - DM-based number selection (1-6)
     - Innings: Batting & Bowling
     - Score tracking with wickets
     - Same number = OUT!
   
   Commands:
     hc.challenge @user  — Challenge someone
     hc.accept           — Accept challenge
     hc.decline          — Decline challenge
     hc.quit             — Quit current game
     hc.score            — Current score
     hc.help             — How to play
   
   DM Commands:
     toss 1-6            — Choose toss number
     bat/bowl            — Toss winner choice
     1-6                 — Play your number
   ═══════════════════════════════════════════ */

const { EmbedBuilder } = require('discord.js');

const GAME_PHASE = {
  WAITING: 'waiting',       // Waiting for opponent to accept
  TOSS: 'toss',            // Both choosing toss numbers
  TOSS_CHOICE: 'toss_choice', // Toss winner choosing bat/bowl
  PLAYING: 'playing',      // Active gameplay
  INNINGS_BREAK: 'innings_break', // Between innings
  ENDED: 'ended',
};

const EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

class HandCricketGame {
  constructor(challengerId, opponentId, channelId, guildId) {
    this.challengerId = challengerId;
    this.opponentId = opponentId;
    this.channelId = channelId;
    this.guildId = guildId;
    this.channel = null;

    this.phase = GAME_PHASE.WAITING;

    // Players: [0] = player1 (challenger), [1] = player2 (opponent)
    this.players = [challengerId, opponentId];

    // Toss
    this.tossNumbers = {};      // userId → number (1-6)
    this.tossChoice = {};       // userId → 'odd' or 'even'
    this.tossWinner = null;
    this.tossLoser = null;

    // Innings
    this.battingFirst = null;   // userId who bats first
    this.bowlingFirst = null;   // userId who bowls first
    this.currentInnings = 1;    // 1 or 2
    this.battingNow = null;     // userId who is currently batting
    this.bowlingNow = null;     // userId who is currently bowling

    // Score
    this.scores = {};           // userId → { runs: 0, wickets: 0, balls: 0 }
    this.scores[challengerId] = { runs: 0, wickets: 0, balls: 0 };
    this.scores[opponentId] = { runs: 0, wickets: 0, balls: 0 };

    // Current ball
    this.currentNumbers = {};   // userId → number chosen this ball

    // Max balls per innings (0 = unlimited, out only)
    this.maxBalls = 6;          // 6 balls per innings (1 over)
    this.maxWickets = 2;        // 2 wickets = all out

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

  /**
   * Set toss choice (odd/even) for a player
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

    // Check if both have chosen odd/even
    const p1Choice = this.tossChoice[this.players[0]];
    const p2Choice = this.tossChoice[this.players[1]];

    if (p1Choice && p2Choice) {
      // Both chose — now they need to pick numbers via DM
      return { success: true, message: 'both_chosen', p1Choice, p2Choice };
    }

    return { success: true, message: 'waiting' };
  }

  /**
   * Submit toss number (DM)
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

    // Check if both submitted
    const p1Num = this.tossNumbers[this.players[0]];
    const p2Num = this.tossNumbers[this.players[1]];

    if (p1Num !== undefined && p2Num !== undefined) {
      // Resolve toss!
      const sum = p1Num + p2Num;
      const isEven = sum % 2 === 0;
      const result = isEven ? 'even' : 'odd';

      // Who chose the correct result?
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

    // Check if both have submitted
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

    let result;

    if (isOut) {
      // OUT! 💀
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

      // Check if innings over
      if (this.scores[batsman].wickets >= this.maxWickets || this.scores[batsman].balls >= this.maxBalls) {
        result.inningsOver = true;
        const inningsResult = this.handleInningsEnd();
        result = { ...result, ...inningsResult };
      }
    } else {
      // Runs scored!
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

      // Check if 2nd innings — did batting team already surpass target?
      if (this.currentInnings === 2) {
        const firstBattingScore = this.scores[this.battingFirst].runs;
        const secondBattingScore = this.scores[batsman].runs;
        if (secondBattingScore > firstBattingScore) {
          // 2nd batting team wins!
          result.gameOver = true;
          result.winner = batsman;
          result.loser = bowler;
          this.phase = GAME_PHASE.ENDED;
        }
      }

      // Check balls limit
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
      // Switch to 2nd innings
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
      // Game over! Compare scores
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
        winner = null; // Tie
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
}

module.exports = { HandCricketGame, GAME_PHASE };
