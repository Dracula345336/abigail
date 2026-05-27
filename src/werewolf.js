/* ═══════════════════════════════════════════
   🐺 Werewolf Game Engine
   
   Game: Villagers vs Wolves
   - Villagers vote to shoot suspected wolves
   - Wolves know who each other are (get DMs)
   - Villagers win: all wolves eliminated
   - Wolves win: wolves equal or outnumber villagers
   ═══════════════════════════════════════════ */

const GAME_STATE = {
  WAITING: 'waiting',
  NIGHT: 'night',
  DAY: 'day',
  ENDED: 'ended',
};

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
    this.players = new Map();
    this.votes = new Map();
    this.round = 0;
    this.playerNumber = 0;
  }

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

  start() {
    const playerCount = this.players.size;
    if (playerCount < 4) {
      return { success: false, message: '🚫 Need at least 4 players to start!' };
    }

    let wolfCount;
    if (playerCount <= 5) wolfCount = 1;
    else if (playerCount <= 8) wolfCount = 2;
    else if (playerCount <= 12) wolfCount = 3;
    else wolfCount = 4;

    const playerIds = [...this.players.keys()];
    const shuffled = playerIds.sort(() => Math.random() - 0.5);

    for (let i = 0; i < wolfCount; i++) {
      this.players.get(shuffled[i]).role = ROLE.WOLF;
    }

    if (playerCount >= 6) {
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.DOCTOR;
          break;
        }
      }
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.SEER;
          break;
        }
      }
    }

    for (const [, player] of this.players) {
      if (!player.role) player.role = ROLE.VILLAGER;
    }

    this.state = GAME_STATE.NIGHT;
    this.round = 1;
    return { success: true, wolfCount };
  }

  getWolves() {
    const wolves = [];
    for (const [, player] of this.players) {
      if (player.role === ROLE.WOLF) wolves.push(player);
    }
    return wolves;
  }

  getPlayerByNumber(num) {
    for (const [, player] of this.players) {
      if (player.number === num && player.alive) return player;
    }
    return null;
  }

  getPlayer(userId) {
    return this.players.get(userId);
  }

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

  tallyVotes() {
    const voteCount = new Map();
    for (const [, targetId] of this.votes) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }
    let maxVotes = 0;
    let targets = [];
    for (const [targetId, count] of voteCount) {
      if (count > maxVotes) { maxVotes = count; targets = [targetId]; }
      else if (count === maxVotes) targets.push(targetId);
    }
    this.votes.clear();
    if (targets.length === 0) return { eliminated: null, message: '🔫 No one voted! No one was eliminated.', votes: voteCount };
    if (targets.length > 1) return { eliminated: null, message: '⚖️ It\'s a tie! No one was eliminated.', votes: voteCount };
    const eliminated = this.players.get(targets[0]);
    eliminated.alive = false;
    return { eliminated, message: `💀 **${eliminated.user.username}** was shot! They were a **${eliminated.role}**!`, votes: voteCount };
  }

  checkWin() {
    let aliveWolves = 0, aliveVillagers = 0;
    for (const [, player] of this.players) {
      if (!player.alive) continue;
      if (player.role === ROLE.WOLF) aliveWolves++;
      else aliveVillagers++;
    }
    if (aliveWolves === 0) { this.state = GAME_STATE.ENDED; return { winner: 'villagers', message: '🏘️ **Villagers win!** All wolves have been eliminated!' }; }
    if (aliveWolves >= aliveVillagers) { this.state = GAME_STATE.ENDED; return { winner: 'wolves', message: '🐺 **Wolves win!** They have overtaken the village!' }; }
    return null;
  }

  nextRound() {
    this.round++;
    this.votes.clear();
    this.state = GAME_STATE.DAY;
  }

  getAlivePlayers() {
    return [...this.players.values()].filter(p => p.alive);
  }

  getAllPlayers() {
    return [...this.players.values()];
  }

  end() {
    this.state = GAME_STATE.ENDED;
    return this.getAllPlayers();
  }
}

const activeGames = new Map();

module.exports = { WerewolfGame, GAME_STATE, ROLE, activeGames };
