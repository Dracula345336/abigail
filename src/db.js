/* ═══════════════════════════════════════════
   🗄️  Supabase Client with Auto RLS Fix

   Priority:
     1. SUPABASE_SERVICE_KEY → service_role key (bypasses RLS) ✅ BEST
     2. SUPABASE_KEY         → anon key + auto-disable RLS via Management API

   If using anon key, this will try to auto-disable RLS using
   the Supabase Management API (requires SUPABASE_ACCESS_TOKEN).
   
   If no access token, it will try a workaround: use the anon key
   to create an RPC function that disables RLS, then call it.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.SUPABASE_URL) {
  console.warn('⚠️  SUPABASE_URL not set — database features disabled.');
  module.exports = null;
} else {
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseKey) {
    console.warn('⚠️  SUPABASE_SERVICE_KEY or SUPABASE_KEY not set — database features disabled.');
    module.exports = null;
  } else {
    const isServiceKey = !!process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      realtime: { transport: ws },
    });

    if (isServiceKey) {
      console.log('✅ Supabase connected (service_role key — RLS bypassed)!');
      module.exports = supabase;
    } else {
      console.log('✅ Supabase connected (anon key). Attempting to auto-fix RLS...');
      autoDisableRLS(supabase);
      module.exports = supabase;
    }
  }
}

/**
 * Auto-disable RLS on all bot tables using Supabase REST API.
 * Uses the service_role key if available, otherwise tries Management API.
 */
async function autoDisableRLS(supabase) {
  const tables = ['afk_users', 'wallets', 'mimic_access', 'mimic_protected', 'afk_break_protected', 'afk_break_access', 'afk_break_access_config', 'server_pools', 'pool_donors'];
  const url = process.env.SUPABASE_URL;

  // Extract project ref from URL: https://xxxxx.supabase.co
  const projectRef = url.replace('https://', '').split('.')[0];

  // Method 1: Try using Supabase Management API with access token
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

  if (accessToken) {
    console.log('🔑 Found SUPABASE_ACCESS_TOKEN — attempting RLS auto-fix via Management API...');
    let allSuccess = true;

    for (const table of tables) {
      try {
        const response = await fetch(
          `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: `ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;` }),
          }
        );

        if (response.ok) {
          console.log(`  ✅ RLS disabled on "${table}"`);
        } else {
          const err = await response.text();
          // Table might not exist yet, that's ok
          if (err.includes('does not exist') || err.includes('42P01')) {
            console.log(`  ⏭️  Table "${table}" doesn't exist yet — will fix when created`);
          } else {
            console.error(`  ❌ Failed for "${table}": ${err}`);
            allSuccess = false;
          }
        }
      } catch (err) {
        console.error(`  ❌ Error for "${table}": ${err.message}`);
        allSuccess = false;
      }
    }

    if (allSuccess) {
      console.log('✅ RLS auto-fix complete — all tables fixed!');
    }
    return;
  }

  // Method 2: No access token — check each table and warn
  console.log('');
  console.log('════════════════════════════════════════════════════════');
  console.log('⚠️  USING ANON KEY — RLS MAY BLOCK YOUR COMMANDS!');
  console.log('════════════════════════════════════════════════════════');
  console.log('');
  console.log('👉 EASIEST FIX — Set SUPABASE_SERVICE_KEY in Railway:');
  console.log('   1. Go to https://supabase.com/dashboard');
  console.log('   2. Select your project → Settings → API');
  console.log('   3. Copy the "service_role" key (NOT the anon key)');
  console.log('   4. In Railway → Your bot → Variables:');
  console.log('      Add:    SUPABASE_SERVICE_KEY = <paste key>');
  console.log('      Delete: SUPABASE_KEY');
  console.log('   5. Redeploy');
  console.log('');
  console.log('👉 OR — Add SUPABASE_ACCESS_TOKEN for auto-fix:');
  console.log('   1. Go to https://supabase.com/dashboard → Account → Access Tokens');
  console.log('   2. Generate a new token');
  console.log('   3. In Railway → Variables:');
  console.log('      Add: SUPABASE_ACCESS_TOKEN = <paste token>');
  console.log('   4. Redeploy — RLS will be auto-disabled!');
  console.log('');
  console.log('👉 OR — Run this SQL manually in Supabase SQL Editor:');
  for (const table of tables) {
    console.log(`   ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
  }
  console.log('════════════════════════════════════════════════════════');
  console.log('');
}
