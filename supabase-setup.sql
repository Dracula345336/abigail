-- ═══════════════════════════════════════════════════════════════
-- 🗄️  Supabase Setup for Sweetheart Bot
--
-- Run this SQL in: Supabase Dashboard → SQL Editor → New Query
-- This creates the afk_users table and sets up RLS policies.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create the afk_users table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS afk_users (
  user_id    TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  afk_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason     TEXT DEFAULT 'Just stepped away for a moment 💫',
  avatar_url TEXT,
  username   TEXT,
  PRIMARY KEY (user_id, guild_id)
);

-- 2. Enable Row Level Security
ALTER TABLE afk_users ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow all on afk_users" ON afk_users;
DROP POLICY IF EXISTS "Bot can read afk_users" ON afk_users;
DROP POLICY IF EXISTS "Bot can insert afk_users" ON afk_users;
DROP POLICY IF EXISTS "Bot can update afk_users" ON afk_users;
DROP POLICY IF EXISTS "Bot can delete afk_users" ON afk_users;

-- 4. Create a single policy that allows everything for anon and authenticated users
-- This is safe because the bot is the only client using these keys
CREATE POLICY "Allow all on afk_users"
  ON afk_users FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
