/* ═══════════════════════════════════════════
   🐺 Werewolf Game Engine
   
   Game: Villagers vs Wolves
   - Villagers vote to shoot suspected wolves
   - Wolves know who each other are (get DMs)
   - Villagers win: all wolves eliminated
   - Wolves win: wolves equal or outnumber villagers
   ═══════════════════════════════════════════ */

const { EmbedBuilder } = require('discord.js');

// Game states
const GAME_STATE = {
  WAITING: 'waiting',    // Players joining
  NIGHT: 'night',        // Roles assigned, wolves DMd
  DAY: 'day',            // Discussion + voting
  ENDED: 'ended',
};

// Roles
const ROLE = {
  VILLAGER: '🏘️ Villager',
  WOLF: '🐺 Wolf',
  DOCTOR: '💊 Doctor',
  SEER: '🔮 Seer',
};

class WerewolfGame {
  constructor(guildId, channelId) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.state = GAME_STATE.WAITING;
    this.players = new Map(); // userId -> { user, role, alive, number }
    this.votes = new Map();   // voterId -> targetId
    this.round = 0;
    this.wolfKills = new Map(); // wolfId -> targetId
    this.doctorSave = null;     // doctor's save target
    this.seerCheck = null;      // seer's check result
    this.playerNumber = 0;
  }

  /* ── Join ── */
  join(user) {
    if (this.state !== GAME_STATE.WAITING) {
      return { success: false, message: '🚫 Game already started! Wait for the next one.' };
    }
    if (this.players.has(user.id)) {
      return { success: false, message: '🚫 You already joined!' };
    }
    if (this.players.size >= 20) {
      return { success: false, message: '🚫 Game is full! Max 20 players.' };
    }

    this.playerNumber++;
    this.players.set(user.id, {
      user,
      role: null,
      alive: true,
      number: this.playerNumber,
    });

    return { success: true, message: `✅ **${user.username}** joined the game! (${this.players.size} players)` };
  }

  /* ── Leave ── */
  leave(userId) {
    if (!this.players.has(userId)) {
      return { success: false, message: '🚫 You are not in the game!' };
    }
    if (this.state !== GAME_STATE.WAITING) {
      return { success: false, message: '🚫 Cannot leave after game started!' };
    }
    this.players.delete(userId);
    return { success: true, message: `👋 Left the game. (${this.players.size} players remaining)` };
  }

  /* ── Start Game ── */
  start() {
    const playerCount = this.players.size;
    if (playerCount < 4) {
      return { success: false, message: '🚫 Need at least 4 players to start!' };
    }

    // Calculate wolf count
    let wolfCount;
    if (playerCount <= 5) wolfCount = 1;
    else if (playerCount <= 8) wolfCount = 2;
    else if (playerCount <= 12) wolfCount = 3;
    else wolfCount = 4;

    // Assign roles randomly
    const playerIds = [...this.players.keys()];
    const shuffled = playerIds.sort(() => Math.random() - 0.5);

    // Assign wolves
    for (let i = 0; i < wolfCount; i++) {
      this.players.get(shuffled[i]).role = ROLE.WOLF;
    }

    // Assign special roles
    if (playerCount >= 6) {
      // Doctor
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.DOCTOR;
          break;
        }
      }
      // Seer
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.SEER;
          break;
        }
      }
    }

    // Rest are villagers
    for (const [, player] of this.players) {
      if (!player.role) player.role = ROLE.VILLAGER;
    }

    this.state = GAME_STATE.NIGHT;
    this.round = 1;

    return { success: true, wolfCount };
  }

  /* ── Get wolves (for DM) ── */
  getWolves() {
    const wolves = [];
    for (const [id, player] of this.players) {
      if (player.role === ROLE.WOLF) wolves.push(player);
    }
    return wolves;
  }

  /* ── Get player by number ── */
  getPlayerByNumber(num) {
    for (const [id, player] of this.players) {
      if (player.number === num && player.alive) return player;
    }
    return null;
  }

  /* ── Get player by user ID ── */
  getPlayer(userId) {
    return this.players.get(userId);
  }

  /* ── Shoot/Vote ── */
  vote(voterId, targetId) {
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);

    if (!voter) return { success: false, message: '🚫 You are not in the game!' };
    if (!target) return { success: false, message: '🚫 Target not found!' };
    if (!voter.alive) return { success: false, message: '💀 Dead players cannot vote!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (voterId === targetId) return { success: false, message: '🚫 You cannot shoot yourself!' };

    this.votes.set(voterId, targetId);
    return { success: true, message: `🔫 **${voter.user.username}** voted to shoot **${target.user.username}**!` };
  }

  /* ── Tally votes and eliminate ── */
  tallyVotes() {
    const voteCount = new Map();
    for (const [voterId, targetId] of this.votes) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }

    let maxVotes = 0;
    let targets = [];
    for (const [targetId, count] of voteCount) {
      if (count > maxVotes) {
        maxVotes = count;
        targets = [targetId];
      } else if (count === maxVotes) {
        targets.push(targetId);
      }
    }

    this.votes.clear();

    if (targets.length === 0) {
      return { eliminated: null, message: '🔫 No one voted! No one was eliminated.', votes: voteCount };
    }

    if (targets.length > 1) {
      return { eliminated: null, message: `⚖️ It's a tie! No one was eliminated.`, votes: voteCount };
    }

    const eliminated = this.players.get(targets[0]);
    eliminated.alive = false;

    return {
      eliminated,
      message: `💀 **${eliminated.user.username}** was shot! They were a **${eliminated.role}**!`,
      votes: voteCount,
    };
  }

  /* ── Check win condition ── */
  checkWin() {
    let aliveWolves = 0;
    let aliveVillagers = 0;

    for (const [, player] of this.players) {
      if (!player.alive) continue;
      if (player.role === ROLE.WOLF) aliveWolves++;
      else aliveVillagers++;
    }

    if (aliveWolves === 0) {
      this.state = GAME_STATE.ENDED;
      return { winner: 'villagers', message: '🏘️ **Villagers win!** All wolves have been eliminated!' };
    }
    if (aliveWolves >= aliveVillagers) {
      this.state = GAME_STATE.ENDED;
      return { winner: 'wolves', message: '🐺 **Wolves win!** They have overtaken the village!' };
    }

    return null;
  }

  /* ── Next round ── */
  nextRound() {
    this.round++;
    this.votes.clear();
    this.wolfKills.clear();
    this.doctorSave = null;
    this.seerCheck = null;
    this.state = GAME_STATE.NIGHT;
  }

  /* ── Get alive players list ── */
  getAlivePlayers() {
    const alive = [];
    for (const [id, player] of this.players) {
      if (player.alive) alive.push(player);
    }
    return alive;
  }

  /* ── Get all players list ── */
  getAllPlayers() {
    return [...this.players.values()];
  }

  /* ── End game ── */
  end() {
    this.state = GAME_STATE.ENDED;
    return this.getAllPlayers();
  }
}

// Active games per channel
const activeGames = new Map();

module.exports = { WerewolfGame, GAME_STATE, ROLE, activeGames };
