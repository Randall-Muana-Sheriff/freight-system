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
COPY kigali-freight-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]