# Use Node.js image
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# If supabase.js doesn't exist (it's gitignored), create it from the example
RUN if [ ! -f src/supabase.js ]; then \
      cp src/supabase.example.js src/supabase.js; \
    fi

# Start bot
CMD ["npm", "start"]
