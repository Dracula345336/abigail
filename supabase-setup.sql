-- ═══════════════════════════════════════════════════════════════
-- 🗄️  Supabase Setup for Sweetheart Bot
--
-- Run this ENTIRE SQL in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- 1. Create afk_users table
CREATE TABLE IF NOT EXISTS afk_users (
  user_id    TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  afk_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason     TEXT DEFAULT 'Just stepped away for a moment 💫',
  avatar_url TEXT,
  username   TEXT,
  PRIMARY KEY (user_id, guild_id)
);

-- 2. Create mimic_access table
CREATE TABLE IF NOT EXISTS mimic_access (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT,
  granted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- 3. Create wallets table (Dank Memer style INR currency)
CREATE TABLE IF NOT EXISTS wallets (
  user_id     TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  balance     BIGINT NOT NULL DEFAULT 0,
  bank        BIGINT NOT NULL DEFAULT 0,
  last_daily  TIMESTAMPTZ,
  last_work   TIMESTAMPTZ,
  last_beg    TIMESTAMPTZ,
  last_rob    TIMESTAMPTZ,
  username    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

-- 4. Create server_pools table (server event donations)
CREATE TABLE IF NOT EXISTS server_pools (
  guild_id   TEXT NOT NULL PRIMARY KEY,
  balance    BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create pool_donors table (track who donated)
CREATE TABLE IF NOT EXISTS pool_donors (
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  username   TEXT,
  total      BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, user_id)
);

-- 6. Create afk_break_access table (who can break your AFK)
CREATE TABLE IF NOT EXISTS afk_break_access (
  guild_id          TEXT NOT NULL,
  owner_id          TEXT NOT NULL,
  allowed_user_id   TEXT NOT NULL,
  allowed_username  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (guild_id, owner_id, allowed_user_id)
);

-- 7. Create afk_break_access_config table (lock/unlock AFK break)
CREATE TABLE IF NOT EXISTS afk_break_access_config (
  user_id    TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  locked     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, guild_id)
);

-- 8. Create hc_profiles table (Hand Cricket player stats)
CREATE TABLE IF NOT EXISTS hc_profiles (
  user_id          TEXT NOT NULL PRIMARY KEY,
  username         TEXT,
  games_played     INTEGER NOT NULL DEFAULT 0,
  games_won        INTEGER NOT NULL DEFAULT 0,
  total_runs       INTEGER NOT NULL DEFAULT 0,
  total_wickets    INTEGER NOT NULL DEFAULT 0,
  highest_score    INTEGER NOT NULL DEFAULT 0,
  total_balls      INTEGER NOT NULL DEFAULT 0,
  total_fours      INTEGER NOT NULL DEFAULT 0,
  total_sixes      INTEGER NOT NULL DEFAULT 0,
  win_streak       INTEGER NOT NULL DEFAULT 0,
  best_win_streak  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Disable RLS on all tables
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE mimic_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_pools DISABLE ROW LEVEL SECURITY;
ALTER TABLE pool_donors DISABLE ROW LEVEL SECURITY;
ALTER TABLE afk_break_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE afk_break_access_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE hc_profiles DISABLE ROW LEVEL SECURITY;
