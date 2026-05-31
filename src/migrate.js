/* ═══════════════════════════════════════════
   🔧  Auto Migration — Creates tables & disables RLS

   Runs BEFORE the bot starts.
   Uses DATABASE_URL (PostgreSQL connection string) for direct access.
   Falls back to Supabase Management API if no DATABASE_URL.
   ═══════════════════════════════════════════ */

const https = require('https');

const MIGRATIONS = `
-- ✅ Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  balance BIGINT DEFAULT 0,
  bank BIGINT DEFAULT 0,
  last_daily TIMESTAMPTZ,
  last_work TIMESTAMPTZ,
  last_beg TIMESTAMPTZ,
  last_rob TIMESTAMPTZ,
  last_gamble TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

-- ✅ Server pool table
CREATE TABLE IF NOT EXISTS server_pools (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  guild_name TEXT DEFAULT '',
  balance BIGINT DEFAULT 0,
  total_donated BIGINT DEFAULT 0,
  donor_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ✅ Pool donors table
CREATE TABLE IF NOT EXISTS pool_donors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  total_donated BIGINT DEFAULT 0,
  donation_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

-- ✅ Mimic access table
CREATE TABLE IF NOT EXISTS mimic_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  allowed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

-- ✅ Mimic LOG access table (separate from mimic access!)
CREATE TABLE IF NOT EXISTS mimic_log_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  granted_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

-- ✅ Disable RLS on ALL tables
ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE server_pools DISABLE ROW LEVEL SECURITY;
ALTER TABLE pool_donors DISABLE ROW LEVEL SECURITY;
ALTER TABLE mimic_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE mimic_log_access DISABLE ROW LEVEL SECURITY;

-- ✅ Hand Cricket profiles table
CREATE TABLE IF NOT EXISTS hc_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  username TEXT DEFAULT '',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  total_runs INT DEFAULT 0,
  total_wickets INT DEFAULT 0,
  highest_score INT DEFAULT 0,
  total_balls INT DEFAULT 0,
  total_fours INT DEFAULT 0,
  total_sixes INT DEFAULT 0,
  win_streak INT DEFAULT 0,
  best_win_streak INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hc_profiles DISABLE ROW LEVEL SECURITY;

-- ✅ Add win_streak columns if they don't exist (safe migration for existing tables)
DO $$ BEGIN
  ALTER TABLE hc_profiles ADD COLUMN IF NOT EXISTS win_streak INT DEFAULT 0;
  ALTER TABLE hc_profiles ADD COLUMN IF NOT EXISTS best_win_streak INT DEFAULT 0;
  ALTER TABLE hc_profiles ADD COLUMN IF NOT EXISTS total_fours INT DEFAULT 0;
  ALTER TABLE hc_profiles ADD COLUMN IF NOT EXISTS total_sixes INT DEFAULT 0;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ✅ AFK Break Access table
CREATE TABLE IF NOT EXISTS afk_break_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  allowed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

-- ✅ AFK Break Access Config table
CREATE TABLE IF NOT EXISTS afk_break_access_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  allowed_role_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE afk_break_access DISABLE ROW LEVEL SECURITY;
ALTER TABLE afk_break_access_config DISABLE ROW LEVEL SECURITY;

-- ✅ Mimic Protected table (bot owner only can add/remove)
CREATE TABLE IF NOT EXISTS mimic_protected (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, guild_id)
);

ALTER TABLE mimic_protected DISABLE ROW LEVEL SECURITY;

-- ✅ Lootbox Config table
CREATE TABLE IF NOT EXISTS lootbox_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id TEXT NOT NULL UNIQUE,
  guild_name TEXT DEFAULT '',
  enabled BOOLEAN DEFAULT false,
  channel_id TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lootbox_config DISABLE ROW LEVEL SECURITY;
`;

async function runMigrations() {
  console.log('🔧 Running database migrations...');

  const url = process.env.SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (!url) {
    console.log('⚠️  No SUPABASE_URL — skipping migrations.');
    return;
  }

  // Extract project ref: https://xxxxx.supabase.co → xxxxx
  const projectRef = url.replace('https://', '').split('.')[0];

  if (!accessToken) {
    console.log('⚠️  No SUPABASE_ACCESS_TOKEN — cannot auto-migrate.');
    console.log('   Add SUPABASE_ACCESS_TOKEN to Railway to auto-fix!');
    console.log('');
    console.log('   OR run this SQL manually in Supabase SQL Editor:');
    console.log('   ─────────────────────────────────────────');
    MIGRATIONS.trim().split('\n').forEach(line => {
      if (line.trim()) console.log('   ' + line);
    });
    console.log('   ─────────────────────────────────────────');
    return;
  }

  // Run each statement separately for better error handling
  const statements = MIGRATIONS
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let success = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      const result = await querySupabase(projectRef, accessToken, stmt + ';');
      if (result.ok) {
        success++;
      } else {
        const text = await result.text();
        // "already exists" is fine, "does not exist" we can skip
        if (text.includes('already exists') || text.includes('42P07')) {
          skipped++;
        } else if (text.includes('does not exist') || text.includes('42P01')) {
          console.log(`  ⏭️  Skipped (table doesn't exist yet): ${stmt.substring(0, 60)}...`);
          skipped++;
        } else {
          console.error(`  ❌ Error: ${text.substring(0, 100)}`);
          console.error(`     SQL: ${stmt.substring(0, 80)}...`);
        }
      }
    } catch (err) {
      console.error(`  ❌ Network error: ${err.message}`);
    }
  }

  console.log(`✅ Migration done: ${success} success, ${skipped} skipped`);
}

function querySupabase(projectRef, accessToken, query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });

    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      resolve(res);
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Run
runMigrations().then(() => {
  console.log('');
}).catch(err => {
  console.error('❌ Migration failed:', err.message);
  console.log('');
});
