/* ═══════════════════════════════════════════
   💰  Wallet Helpers — Shared for all currency commands

   getOrCreateWallet(supabase, userId, guildId, username)
     → Fetches wallet, creates if missing, always returns valid object or { error }
   ═══════════════════════════════════════════ */

const CURRENCY = '₹';

/**
 * Get or create a wallet for a user in a guild.
 * Returns { wallet, error } — wallet is valid object or null, error is string or null.
 */
async function getOrCreateWallet(supabase, userId, guildId, username) {
  // Try fetching first
  const { data: wallet, error: fetchError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('guild_id', guildId)
    .maybeSingle();

  if (fetchError) {
    console.error('Wallet fetch error:', fetchError);
    return { wallet: null, error: `Fetch failed: \`${fetchError.message}\` (code: ${fetchError.code})` };
  }

  if (wallet) return { wallet, error: null };

  // Wallet doesn't exist — create it
  const { data: newWallet, error: createError } = await supabase
    .from('wallets')
    .insert({ user_id: userId, guild_id: guildId, balance: 0, bank: 0, username: username })
    .select()
    .single();

  if (createError) {
    console.error('Wallet create error:', createError);
    return { wallet: null, error: `Create failed: \`${createError.message}\` (code: ${createError.code})` };
  }

  return { wallet: newWallet, error: null };
}

/**
 * Safe wallet object with defaults for missing fields
 */
function safeWallet(wallet) {
  return {
    balance: 0,
    bank: 0,
    last_daily: null,
    last_work: null,
    last_beg: null,
    last_rob: null,
    username: '',
    ...wallet,
  };
}

module.exports = { getOrCreateWallet, safeWallet, CURRENCY };
