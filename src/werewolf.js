/* ═══════════════════════════════════════════
   🐺 Werewolf Game Engine — Wolfia Style
   
   Full Night/Day cycle with 4 roles:
   - 🏘️ Villager: Vote during the day
   - 🐺 Wolf: Kill at night (DM: w.kill <#>)
   - 💊 Doctor: Save at night (DM: w.save <#>)
   - 🔮 Seer: Check at night (DM: w.check <#>)
   
   Game Flow:
   1. w.join → Players join lobby
   2. w.start → Roles assigned, Night 1 begins
   3. Night → Wolves kill, Doctor saves, Seer checks
   4. Day → Discussion + Vote (w.shoot <#>)
   5. Repeat until win condition met
   
   Win Conditions:
   - Villagers win = All wolves dead
   - Wolves win = Wolves >= Villagers
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

// Role colors for embeds
const ROLE_COLORS = {
  [ROLE.VILLAGER]: 0x2ECC71,
  [ROLE.WOLF]: 0xE74C3C,
  [ROLE.DOCTOR]: 0x3498DB,
  [ROLE.SEER]: 0x9B59B6,
};

const NIGHT_TIMER = 60;   // seconds for night actions
const DAY_TIMER = 90;     // seconds for day discussion + voting

class WerewolfGame {
  constructor(guildId, channelId, hostId) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.hostId = hostId;
    this.state = GAME_STATE.WAITING;
    this.players = new Map();
    this.votes = new Map();
    this.round = 0;
    this.playerNumber = 0;
    this.started = false;

    // Night action storage
    this.wolfTarget = null;      // userId wolves chose to kill
    this.doctorTarget = null;    // userId doctor chose to save
    this.seerTarget = null;      // userId seer chose to check
    this.nightActions = new Set(); // who has acted this night
    this.nightTimer = null;
    this.dayTimer = null;
    this.channel = null;         // Discord channel object (set on start)
    this.lastProtected = null;   // userId doctor saved last night
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
    return { success: true, message: `✅ **${user.username}** joined! (${this.players.size} players)` };
  }

  start() {
    const playerCount = this.players.size;
    if (playerCount < 4) {
      return { success: false, message: '🚫 Need at least **4 players** to start!' };
    }

    // Wolf count based on player count (Wolfia-style)
    let wolfCount;
    if (playerCount <= 5) wolfCount = 1;
    else if (playerCount <= 8) wolfCount = 2;
    else if (playerCount <= 12) wolfCount = 3;
    else wolfCount = 4;

    // Shuffle player IDs for role assignment
    const playerIds = [...this.players.keys()];
    const shuffled = playerIds.sort(() => Math.random() - 0.5);

    // Assign wolves first
    for (let i = 0; i < wolfCount; i++) {
      this.players.get(shuffled[i]).role = ROLE.WOLF;
    }

    // Assign Doctor (5+ players get doctor)
    if (playerCount >= 5) {
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.DOCTOR;
          break;
        }
      }
    }

    // Assign Seer (5+ players get seer)
    if (playerCount >= 5) {
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
    this.started = true;
    return { success: true, wolfCount };
  }

  /* ── Night Actions ── */

  wolfKill(wolfId, targetNum) {
    const wolf = this.players.get(wolfId);
    if (!wolf || wolf.role !== ROLE.WOLF || !wolf.alive) {
      return { success: false, message: '🚫 Only alive wolves can kill!' };
    }
    if (this.state !== GAME_STATE.NIGHT) {
      return { success: false, message: '🌙 You can only kill during the night!' };
    }
    if (this.nightActions.has(wolfId)) {
      return { success: false, message: '🚫 You already chose your target!' };
    }
    const target = this.getPlayerByNumber(targetNum);
    if (!target) return { success: false, message: '🚫 Invalid player number!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (target.role === ROLE.WOLF) return { success: false, message: '🚫 You cannot kill another wolf!' };

    this.wolfTarget = target.user.id;
    this.nightActions.add(wolfId);
    return { success: true, message: `🐺 You chose to kill **${target.user.username}** (#${target.number}).` };
  }

  doctorSave(doctorId, targetNum) {
    const doc = this.players.get(doctorId);
    if (!doc || doc.role !== ROLE.DOCTOR || !doc.alive) {
      return { success: false, message: '🚫 Only the alive doctor can save!' };
    }
    if (this.state !== GAME_STATE.NIGHT) {
      return { success: false, message: '🌙 You can only save during the night!' };
    }
    if (this.nightActions.has(doctorId)) {
      return { success: false, message: '🚫 You already chose someone to save!' };
    }
    const target = this.getPlayerByNumber(targetNum);
    if (!target) return { success: false, message: '🚫 Invalid player number!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (this.lastProtected === target.user.id) {
      return { success: false, message: '🚫 You cannot save the same person two nights in a row!' };
    }

    this.doctorTarget = target.user.id;
    this.nightActions.add(doctorId);
    return { success: true, message: `💊 You chose to save **${target.user.username}** (#${target.number}).` };
  }

  seerCheck(seerId, targetNum) {
    const seer = this.players.get(seerId);
    if (!seer || seer.role !== ROLE.SEER || !seer.alive) {
      return { success: false, message: '🚫 Only the alive seer can check!' };
    }
    if (this.state !== GAME_STATE.NIGHT) {
      return { success: false, message: '🌙 You can only check during the night!' };
    }
    if (this.nightActions.has(seerId)) {
      return { success: false, message: '🚫 You already checked someone!' };
    }
    const target = this.getPlayerByNumber(targetNum);
    if (!target) return { success: false, message: '🚫 Invalid player number!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (seerId === target.user.id) return { success: false, message: '🚫 You cannot check yourself!' };

    this.seerTarget = target.user.id;
    this.nightActions.add(seerId);
    const isWolf = target.role === ROLE.WOLF;
    return {
      success: true,
      message: isWolf
        ? `🔮 **${target.user.username}** (#${target.number}) is a 🐺 **WOLF**!`
        : `🔮 **${target.user.username}** (#${target.number}) is **NOT** a wolf. They are ${target.role}.`,
    };
  }

  /* ── Check if all night actions are done ── */

  allNightActionsDone() {
    const aliveWolves = this.getAliveWolves();
    const aliveDoctor = [...this.players.values()].find(p => p.role === ROLE.DOCTOR && p.alive);
    const aliveSeer = [...this.players.values()].find(p => p.role === ROLE.SEER && p.alive);

    // All alive wolves must have acted
    const wolvesDone = aliveWolves.every(w => this.nightActions.has(w.user.id));
    if (!wolvesDone) return false;

    // Doctor must have acted (if alive)
    if (aliveDoctor && !this.nightActions.has(aliveDoctor.user.id)) return false;

    // Seer must have acted (if alive)
    if (aliveSeer && !this.nightActions.has(aliveSeer.user.id)) return false;

    return true;
  }

  /* ── Resolve Night ── */

  resolveNight() {
    const results = {
      killed: null,
      saved: false,
      wolfTarget: null,
    };

    if (this.wolfTarget) {
      const target = this.players.get(this.wolfTarget);
      results.wolfTarget = target;

      if (this.doctorTarget === this.wolfTarget) {
        // Doctor saved the target!
        results.saved = true;
        results.killed = null;
        this.lastProtected = this.doctorTarget;
      } else {
        // Target dies
        target.alive = false;
        results.killed = target;
        this.lastProtected = this.doctorTarget || null;
      }
    } else {
      // Wolves didn't choose (timer expired without wolf action)
      results.killed = null;
    }

    // Reset night actions
    this.wolfTarget = null;
    this.doctorTarget = null;
    this.seerTarget = null;
    this.nightActions.clear();

    return results;
  }

  /* ── Day Voting ── */

  vote(voterId, targetId) {
    const voter = this.players.get(voterId);
    const target = this.players.get(targetId);
    if (!voter) return { success: false, message: '🚫 You are not in the game!' };
    if (!target) return { success: false, message: '🚫 Target not found!' };
    if (!voter.alive) return { success: false, message: '💀 Dead players cannot vote!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (voterId === targetId) return { success: false, message: '🚫 You cannot vote for yourself!' };
    this.votes.set(voterId, targetId);
    return { success: true, message: `🗳️ **${voter.user.username}** voted for **${target.user.username}**!` };
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
    if (targets.length === 0) return { eliminated: null, message: '🗳️ No one voted! No one was eliminated.' };
    if (targets.length > 1) return { eliminated: null, message: '⚖️ It\'s a tie! No one was eliminated.' };
    const eliminated = this.players.get(targets[0]);
    eliminated.alive = false;
    return { eliminated, message: `💀 **${eliminated.user.username}** was eliminated! They were **${eliminated.role}**!` };
  }

  /* ── Win Check ── */

  checkWin() {
    let aliveWolves = 0, aliveVillagers = 0;
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

  /* ── Helpers ── */

  getWolves() {
    return [...this.players.values()].filter(p => p.role === ROLE.WOLF);
  }

  getAliveWolves() {
    return [...this.players.values()].filter(p => p.role === ROLE.WOLF && p.alive);
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

  getAlivePlayers() {
    return [...this.players.values()].filter(p => p.alive);
  }

  getAllPlayers() {
    return [...this.players.values()];
  }

  startNight() {
    this.state = GAME_STATE.NIGHT;
    this.wolfTarget = null;
    this.doctorTarget = null;
    this.seerTarget = null;
    this.nightActions.clear();
    this.votes.clear();
  }

  startDay() {
    this.state = GAME_STATE.DAY;
    this.votes.clear();
  }

  end() {
    this.state = GAME_STATE.ENDED;
    if (this.nightTimer) { clearTimeout(this.nightTimer); this.nightTimer = null; }
    if (this.dayTimer) { clearTimeout(this.dayTimer); this.dayTimer = null; }
    return this.getAllPlayers();
  }

  /* ── Display Helpers ── */

  getPlayerListString() {
    return this.getAlivePlayers().map(p => `**${p.number}.** <@${p.user.id}>`).join('\n');
  }

  getDeadListString() {
    const dead = this.getAllPlayers().filter(p => !p.alive);
    if (dead.length === 0) return null;
    return dead.map(p => `~~**${p.number}.** ${p.user.username} — ${p.role}~~`).join('\n');
  }

  getFullPlayerListString() {
    return this.getAllPlayers().map(p =>
      `**${p.number}.** <@${p.user.id}> — ${p.role} ${p.alive ? '✅' : '💀'}`
    ).join('\n');
  }

  getAlivePlayersCompact() {
    return this.getAlivePlayers().map(p => `**${p.number}.** ${p.user.username}`).join('\n');
  }
}

const activeGames = new Map();

module.exports = { WerewolfGame, GAME_STATE, ROLE, ROLE_COLORS, activeGames, NIGHT_TIMER, DAY_TIMER };
