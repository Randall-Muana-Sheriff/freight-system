# syntax=docker/dockerfile:1

# Build stage - install all dependencies including dev for building
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and full packages directory
COPY package.json package-lock.json ./
COPY packages ./packages
COPY kigali-freight-ui/package.json kigali-freight-ui/
COPY kigali-freight-ui/package-lock.json kigali-freight-ui/

# Install all dependencies (including dev for building)
RUN npm ci --workspaces --include-workspace-root --ignore-scripts

# Build shared packages (freight-config has no build script - just config files)
WORKDIR /app/packages/freight-types
RUN npm run build

# Build UI
WORKDIR /app/kigali-freight-ui
COPY kigali-freight-ui ./
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build


# Runtime stage - nginx
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/kigali-freight-ui/dist /usr/share/nginx/html
# A template, not the live config — docker-entrypoint.sh substitutes the
# real API origin into it (from the API_BASE_URL env var) at container
# start, since that's only known at deploy time, not at image-build time.
COPY kigali-freight-ui/nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY kigali-freight-ui/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/docker-entrypoint.sh"]