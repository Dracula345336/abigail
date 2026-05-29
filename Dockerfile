# ═══════════════════════════════════════════
# Abigail Bot — v2.0.0 Production Docker
# Full Debian + native voice dependencies
# ═══════════════════════════════════════════
FROM node:20-bookworm

# Install ALL system dependencies for native voice modules:
# - ffmpeg: audio stream processing
# - build-essential + python3: native addon compilation (@discordjs/opus)
# - libopus-dev: Opus codec C library (for @discordjs/opus)
# - libsodium-dev: NaCl C library (for sodium-native, optional but preferred)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3 \
    libopus-dev \
    libsodium-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package*.json ./

# Install ALL dependencies including native modules
# libsodium-wrappers (WASM) + @discordjs/opus (native) + tweetnacl/opusscript as fallbacks
RUN npm install --omit=dev

# If @discordjs/opus failed to build, rebuild it explicitly
RUN npm rebuild @discordjs/opus 2>/dev/null || echo "⚠️ @discordjs/opus rebuild skipped (opusscript fallback active)"

# Copy ALL application files
COPY . .

# ═══ Verify voice dependencies at build time ═══
RUN echo "══════════════════════════════════════" && \
    echo "🔧 Voice Dependency Check (v2.0.0):" && \
    echo "--- Core Modules ---" && \
    node -e " \
    const mods = { \
      '@discordjs/voice': 'Voice engine', \
      '@discordjs/opus': 'Native Opus encoder', \
      'opusscript': 'JS Opus fallback', \
      'libsodium-wrappers': 'NaCl encryption (WASM)', \
      'tweetnacl': 'NaCl encryption (JS fallback)', \
      'play-dl': 'YouTube/Spotify source', \
    }; \
    Object.entries(mods).forEach(([m, label]) => { \
      try { require(m); console.log('  ✅ ' + m + ' (' + label + ')'); } \
      catch(e) { console.log('  ❌ ' + m + ' — NOT FOUND (' + label + ')'); } \
    });" && \
    echo "--- @discordjs/voice Dependency Report ---" && \
    node -e " \
    try { \
      const { generateDependencyReport } = require('@discordjs/voice'); \
      console.log(generateDependencyReport()); \
    } catch(e) { console.log('  ❌ Failed:', e.message); }" && \
    echo "--- Encryption Roundtrip Test ---" && \
    node -e " \
    try { \
      const sodium = require('libsodium-wrappers'); \
      sodium.ready.then(() => { \
        const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES); \
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES); \
        const msg = new Uint8Array([72,101,108,108,111]); \
        const enc = sodium.crypto_secretbox_easy(msg, nonce, key); \
        const dec = sodium.crypto_secretbox_open_easy(enc, nonce, key); \
        console.log('  ' + (dec ? '✅' : '❌') + ' libsodium-wrappers encrypt/decrypt roundtrip'); \
      }); \
    } catch(e) { \
      console.log('  ❌ libsodium-wrappers test failed:', e.message); \
      try { \
        const nacl = require('tweetnacl'); \
        const k = nacl.randomBytes(32); const n = nacl.randomBytes(24); \
        const enc = nacl.secretbox(new Uint8Array([1,2,3]), n, k); \
        const dec = nacl.secretbox.open(enc, n, k); \
        console.log('  ' + (dec ? '✅' : '❌') + ' tweetnacl encrypt/decrypt roundtrip (fallback)'); \
      } catch(e2) { console.log('  ❌ tweetnacl test failed:', e2.message); } \
    }" && \
    echo "--- UDP Socket Test ---" && \
    node -e " \
    const dgram = require('dgram'); \
    const s = dgram.createSocket('udp4'); \
    s.on('error', (e) => { console.log('  ❌ UDP socket error:', e.message); s.close(); process.exit(0); }); \
    s.bind(0, () => { console.log('  ✅ UDP socket can bind on port', s.address().port); s.close(); }); \
    setTimeout(() => process.exit(0), 2000);" && \
    echo "══════════════════════════════════════"

# Verify commands exist
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
