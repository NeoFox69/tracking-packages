# syntax=docker/dockerfile:1
FROM node:24-alpine

# Create app directory
WORKDIR /app

# Install app dependencies (only production deps)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy app source
COPY server.js db.js carriers.js tracker.js ./
COPY public/ ./public/
COPY .env.example ./

# Create data directory
RUN mkdir -p /data/tracking-packages

# Environment defaults
ENV NODE_ENV=production
ENV PORT=4200
ENV DATA_DIR=/data/tracking-packages

EXPOSE 4200

VOLUME ["/data/tracking-packages"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4200/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
