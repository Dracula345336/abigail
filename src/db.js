/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Uses SERVICE_ROLE key to bypass RLS (Row Level Security).
   This is safe for a private bot — no public-facing API.

   For Node.js < 22, the `ws` package is required for realtime support.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.\n' +
    'Add them to your .env file or Railway environment.\n\n' +
    'SUPABASE_SERVICE_KEY = your service_role key (found in Supabase Dashboard → Settings → API → service_role key)\n' +
    'This key bypasses RLS so the bot can read/write the afk_users table.'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

module.exports = supabase;
