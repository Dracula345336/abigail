/* ═══════════════════════════════════════════
   🔐 Encryption Diagnostic — v3
   ═══════════════════════════════════════════
   PREVIOUS APPROACH (BROKEN): 
   We used Module._resolveFilename to intercept require('libsodium-wrappers')
   and return our own shim. This caused issues:
   - API mismatch (wrong method names in v1.7)
   - Module resolution race conditions in Docker
   - @discordjs/voice couldn't properly load our shim in production
   
   NEW APPROACH (WORKS):
   @discordjs/voice NATIVELY supports tweetnacl! It checks libs in order:
     1. sodium-native → not found
     2. sodium → not found  
     3. libsodium-wrappers → not found
     4. tweetnacl → FOUND! ✅
   
   We just need tweetnacl installed (it IS in package.json).
   This file is now just a DIAGNOSTIC utility — no more module hacks!
   ═══════════════════════════════════════════ */

const dgram = require('dgram');
const { generateDependencyReport } = require('@discordjs/voice');

/**
 * Verify encryption is working at startup
 */
function checkEncryption() {
  console.log('🔧 Checking encryption dependencies...');

  // Just verify tweetnacl is loadable
  try {
    const nacl = require('tweetnacl');
    const key = nacl.randomBytes(32);
    const nonce = nacl.randomBytes(24);
    const msg = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const enc = nacl.secretbox(msg, nonce, key);
    const dec = nacl.secretbox.open(enc, nonce, key);
    if (dec) {
      console.log('  ✅ tweetnacl encryption — WORKING');
    } else {
      console.error('  ❌ tweetnacl encryption — DECRYPT FAILED');
    }
  } catch (e) {
    console.error('  ❌ tweetnacl not found:', e.message);
  }

  // Log the @discordjs/voice dependency report
  try {
    console.log('  📋 Voice Dependency Report:');
    const report = generateDependencyReport();
    report.split('\n').forEach(line => console.log('     ' + line));
  } catch (e) {
    console.error('  ❌ Could not generate dependency report:', e.message);
  }
}

/**
 * Test outbound UDP connectivity
 * Discord voice requires UDP — if this fails, voice won't work
 */
function testUDP() {
  return new Promise((resolve) => {
    console.log('🔧 Testing outbound UDP connectivity...');
    const socket = dgram.createSocket('udp4');
    const TEST_HOST = '8.8.8.8'; // Google DNS
    const TEST_PORT = 53;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.close();
        console.error('  ❌ UDP test TIMEOUT — outbound UDP might be blocked!');
        console.error('     Discord voice REQUIRES outbound UDP.');
        console.error('     If you are on Railway/Render, this may be a hosting limitation.');
        resolve(false);
      }
    }, 5000);

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        console.error('  ❌ UDP test FAILED:', err.message);
        console.error('     Outbound UDP is not available — voice will NOT work!');
        resolve(false);
      }
    });

    socket.on('message', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        console.log('  ✅ UDP outbound — WORKING (can reach external servers)');
        resolve(true);
      }
    });

    // Send a DNS query packet to test UDP
    try {
      // Minimal DNS query for google.com
      const query = Buffer.from([
        0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x06, 0x67, 0x6f, 0x6f,
        0x67, 0x6c, 0x65, 0x03, 0x63, 0x6f, 0x6d, 0x00,
        0x00, 0x01, 0x00, 0x01
      ]);
      socket.send(query, TEST_PORT, TEST_HOST, (err) => {
        if (err && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          socket.close();
          console.error('  ❌ UDP send failed:', err.message);
          resolve(false);
        }
      });
    } catch (e) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        socket.close();
        console.error('  ❌ UDP test error:', e.message);
        resolve(false);
      }
    }
  });
}

module.exports = { checkEncryption, testUDP };
