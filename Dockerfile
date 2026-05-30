# ═══════════════════════════════════════════
# Abigail Bot — v2.2.0 Production Docker
# Music removed — AFK, Mimic, Hand Cricket, Werewolf
# ═══════════════════════════════════════════
FROM node:20-bookworm

# Create app directory
WORKDIR /app

# Copy package files first (for Docker layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy ALL application files
COPY . .

# Verify commands exist
RUN ls src/commands/

# Start bot
CMD ["npm", "start"]
