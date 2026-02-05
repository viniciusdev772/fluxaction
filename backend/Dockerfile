FROM node:20-alpine

# Install dependencies for health checks and native modules
RUN apk add --no-cache python3 make g++ wget

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Create data directory and set permissions
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 4000

CMD ["npm", "run", "start"]
