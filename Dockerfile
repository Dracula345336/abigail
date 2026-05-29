# Use Node.js 20 DEBIAN image (better native module support than Alpine)
FROM node:20-slim

# Install ffmpeg + build tools + opus + sodium (required for music + voice)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    libopus-dev \
    libsodium-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy ALL application files
COPY . .

# Verify critical modules (debugging)
RUN echo "=== Checking command files ===" && ls -la src/commands/ || echo "No commands dir!"
RUN echo "=== Checking opus ===" && node -e "try { require('@discordjs/opus'); console.log('✅ opus loaded'); } catch(e) { console.log('⚠️ opus not available:', e.message); }"
RUN echo "=== Checking sodium ===" && node -e "try { require('libsodium-wrappers'); console.log('✅ sodium loaded'); } catch(e) { console.log('⚠️ sodium not available:', e.message); }"
RUN echo "=== Checking voice ===" && node -e "try { require('@discordjs/voice'); console.log('✅ voice loaded'); } catch(e) { console.log('⚠️ voice not available:', e.message); }"

# Start bot
CMD ["npm", "start"]
