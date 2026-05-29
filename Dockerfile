# Use Node.js 20 image
FROM node:20-alpine

# Install ffmpeg + build tools + opus dependencies (required for music playback + native modules)
RUN apk add --no-cache ffmpeg python3 make g++ libffi-dev libsodium-dev opus-dev

# Create app directory
WORKDIR /app

# Copy package files first (for better Docker caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy ALL application files
COPY . .

# Verify commands exist (debugging)
RUN echo "=== Checking command files ===" && ls -la src/commands/ || echo "No commands dir!"
RUN echo "=== Checking opus ===" && node -e "try { require('@discordjs/opus'); console.log('✅ opus loaded'); } catch(e) { console.log('⚠️ opus not available:', e.message); }"

# Start bot
CMD ["npm", "start"]
