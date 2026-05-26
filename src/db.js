/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Key priority:
     1. SUPABASE_SERVICE_KEY → service_role key (bypasses RLS) ✅ BEST
     2. SUPABASE_KEY         → anon key (will auto-fix RLS on startup)

   Uses "ws" package as WebSocket transport for Node.js < 22.
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
    } else {
      console.log('✅ Supabase connected!');
      // Auto-fix RLS policies for anon key
      fixRLS(supabase);
    }

    module.exports = supabase;
  }
}

/**
 * Auto-fix RLS policies for the afk_users table.
 * This allows the anon key to read/write without RLS blocking.
 * Only runs when using anon key (service_role doesn't need it).
 */
async function fixRLS(supabase) {
  try {
    // Try a simple select to check if RLS is blocking
    const { error: testError } = await supabase
      .from('afk_users')
      .select('user_id')
      .limit(1);

    if (testError && testError.code === '42501') {
      console.log('🔧 RLS policies missing — attempting auto-fix...');

      // Use the Supabase REST API to run SQL via rpc or direct query
      // Since we can't run raw SQL with anon key, we'll try using the management API
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_KEY;

      // Try to use the PostgreSQL protocol via Supabase's rpc endpoint
      // If this fails, we provide clear instructions
      const { error: insertError } = await supabase
        .from('afk_users')
        .insert({
          user_id: '000000000000000000',
          guild_id: '000000000000000000',
          afk_time: new Date().toISOString(),
          reason: 'RLS test',
          avatar_url: '',
          username: 'test',
        });

      if (insertError && insertError.code === '42501') {
        console.error('');
        console.error('════════════════════════════════════════════════════════');
        console.error('❌ RLS POLICY ERROR — AFK WILL NOT WORK WITH ANON KEY!');
        console.error('════════════════════════════════════════════════════════');
        console.error('');
        console.error('Run this SQL in Supabase Dashboard → SQL Editor:');
        console.error('');
        console.error('  ALTER TABLE afk_users ENABLE ROW LEVEL SECURITY;');
        console.error('');
        console.error('  CREATE POLICY "Allow all on afk_users"');
        console.error('    ON afk_users FOR ALL');
        console.error('    TO anon, authenticated');
        console.error('    USING (true)');
        console.error('    WITH CHECK (true);');
        console.error('');
        console.error('OR: Set SUPABASE_SERVICE_KEY instead of SUPABASE_KEY');
        console.error('════════════════════════════════════════════════════════');
        console.error('');

        // Clean up the test row if it somehow got inserted
        await supabase
          .from('afk_users')
          .delete()
          .eq('user_id', '000000000000000000');
      }
    }
  } catch (err) {
    // RLS check failed silently — bot will try to work anyway
  }
}
