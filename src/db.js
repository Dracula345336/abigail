/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Key priority:
     1. SUPABASE_SERVICE_KEY → service_role key (bypasses RLS) ✅ BEST
     2. SUPABASE_KEY         → anon key (needs RLS policies set up)

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
    } else {
      console.log('✅ Supabase connected (anon key).');
      console.log('   ⚠️  If you get RLS errors, either:');
      console.log('      1. Set SUPABASE_SERVICE_KEY in your env vars, OR');
      console.log('      2. Run this SQL in Supabase SQL Editor:');
      console.log('         ALTER TABLE afk_users DISABLE ROW LEVEL SECURITY;');
    }

    module.exports = supabase;
  }
}
