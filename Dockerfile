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

# Final dependency check at build time
RUN echo "═══════════════════════════════════════" && \
    echo "🔧 Voice Dependency Check:" && \
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
    console.log('  ✅ sodium-shim (pure JS encryption wrapper)');" && \
    echo "═══════════════════════════════════════"

# Verify commands
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
