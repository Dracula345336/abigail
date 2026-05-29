# Node.js 20 — no native modules needed! (opusscript + tweetnacl = pure JS)
FROM node:20-slim

# Install ffmpeg only (for audio stream processing)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install dependencies (no native compilation needed!)
RUN npm install --production

# Copy ALL application files
COPY . .

# Verify voice dependencies at build time
RUN echo "═══════════════════════════════════════" && \
    echo "🔧 Voice Dependency Check (v1.9.0):" && \
    node -e " \
    const mods = { \
      '@discordjs/voice': 'Voice engine', \
      'opusscript': 'Opus audio encoder', \
      'tweetnacl': 'NaCl encryption', \
      'play-dl': 'YouTube/Spotify source', \
    }; \
    Object.entries(mods).forEach(([m, label]) => { \
      try { require(m); console.log('  ✅ ' + m + ' (' + label + ')'); } \
      catch(e) { console.log('  ❌ ' + m + ' — ' + e.message); } \
    });" && \
    echo "--- @discordjs/voice Dependency Report ---" && \
    node -e " \
    const { generateDependencyReport } = require('@discordjs/voice'); \
    console.log(generateDependencyReport());" && \
    echo "--- tweetnacl Encryption Test ---" && \
    node -e " \
    const nacl = require('tweetnacl'); \
    const k = nacl.randomBytes(32); const n = nacl.randomBytes(24); \
    const enc = nacl.secretbox(new Uint8Array([1,2,3]), n, k); \
    const dec = nacl.secretbox.open(enc, n, k); \
    console.log('  ' + (dec ? '✅' : '❌') + ' tweetnacl encrypt/decrypt roundtrip');" && \
    echo "--- UDP Socket Test ---" && \
    node -e " \
    const dgram = require('dgram'); \
    const s = dgram.createSocket('udp4'); \
    s.on('error', (e) => { console.log('  ❌ UDP socket error:', e.message); s.close(); process.exit(0); }); \
    s.bind(0, () => { console.log('  ✅ UDP socket can bind on port', s.address().port); s.close(); }); \
    setTimeout(() => process.exit(0), 2000);" && \
    echo "═══════════════════════════════════════"

# Verify commands exist
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
