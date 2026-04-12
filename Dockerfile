# Production Dockerfile for Zenon Network Indexer
# For local development, prefer running the indexer directly on your host
# machine against the dockerised Postgres/Redis (see README).

FROM node:20-alpine

WORKDIR /app

# Copy root and plugin package manifests before install so npm workspaces
# resolves every workspace's dependencies in a single `npm ci` pass.
COPY package*.json ./
COPY plugins ./plugins

# Install all dependencies (incl. dev). The build step compiles TypeScript for
# the root project and each plugin, and the seed/migrate scripts at startup
# rely on tsx/knex CLI from devDependencies.
RUN npm ci

# Copy application source and supporting data files
COPY src ./src
COPY tsconfig.json ./
COPY json ./json
COPY plugins.json ./

# Build TypeScript for root + every plugin (also syncs plugin migrations).
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs

# Start the indexer (overridden by docker-compose for the full-stack profile,
# which runs migrations + seeders first).
CMD ["node", "dist/index.js"]
