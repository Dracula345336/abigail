# Use Node.js 20 image
FROM node:20-alpine

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

# Start bot
CMD ["npm", "start"]
