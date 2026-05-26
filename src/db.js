/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Uses SERVICE_ROLE key ONLY — it bypasses RLS (Row Level Security).
   The anon key is NOT accepted because it causes RLS permission errors.
   This is safe for a private bot — no public-facing API.

   If SUPABASE_SERVICE_KEY is missing, exports null instead of crashing.
   The bot will start, but AFK features will be disabled.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY not set — AFK features disabled.');
  console.warn('   Set SUPABASE_SERVICE_KEY to your service_role key from Supabase Dashboard → Settings → API');
  module.exports = null;
} else {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  module.exports = supabase;
}
