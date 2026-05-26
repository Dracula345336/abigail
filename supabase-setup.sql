-- ═══════════════════════════════════════════════════════════════
-- 🗄️  Supabase Setup for Sweetheart Bot
--
-- Run this ENTIRE SQL in: Supabase Dashboard → SQL Editor → New Query
-- This creates the afk_users table and fixes RLS policies.
--
-- ⚡ QUICK FIX: If your table already exists and you're getting
--    RLS errors, just run the "QUICK FIX" section below.
-- ═══════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────┐
-- │  ⚡ QUICK FIX — Run this if table exists    │
-- │  and you're getting RLS policy errors!      │
-- └─────────────────────────────────────────────┘

-- This completely disables RLS on the afk_users table.
-- Safe because this bot is the only client using the database.
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════
-- 🆕 FULL SETUP — Run this if the table doesn't exist yet
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

-- 2. Disable RLS (simplest & safest for a bot-only database)
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────
-- Alternative: If you want to keep RLS enabled, use these
-- policies instead of disabling RLS:
-- ───────────────────────────────────────────────────────────────
--
-- ALTER TABLE afk_users ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "Allow all on afk_users" ON afk_users;
-- CREATE POLICY "Allow all on afk_users"
--   ON afk_users FOR ALL
--   TO anon, authenticated
--   USING (true)
--   WITH CHECK (true);
