/* ═══════════════════════════════════════════
   🐺 Werewolf Game Engine — Wolfia Style
   
   Two Game Modes:
   
   🍿 POPCORN (default):
   - Village vs Wolves
   - One player holds the GUN
   - w.shoot @player to shoot someone
   - Shoot opposite team → target dies, keep gun
   - Shoot same team → SHOOTER dies, gun passes to target
   - No night phase, all action in channel
   - Wolves know each other, villagers don't know wolves
   
   🕵️ MAFIA:
   - Town vs Mafia
   - Day: w.vote to lynch someone
   - Night: Mafia kills (w.nightkill), Cop investigates (w.check)
   - Doctor saves (w.save)
   
   Commands (Wolfia-style):
   - w.in       → sign up
   - w.out      → drop out
   - w.setup    → configure game
   - w.start    → start game
   - w.shoot    → shoot with gun (Popcorn)
   - w.vote     → vote to lynch (Mafia day)
   - w.unvote   → remove your vote (Mafia)
   - w.votecount→ show votes (Mafia)
   - w.nightkill→ mafia kill at night (Mafia DM)
   - w.check    → cop investigate (Mafia DM)
   - w.save     → doctor save (Mafia DM)
   - w.status   → current game status
   - w.end      → end game (host only)
   - w.help     → show commands
   ═══════════════════════════════════════════ */

const GAME_MODE = {
  POPCORN: 'popcorn',
  MAFIA: 'mafia',
};

const GAME_STATE = {
  WAITING: 'waiting',
  NIGHT: 'night',
  DAY: 'day',
  ENDED: 'ended',
};

const ROLE = {
  VILLAGER: 'Villager',
  WOLF: 'Wolf',
  DOCTOR: 'Doctor',
  SEER: 'Seer',       // used as Cop in Mafia mode
};

const ROLE_EMOJI = {
  [ROLE.VILLAGER]: '🏘️',
  [ROLE.WOLF]: '🐺',
  [ROLE.DOCTOR]: '💊',
  [ROLE.SEER]: '🔮',
};

const ROLE_COLORS = {
  [ROLE.VILLAGER]: 0x2ECC71,
  [ROLE.WOLF]: 0xE74C3C,
  [ROLE.DOCTOR]: 0x3498DB,
  [ROLE.SEER]: 0x9B59B6,
};

const NIGHT_TIMER = 60;
const DAY_TIMER = 90;

class WerewolfGame {
  constructor(guildId, channelId, hostId) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.hostId = hostId;
    this.state = GAME_STATE.WAITING;
    this.mode = GAME_MODE.POPCORN; // default popcorn
    this.players = new Map();
    this.votes = new Map();       // voterId → targetId (Mafia day)
    this.round = 0;
    this.playerNumber = 0;
    this.started = false;

    // Popcorn: who holds the gun
    this.gunHolder = null;        // userId

    // Mafia night actions
    this.wolfTarget = null;
    this.doctorTarget = null;
    this.seerTarget = null;
    this.nightActions = new Set();
    this.nightTimer = null;
    this.dayTimer = null;
    this.lastProtected = null;

    // Setup settings
    this.dayLength = 5;           // minutes
    this.channel = null;

