/* ═══════════════════════════════════════════
   🔐 Sodium Shim v2 — Proper libsodium-wrappers API
   ═══════════════════════════════════════════
   @discordjs/voice checks encryption libs in this order:
     1. sodium-native
     2. sodium
     3. libsodium-wrappers  ← we intercept this
     4. tweetnacl           ← fallback
   
   It calls: libsodium-wrappers.crypto_secretbox_open_easy()
             libsodium-wrappers.crypto_secretbox_easy()
             libsodium-wrappers.randombytes_buf()
   
   Previous shim was BROKEN — it exposed crypto_secretbox / 
   crypto_secretbox_open (wrong API!) which made @discordjs/voice
   set encryption methods to undefined → voice stuck at signalling.
   
   This shim provides the CORRECT libsodium-wrappers API using
   tweetnacl as the underlying crypto engine. No native deps needed.
   ═══════════════════════════════════════════ */

const nacl = require('tweetnacl');

const api = {
  // ═══ Constants that @discordjs/voice checks ═══
  crypto_secretbox_KEYBYTES: nacl.secretbox.keyLength,     // 32
  crypto_secretbox_NONCEBYTES: nacl.secretbox.nonceLength, // 24
  crypto_box_MACBYTES: nacl.secretbox.overheadLength,      // 16

  /**
   * Decrypt a message (libsodium-wrappers API)
   * @param {Buffer} ciphertext - Encrypted data (MAC + plaintext)
   * @param {Buffer} nonce - 24-byte nonce
   * @param {Uint8Array} secretKey - 32-byte key
   * @returns {Buffer|null} Decrypted data, or null on failure
   */
  crypto_secretbox_open_easy(ciphertext, nonce, secretKey) {
    const cipherU8 = toUint8Array(ciphertext);
    const nonceU8 = toUint8Array(nonce);
    const keyU8 = toUint8Array(secretKey);

    const decrypted = nacl.secretbox.open(cipherU8, nonceU8, keyU8);
    if (!decrypted) return null;
    return Buffer.from(decrypted);
  },

  /**
   * Encrypt a message (libsodium-wrappers API)
   * @param {Buffer} message - Plaintext data
   * @param {Buffer} nonce - 24-byte nonce
   * @param {Uint8Array} secretKey - 32-byte key
   * @returns {Buffer} Encrypted data (MAC + ciphertext)
   */
  crypto_secretbox_easy(message, nonce, secretKey) {
    const msgU8 = toUint8Array(message);
    const nonceU8 = toUint8Array(nonce);
    const keyU8 = toUint8Array(secretKey);

    const encrypted = nacl.secretbox(msgU8, nonceU8, keyU8);
    if (!encrypted) {
      throw new Error('crypto_secretbox_easy: encryption failed');
    }
    return Buffer.from(encrypted);
  },

  /**
   * Generate random bytes
   * @param {Buffer} buffer - Buffer to fill with random bytes
   */
  randombytes_buf(buffer) {
    const bytes = nacl.randomBytes(buffer.length);
    buffer.set(bytes);
  },

  // ═══ Promise-based ready (libsodium-wrappers compatibility) ═══
  // @discordjs/voice does: if (lib.ready) await lib.ready
  ready: Promise.resolve(true),
};

/**
 * Convert Buffer/Uint8Array to Uint8Array
 */
function toUint8Array(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (Buffer.isBuffer(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Uint8Array(buf);
}

// ═══════════════════════════════════════════
// INJECT INTO REQUIRE CACHE
// ═══════════════════════════════════════════
// This makes require('libsodium-wrappers') return our shim
// @discordjs/voice will find it and use it for voice encryption
// ═══════════════════════════════════════════

const Module = require('module');

if (!global.__sodiumShimV2Installed) {
  global.__sodiumShimV2Installed = true;

  // Store original resolve
  const originalResolve = Module._resolveFilename;

  // Patch module resolution
  Module._resolveFilename = function (request, parent, isMain, options) {
    // Intercept libsodium-wrappers and libsodium-wrappers-sumo
    if (request === 'libsodium-wrappers' || request === 'libsodium-wrappers-sumo') {
      // Return our shim's path instead of looking for the real package
      return require.resolve(__filename);
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };

  // Inject into require cache so require() returns our api object directly
  const shimPath = require.resolve(__filename);
  const shimModule = new Module(shimPath, null);
  shimModule.filename = shimPath;
  shimModule.exports = api;
  shimModule.loaded = true;
  require.cache[shimPath] = shimModule;

  // Also pre-cache for the bare name (belt & suspenders)
  const barePaths = ['libsodium-wrappers', 'libsodium-wrappers-sumo'];
  for (const p of barePaths) {
    if (!require.cache[p]) {
      const m = new Module(p, null);
      m.filename = p;
      m.exports = api;
      m.loaded = true;
      require.cache[p] = m;
    }
  }

  console.log('✅ Sodium shim v2 installed — correct libsodium-wrappers API via tweetnacl');
  console.log('   crypto_secretbox_open_easy ✅');
  console.log('   crypto_secretbox_easy ✅');
  console.log('   randombytes_buf ✅');
  console.log('   ready (Promise) ✅');
}

module.exports = api;
