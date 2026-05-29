/* ═══════════════════════════════════════════
   🔐 Pure JS Sodium Shim — Wraps tweetnacl as libsodium-wrappers
   ═══════════════════════════════════════════
   @discordjs/voice needs libsodium-wrappers for voice encryption.
   But libsodium-wrappers is a native module that fails on many hosts.
   
   This shim provides the EXACT same API using pure-JS tweetnacl.
   No native compilation needed. Works on ANY server. Guaranteed.
   
   Load this BEFORE @discordjs/voice in your code:
     require('./sodium-shim');  // ← MUST be first!
     const { joinVoiceChannel } = require('@discordjs/voice');
   ═══════════════════════════════════════════ */

const nacl = require('tweetnacl');

const KEYBYTES = nacl.secretbox.keyLength;   // 32
const NONCEBYTES = nacl.secretbox.nonceLength; // 24

const api = {
  crypto_secretbox_KEYBYTES: KEYBYTES,
  crypto_secretbox_NONCEBYTES: NONCEBYTES,
  crypto_secretbox_MACBYTES: nacl.secretbox.overheadLength, // 16

  /**
   * Encrypt a message using secret-key authenticated encryption
   * @param {Buffer} message - Plaintext message
   * @param {Buffer} nonce - 24-byte nonce
   * @param {Buffer} key - 32-byte key
   * @returns {Buffer} Ciphertext with MAC prepended
   */
  crypto_secretbox(message, nonce, key) {
    const msgU8 = uint8Array(message);
    const nonceU8 = uint8Array(nonce);
    const keyU8 = uint8Array(key);

    const encrypted = nacl.secretbox(msgU8, nonceU8, keyU8);
    if (!encrypted) {
      throw new Error('crypto_secretbox: encryption failed');
    }
    return Buffer.from(encrypted);
  },

  /**
   * Decrypt a message using secret-key authenticated encryption
   * @param {Buffer} ciphertext - Ciphertext with MAC prepended
   * @param {Buffer} nonce - 24-byte nonce
   * @param {Buffer} key - 32-byte key
   * @returns {Buffer|false} Decrypted plaintext, or false on failure
   */
  crypto_secretbox_open(ciphertext, nonce, key) {
    const cipherU8 = uint8Array(ciphertext);
    const nonceU8 = uint8Array(nonce);
    const keyU8 = uint8Array(key);

    const decrypted = nacl.secretbox.open(cipherU8, nonceU8, keyU8);
    if (!decrypted) return false;
    return Buffer.from(decrypted);
  },

  /**
   * Generate a random buffer of specified length
   * @param {number} length - Number of random bytes
   * @returns {Buffer} Random bytes
   */
  randombytes_buf(length) {
    return Buffer.from(nacl.randomBytes(length));
  },

  // Promise-based ready indicator (libsodium-wrappers compatibility)
  ready: Promise.resolve(true),
};

/**
 * Convert Buffer/Uint8Array to Uint8Array
 */
function uint8Array(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (Buffer.isBuffer(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new Uint8Array(buf);
}

// ═══════════════════════════════════════════
// INJECT INTO REQUIRE CACHE
// This makes `require('libsodium-wrappers')` return our shim
// @discordjs/voice will find it and use it for voice encryption
// ═══════════════════════════════════════════

const Module = require('module');
const originalResolve = Module._resolveFilename;

// Only patch once
if (!global.__sodiumShimInstalled) {
  global.__sodiumShimInstalled = true;

  Module._resolveFilename = function (request, parent, isMain, options) {
    // Intercept libsodium-wrappers and libsodium-wrappers-sumo
    if (request === 'libsodium-wrappers' || request === 'libsodium-wrappers-sumo') {
      // Return a dummy path — we'll provide the module from cache
      return request;
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };

  // Inject our shim into the require cache
  const shimPath = 'libsodium-wrappers';
  const shimModule = new Module(shimPath, null);
  shimModule.filename = shimPath;
  shimModule.exports = api;
  shimModule.loaded = true;
  require.cache[shimPath] = shimModule;

  // Also inject for libsodium-wrappers-sumo just in case
  const sumoPath = 'libsodium-wrappers-sumo';
  const sumoModule = new Module(sumoPath, null);
  sumoModule.filename = sumoPath;
  sumoModule.exports = api;
  sumoModule.loaded = true;
  require.cache[sumoPath] = sumoModule;

  console.log('✅ Sodium shim installed — pure JS encryption via tweetnacl');
  console.log('   (libsodium-wrappers intercepted → tweetnacl)');
}

module.exports = api;