    // Shoot cooldown (prevent spam)
    this.lastShootTime = 0;
  }

  /* ── Setup ── */

  setMode(mode) {
    if (this.state !== GAME_STATE.WAITING) return { success: false, message: '🚫 Can only change mode before game starts!' };
    if (!Object.values(GAME_MODE).includes(mode)) return { success: false, message: '🚫 Invalid mode! Use `popcorn` or `mafia`' };
    this.mode = mode;
    return { success: true, message: `🎮 Game mode set to **${mode === GAME_MODE.POPCORN ? '🍿 Popcorn' : '🕵️ Mafia'}**!` };
  }

  setDayLength(minutes) {
    if (this.state !== GAME_STATE.WAITING) return { success: false, message: '🚫 Can only change settings before game starts!' };
    const m = parseInt(minutes);
    if (isNaN(m) || m < 1 || m > 30) return { success: false, message: '🚫 Day length must be 1-30 minutes!' };
    this.dayLength = m;
    return { success: true, message: `⏰ Day length set to **${m} minutes**!` };
  }

  /* ── Sign Up ── */

  join(user) {
    if (this.state !== GAME_STATE.WAITING) {
      return { success: false, message: '🚫 Game already started! Wait for the next one.' };
    }
    if (this.players.has(user.id)) {
      return { success: false, message: '🚫 You are already signed up!' };
    }
    if (this.players.size >= 26) {
      return { success: false, message: '🚫 Game is full! Max 26 players.' };
    }
    this.playerNumber++;
    this.players.set(user.id, {
      user,
      role: null,
      alive: true,
      number: this.playerNumber,
    });
    return { success: true, message: `✅ **${user.username}** signed up! (${this.players.size} players)` };
  }

  leave(userId) {
    if (this.state !== GAME_STATE.WAITING) {
      return { success: false, message: '🚫 Cannot leave after game has started!' };
    }
    if (!this.players.has(userId)) {
      return { success: false, message: '🚫 You are not signed up!' };
    }
    this.players.delete(userId);
    // Re-number players
    let num = 0;
    for (const [, player] of this.players) {
      num++;
      player.number = num;
    }
    this.playerNumber = num;
    return { success: true, message: `👋 Dropped from the game! (${this.players.size} players remaining)` };
  }

  /* ── Start ── */

  start() {
    const playerCount = this.players.size;
    const minPlayers = this.mode === GAME_MODE.POPCORN ? 3 : 4;

    if (playerCount < minPlayers) {
      return { success: false, message: `🚫 Need at least **${minPlayers} players** to start ${this.mode === GAME_MODE.POPCORN ? 'Popcorn' : 'Mafia'}!` };
    }

    // Wolf count based on player count
    let wolfCount;
    if (playerCount <= 4) wolfCount = 1;
    else if (playerCount <= 7) wolfCount = 2;
    else if (playerCount <= 10) wolfCount = 3;
    else if (playerCount <= 15) wolfCount = 4;
    else wolfCount = 5;

    // Shuffle for role assignment
    const playerIds = [...this.players.keys()];
    const shuffled = playerIds.sort(() => Math.random() - 0.5);

    // Assign wolves
    for (let i = 0; i < wolfCount; i++) {
      this.players.get(shuffled[i]).role = ROLE.WOLF;
    }

    // Assign Doctor (Mafia mode only, 5+ players)
    if (this.mode === GAME_MODE.MAFIA && playerCount >= 5) {
      for (let i = wolfCount; i < shuffled.length; i++) {
        if (!this.players.get(shuffled[i]).role) {
          this.players.get(shuffled[i]).role = ROLE.DOCTOR;
          break;
        }
      }
    }

    // Assign Seer/Cop (5+ players)
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

    this.started = true;

    if (this.mode === GAME_MODE.POPCORN) {
      // Popcorn: start with day phase, give gun to random wolf
      this.state = GAME_STATE.DAY;
      this.round = 1;
      const aliveWolves = this.getAliveWolves();
      const gunWolf = aliveWolves[Math.floor(Math.random() * aliveWolves.length)];
      this.gunHolder = gunWolf.user.id;
      return { success: true, wolfCount, mode: GAME_MODE.POPCORN };
    } else {
      // Mafia: start with night phase
      this.state = GAME_STATE.NIGHT;
      this.round = 1;
      return { success: true, wolfCount, mode: GAME_MODE.MAFIA };
    }
  }

  /* ── Popcorn: Shoot ── */

  shoot(shooterId, targetNum) {
    if (this.mode !== GAME_MODE.POPCORN) {
      return { success: false, message: '🚫 `w.shoot` is only for Popcorn mode! Use `w.vote` in Mafia mode.' };
    }
    if (this.state !== GAME_STATE.DAY) {
      return { success: false, message: '🚫 No active game!' };
    }
    if (this.gunHolder !== shooterId) {
      return { success: false, message: '🚫 You don\'t have the gun! Only the gun holder can shoot.' };
    }

    // Rate limit: 3 seconds between shots
    const now = Date.now();
    if (now - this.lastShootTime < 3000) {
      return { success: false, message: '⏳ Slow down! Wait a moment before shooting again.' };
    }
    this.lastShootTime = now;

    const target = this.getPlayerByNumber(targetNum);
    if (!target) return { success: false, message: '🚫 Invalid player number!' };
    if (!target.alive) return { success: false, message: '💀 That player is already dead!' };
    if (target.user.id === shooterId) return { success: false, message: '🚫 You cannot shoot yourself!' };

    const shooter = this.players.get(shooterId);
    const sameTeam = (shooter.role === ROLE.WOLF && target.role === ROLE.WOLF) ||
                     (shooter.role !== ROLE.WOLF && target.role !== ROLE.WOLF);

    let result;
    if (sameTeam) {
      // Same team! Shooter dies, gun goes to target
      shooter.alive = false;
      this.gunHolder = target.user.id;
      result = {
        success: true,
        shooterDies: true,
        message: `💥 **${shooter.user.username}** shot **${target.user.username}** — but they were on the SAME TEAM!\n💀 **${shooter.user.username}** (${ROLE_EMOJI[shooter.role]} ${shooter.role}) dies instead!\n🔫 The gun passes to **${target.user.username}**!`,
      };
    } else {
      // Opposite team! Target dies, shooter keeps gun
      target.alive = false;
      result = {
        success: true,
        shooterDies: false,
        message: `💥 **${shooter.user.username}** shot **${target.user.username}**!\n💀 **${target.user.username}** (${ROLE_EMOJI[target.role]} ${target.role}) has been eliminated!\n🔫 **${shooter.user.username}** keeps the gun and shoots again!`,
      };
    }

    return result;
  }

  /* ── Mafia: Vote ── */

  vote(voterId, targetId) {
    if (this.mode !== GAME_MODE.MAFIA) {
      return { success: false, message: '🚫 `w.vote` is only for Mafia mode! Use `w.shoot` in Popcorn mode.' };
    }
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

  unvote(voterId) {
    if (this.mode !== GAME_MODE.MAFIA) {
      return { success: false, message: '🚫 `w.unvote` is only for Mafia mode!' };
    }
    if (!this.votes.has(voterId)) {
      return { success: false, message: '🚫 You haven\'t voted yet!' };
    }
    this.votes.delete(voterId);
    return { success: true, message: '↩️ Vote removed!' };
  }

  tallyVotes() {
    const voteCount = new Map();
    for (const [, targetId] of this.votes) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }

    // Build vote detail string
    let detailLines = [];
    for (const [targetId, count] of voteCount) {
      const target = this.players.get(targetId);
      const voters = [];
      for (const [voterId, tid] of this.votes) {
        if (tid === targetId) {
          const voter = this.players.get(voterId);
          voters.push(voter.user.username);
        }
      }
      detailLines.push(`**${target.user.username}** (${count}): ${voters.join(', ')}`);
    }

    let maxVotes = 0;
    let targets = [];
    for (const [targetId, count] of voteCount) {
      if (count > maxVotes) { maxVotes = count; targets = [targetId]; }
      else if (count === maxVotes) targets.push(targetId);
    }
    this.votes.clear();

    if (targets.length === 0) {
      return { eliminated: null, detail: detailLines.join('\n'), message: '🗳️ No one voted! No one was eliminated.' };
    }
    if (targets.length > 1) {
      return { eliminated: null, detail: detailLines.join('\n'), message: '⚖️ It\'s a tie! No one was eliminated.' };
    }
    const eliminated = this.players.get(targets[0]);
    eliminated.alive = false;
    return { eliminated, detail: detailLines.join('\n'), message: `💀 **${eliminated.user.username}** was lynched! They were **${ROLE_EMOJI[eliminated.role]} ${eliminated.role}**!` };
  }

  /* ── Mafia: Night Actions ── */

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
        : `🔮 **${target.user.username}** (#${target.number}) is **NOT** a wolf. They are ${ROLE_EMOJI[target.role]} ${target.role}.`,
    };
  }

  allNightActionsDone() {
    const aliveWolves = this.getAliveWolves();
    const aliveDoctor = [...this.players.values()].find(p => p.role === ROLE.DOCTOR && p.alive);
    const aliveSeer = [...this.players.values()].find(p => p.role === ROLE.SEER && p.alive);

    if (!aliveWolves.every(w => this.nightActions.has(w.user.id))) return false;
    if (aliveDoctor && !this.nightActions.has(aliveDoctor.user.id)) return false;
    if (aliveSeer && !this.nightActions.has(aliveSeer.user.id)) return false;
    return true;
  }

  resolveNight() {
    const results = { killed: null, saved: false, wolfTarget: null };
    if (this.wolfTarget) {
      const target = this.players.get(this.wolfTarget);
      results.wolfTarget = target;
      if (this.doctorTarget === this.wolfTarget) {
        results.saved = true;
        this.lastProtected = this.doctorTarget;
      } else {
        target.alive = false;
        results.killed = target;
        this.lastProtected = this.doctorTarget || null;
      }
    }

    this.wolfTarget = null;
    this.doctorTarget = null;
    this.seerTarget = null;
    this.nightActions.clear();
    return results;
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
      return { winner: 'villagers', message: '🏘️ **Village wins!** All wolves have been eliminated!' };
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

  /* ── Display ── */

  getPlayerListString() {
    return this.getAlivePlayers().map(p => `**${p.number}.** <@${p.user.id}>`).join('\n');
  }

  getAlivePlayersCompact() {
    return this.getAlivePlayers().map(p => `**${p.number}.** ${p.user.username}`).join('\n');
  }

  getDeadListString() {
    const dead = this.getAllPlayers().filter(p => !p.alive);
    if (dead.length === 0) return null;
    return dead.map(p => `~~**${p.number}.** ${p.user.username} — ${ROLE_EMOJI[p.role]} ${p.role}~~`).join('\n');
  }

  getFullPlayerListString() {
    return this.getAllPlayers().map(p =>
      `**${p.number}.** <@${p.user.id}> — ${ROLE_EMOJI[p.role]} ${p.role} ${p.alive ? '✅' : '💀'}`
    ).join('\n');
  }

  getVoteCountString() {
    if (this.votes.size === 0) return 'No votes yet.';
    const voteCount = new Map();
    for (const [, targetId] of this.votes) {
      const target = this.players.get(targetId);
      const key = target.user.username;
      voteCount.set(key, (voteCount.get(key) || 0) + 1);
    }
    return [...voteCount.entries()].map(([name, count]) => `**${name}**: ${count} vote${count > 1 ? 's' : ''}`).join('\n');
  }
}

const activeGames = new Map();

module.exports = {
  WerewolfGame, GAME_MODE, GAME_STATE, ROLE, ROLE_EMOJI, ROLE_COLORS,
  activeGames, NIGHT_TIMER, DAY_TIMER
};
