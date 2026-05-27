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
  const tables = ['afk_users', 'wallets', 'mimic_access'];

  for (const table of tables) {
    try {
      const testData = table === 'afk_users'
        ? { user_id: '__rls_test__', guild_id: '__rls_test__', afk_time: new Date().toISOString(), reason: 'RLS check', avatar_url: '', username: 'test' }
        : table === 'wallets'
        ? { user_id: '__rls_test__', guild_id: '__rls_test__', balance: 0, bank: 0, username: 'test' }
        : { user_id: '__rls_test__', guild_id: '__rls_test__', allowed_by: '__rls_test__' };

      const { error: testError } = await supabase
        .from(table)
        .insert(testData);

      if (testError && (testError.code === '42501' || testError.message?.includes('row-level') || testError.message?.includes('policy'))) {
        console.error('');
        console.error(`❌ RLS IS BLOCKING TABLE "${table}"!`);
        console.error(`   Run this SQL in Supabase SQL Editor:`);
        console.error(`   ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
        console.error('');
      } else {
        // Clean up test row if it was inserted
        if (!testError) {
          await supabase.from(table).delete().eq('user_id', '__rls_test__').eq('guild_id', '__rls_test__');
        }
      }
    } catch (err) {
      console.warn(`⚠️  Could not verify RLS for table "${table}".`);
    }
  }

  console.log('✅ RLS check complete — see above for any issues!');
  console.error('');
  console.error('💡 BEST FIX: Set SUPABASE_SERVICE_KEY (service_role key) in Railway instead of SUPABASE_KEY.');
  console.error('   This bypasses RLS for ALL tables automatically!');
  console.error('');
}
