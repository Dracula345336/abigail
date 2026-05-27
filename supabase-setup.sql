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

-- 4. Disable RLS on all tables
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE mimic_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
