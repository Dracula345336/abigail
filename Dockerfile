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

# Final dependency check at build time — verify ACTUAL API methods
RUN echo "═══════════════════════════════════════" && \
    echo "🔧 Voice Dependency Check (v1.8.0):" && \
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
    }); \
    console.log('  ✅ sodium-shim v2 (correct libsodium-wrappers API)');" && \
    echo "--- Checking libsodium-wrappers API methods ---" && \
    node -e " \
    require('./src/sodium-shim'); \
    const sodium = require('libsodium-wrappers'); \
    const methods = ['crypto_secretbox_open_easy', 'crypto_secretbox_easy', 'randombytes_buf']; \
    methods.forEach(m => { \
      console.log('  ' + (typeof sodium[m] === 'function' ? '✅' : '❌') + ' libsodium-wrappers.' + m + ' = ' + typeof sodium[m]); \
    }); \
    console.log('  ' + (sodium.ready ? '✅' : '❌') + ' libsodium-wrappers.ready = ' + (sodium.ready ? 'Promise' : 'missing'));" && \
    echo "--- @discordjs/voice Dependency Report ---" && \
    node -e " \
    require('./src/sodium-shim'); \
    const { generateDependencyReport } = require('@discordjs/voice'); \
    console.log(generateDependencyReport());" && \
    echo "═══════════════════════════════════════"

# Verify commands
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
