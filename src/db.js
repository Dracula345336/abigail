/* ═══════════════════════════════════════════
   🗄️  Supabase Client

   Creates the Supabase client directly from environment variables.
   No separate gitignored file needed — credentials come from env vars.

   For Node.js < 22, the `ws` package is required for realtime support.
   ═══════════════════════════════════════════ */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_KEY environment variables.\n' +
    'Add them to your .env file or Railway environment.'
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    realtime: {
      transport: ws,
    },
  }
);

module.exports = supabase;
