/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Uses SERVICE_ROLE key to bypass RLS (Row Level Security).
   This is safe for a private bot — no public-facing API.

   For Node.js < 22, the `ws` package is required for realtime support.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable.');
}

// Try service_role key first (bypasses RLS), then fall back to SUPABASE_KEY
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_KEY or SUPABASE_KEY environment variable.\n' +
    'IMPORTANT: Use the "service_role" key from Supabase Dashboard → Settings → API\n' +
    'The "anon" key will cause RLS (Row Level Security) errors!'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey,
  {
    realtime: {
      transport: ws,
    },
  }
);

module.exports = supabase;
