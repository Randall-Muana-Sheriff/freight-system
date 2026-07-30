# syntax=docker/dockerfile:1

# Builder stage - install all dependencies including dev for building
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files from monorepo
COPY package.json package-lock.json ./
COPY packages ./packages
COPY kigali-freight-router/package.json kigali-freight-router/
COPY kigali-freight-router/package-lock.json kigali-freight-router/

# Install all dependencies (including dev for building shared packages)
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

# Build shared packages (freight-config has no build script)
WORKDIR /app/packages/freight-types
RUN npm run build

# Build router
WORKDIR /app/kigali-freight-router
COPY kigali-freight-router ./

# npm workspaces hoist dependencies to the root node_modules (not this
# subdirectory's), so devDependencies must be pruned there too.
WORKDIR /app
RUN npm prune --omit=dev --ignore-scripts


# Runtime stage - minimal image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy hoisted production dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy built shared packages
COPY --from=builder /app/packages ./packages

# Copy router
COPY --from=builder /app/kigali-freight-router ./

# Run as non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]