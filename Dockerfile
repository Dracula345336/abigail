# Full Node.js 20 image — best compatibility for native voice modules
FROM node:20

# Install ffmpeg (required for music stream processing)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy ALL application files
COPY . .

# Diagnose voice dependencies at build time
RUN echo "═══════════════════════════════════════" && \
    echo "🔧 Voice Dependency Check:" && \
    node -e " \
    const mods = ['@discordjs/voice', 'opusscript', 'libsodium-wrappers', 'tweetnacl', 'play-dl']; \
    mods.forEach(m => { \
      try { require(m); console.log('  ✅ ' + m); } \
      catch(e) { console.log('  ❌ ' + m + ' — ' + e.message); } \
    });" && \
    echo "═══════════════════════════════════════"

# Verify command files
RUN echo "=== Checking command files ===" && ls -la src/commands/ || echo "No commands dir!"

# Start bot
CMD ["npm", "start"]
