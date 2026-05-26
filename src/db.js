/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Uses SERVICE_ROLE key ONLY — it bypasses RLS (Row Level Security).
   The anon key is NOT accepted because it causes RLS permission errors.
   This is safe for a private bot — no public-facing API.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable.');
}

// ONLY service_role key is accepted — anon key causes RLS errors
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_KEY environment variable.\n' +
    'Go to Supabase Dashboard → Settings → API → Copy the "service_role" key (secret).\n' +
    'Do NOT use the "anon" key — it will cause RLS permission errors!'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey
);

module.exports = supabase;
