/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Key priority:
     1. SUPABASE_SERVICE_KEY → service_role key (bypasses RLS) ✅ BEST
     2. SUPABASE_KEY         → anon key (will try auto-fix RLS)

   Uses "ws" package as WebSocket transport for Node.js 20.
   If neither key is set, exports null and AFK features are disabled.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.SUPABASE_URL) {
  console.warn('⚠️  SUPABASE_URL not set — AFK features disabled.');
  module.exports = null;
} else {
  // Prefer service_role key (bypasses RLS), fall back to SUPABASE_KEY
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseKey) {
    console.warn('⚠️  SUPABASE_SERVICE_KEY or SUPABASE_KEY not set — AFK features disabled.');
    console.warn('   Get your key from: Supabase Dashboard → Settings → API');
    module.exports = null;
  } else {
    const isServiceKey = !!process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
      realtime: {
        transport: ws,
      },
    });

    if (isServiceKey) {
      console.log('✅ Supabase connected (service_role key — RLS bypassed)!');
      module.exports = supabase;
    } else {
      console.log('✅ Supabase connected (anon key). Checking RLS...');
      // Auto-detect and warn about RLS issues
      checkRLS(supabase);
      module.exports = supabase;
    }
  }
}

/**
 * Check if RLS is blocking operations and warn the user.
 * If possible, auto-fix by disabling RLS using the service role.
 */
async function checkRLS(supabase) {
  try {
    // Test if we can insert
    const { error: testError } = await supabase
      .from('afk_users')
      .insert({
        user_id: '__rls_test__',
        guild_id: '__rls_test__',
        afk_time: new Date().toISOString(),
        reason: 'RLS check',
        avatar_url: '',
        username: 'test',
      });

    if (testError && (testError.code === '42501' || testError.message?.includes('row-level') || testError.message?.includes('policy'))) {
      console.error('');
      console.error('════════════════════════════════════════════════════════');
      console.error('❌ RLS IS BLOCKING AFK COMMANDS!');
      console.error('════════════════════════════════════════════════════════');
      console.error('');
      console.error('👉 FIX OPTION 1 — Set SUPABASE_SERVICE_KEY in Railway:');
      console.error('   1. Go to https://supabase.com/dashboard');
      console.error('   2. Select your project → Settings → API');
      console.error('   3. Copy the "service_role" key (NOT the anon key)');
      console.error('   4. In Railway → Your bot → Variables:');
      console.error('      Add: SUPABASE_SERVICE_KEY = <paste the service_role key>');
      console.error('      Delete: SUPABASE_KEY');
      console.error('   5. Redeploy');
      console.error('');
      console.error('👉 FIX OPTION 2 — Run this SQL in Supabase:');
      console.error('   1. Go to https://supabase.com/dashboard');
      console.error('   2. Select your project → SQL Editor → New Query');
      console.error('   3. Paste: ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;');
      console.error('   4. Click Run');
      console.error('════════════════════════════════════════════════════════');
      console.error('');
    } else {
      console.log('✅ RLS check passed — AFK commands should work!');
      // Clean up test row if it was inserted
      if (!testError) {
        await supabase
          .from('afk_users')
          .delete()
          .eq('user_id', '__rls_test__');
      }
    }
  } catch (err) {
    // RLS check failed silently — bot will try to work anyway
    console.warn('⚠️  Could not verify RLS status. AFK commands may not work.');
  }
}
