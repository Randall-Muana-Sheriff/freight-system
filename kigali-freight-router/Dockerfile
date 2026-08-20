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

# Stamp the commit this image was built from, so /health can report it
# (see config/buildInfo.js). Passed in as build args rather than read from
# git: .git is excluded from the build context and this image has no git
# binary. When the args are absent the file is simply not written and
# /health honestly reports "unknown" — an unstamped build is far better
# than the confidently-wrong SHA a stale copied-in file produced.
# Written before USER app since /app is root-owned.
ARG GIT_COMMIT=""
ARG GIT_BRANCH=""
RUN if [ -n "$GIT_COMMIT" ]; then \
      printf '{\n  "commit": "%s",\n  "branch": "%s",\n  "builtAt": "%s"\n}\n' \
        "$GIT_COMMIT" "$GIT_BRANCH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > /app/build-info.json; \
    fi

# Run as non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# --import runs instrument.js before server.js loads, which is the only
# point at which Sentry can patch Express and pg — anything already
# imported when init() runs is never instrumented. It is a no-op without
# SENTRY_DSN, so this is safe in every environment.
#
# Note for anyone changing how this starts: the npm "start" script is NOT
# what runs here, and docker-compose.yml overrides this CMD again. All
# three have to agree or Sentry silently never initialises.
CMD ["node", "--import", "./instrument.js", "server.js"]