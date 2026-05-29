# ═══════════════════════════════════════════
# Abigail Bot — v2.1.0 Production Docker
# Robust voice dependency handling
# ═══════════════════════════════════════════
FROM node:20-bookworm

# Install ALL system dependencies for native voice modules:
# - ffmpeg: audio stream processing
# - build-essential + python3 + make + g++: native addon compilation (@discordjs/opus)
# - libopus-dev: Opus codec C library (for @discordjs/opus)
# - libsodium-dev: NaCl C library (for sodium-native, optional but preferred)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    python3 \
    make \
    g++ \
    libopus-dev \
    libsodium-dev \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package*.json ./

# ═══ Install dependencies with robust error handling ═══
# Step 1: Install all regular dependencies (pure JS + WASM — always works)
RUN npm install --omit=optional --loglevel verbose 2>&1 | tail -20

# Step 2: Try installing optional native dependencies (@discordjs/opus)
# If it fails, opusscript (pure JS) will be used as fallback
RUN npm install --loglevel verbose 2>&1 | tail -20 || echo "⚠️ Some optional deps failed — JS fallbacks active"

# Step 3: Verify CRITICAL dependencies are loadable
# These are pure JS/WASM and MUST work — build fails if they don't
RUN echo "══════════════════════════════════════" && \
    echo "🔧 Critical Dependency Verification (v2.1.0):" && \
    echo "" && \
    echo "--- Pure JS / WASM (MUST work) ---" && \
    node -e "try { const m = require('@discordjs/voice'); console.log('  ✅ @discordjs/voice'); } catch(e) { console.log('  ❌ @discordjs/voice — FATAL:', e.message); process.exit(1); }" && \
    node -e "try { const m = require('opusscript'); console.log('  ✅ opusscript (JS Opus)'); } catch(e) { console.log('  ❌ opusscript — FATAL:', e.message); process.exit(1); }" && \
    node -e "try { const m = require('tweetnacl'); console.log('  ✅ tweetnacl (JS encryption)'); } catch(e) { console.log('  ❌ tweetnacl — FATAL:', e.message); process.exit(1); }" && \
    node -e "try { const m = require('libsodium-wrappers'); console.log('  ✅ libsodium-wrappers (WASM)'); } catch(e) { console.log('  ⚠️ libsodium-wrappers not available:', e.message); }" && \
    echo "" && \
    echo "--- Native (optional, best performance) ---" && \
    node -e "try { const m = require('@discordjs/opus'); console.log('  ✅ @discordjs/opus (native Opus)'); } catch(e) { console.log('  ⚠️ @discordjs/opus not available — opusscript fallback active'); }" && \
    echo "" && \
    echo "--- Encryption Roundtrip Test ---" && \
    node -e " \
    (async () => { \
      try { \
        const sodium = require('libsodium-wrappers'); \
        await sodium.ready; \
        const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES); \
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES); \
        const msg = new Uint8Array([72,101,108,108,111]); \
        const enc = sodium.crypto_secretbox_easy(msg, nonce, key); \
        const dec = sodium.crypto_secretbox_open_easy(enc, nonce, key); \
        console.log('  ' + (dec ? '✅' : '❌') + ' libsodium-wrappers encrypt/decrypt roundtrip'); \
      } catch(e) { \
        console.log('  ⚠️ libsodium-wrappers test failed:', e.message); \
        try { \
          const nacl = require('tweetnacl'); \
          const k = nacl.randomBytes(32); const n = nacl.randomBytes(24); \
          const enc = nacl.secretbox(new Uint8Array([1,2,3]), n, k); \
          const dec = nacl.secretbox.open(enc, n, k); \
          console.log('  ' + (dec ? '✅' : '❌') + ' tweetnacl encrypt/decrypt roundtrip (fallback)'); \
        } catch(e2) { console.log('  ❌ tweetnacl test failed:', e2.message); process.exit(1); } \
      } \
    })();" && \
    echo "" && \
    echo "--- @discordjs/voice Dependency Report ---" && \
    node -e " \
    try { \
      const { generateDependencyReport } = require('@discordjs/voice'); \
      console.log(generateDependencyReport()); \
    } catch(e) { console.log('  ❌ Failed:', e.message); }" && \
    echo "" && \
    echo "--- UDP Socket Test ---" && \
    node -e " \
    const dgram = require('dgram'); \
    const s = dgram.createSocket('udp4'); \
    s.on('error', (e) => { console.log('  ❌ UDP socket error:', e.message); s.close(); process.exit(0); }); \
    s.bind(0, () => { console.log('  ✅ UDP socket can bind on port', s.address().port); s.close(); }); \
    setTimeout(() => process.exit(0), 2000);" && \
    echo "══════════════════════════════════════"

# Copy ALL application files
COPY . .

# Verify commands exist
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
