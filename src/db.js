/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Key priority:
     1. SUPABASE_SERVICE_KEY → service_role key (bypasses RLS) ✅ BEST
     2. SUPABASE_KEY         → anon key (needs RLS policies) ⚠️ MAY CAUSE RLS ERRORS

   If neither key is set, exports null and AFK features are disabled.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');

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
    const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

    if (isServiceKey) {
      console.log('✅ Supabase connected with service_role key (RLS bypassed)!');
    } else {
      console.log('✅ Supabase connected with anon key.');
      console.warn('⚠️  Using anon key — if you get RLS errors, switch to service_role key!');
      console.warn('   Get it from: Supabase Dashboard → Settings → API → service_role key (secret)');
    }

    module.exports = supabase;
  }
}
