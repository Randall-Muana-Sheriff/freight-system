#!/usr/bin/env bash
# Rebuild and restart the router with an accurate commit stamp on /health.
#
# Use this instead of a bare `docker compose up -d --build router`. Compose
# cannot shell out, so the GIT_COMMIT/GIT_BRANCH build args it passes have
# to come from the environment; this script is the thing that puts them
# there. A bare rebuild still works, it just reports "unknown".
#
# The point of the stamp is catching deploy drift — code committed but not
# actually running. It only earns that if it reflects the real build.
set -euo pipefail

cd "$(dirname "$0")/.."

GIT_COMMIT="$(git rev-parse HEAD)"
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# A dirty tree means the running code matches no commit at all. Surfacing
# that beats reporting a clean SHA that quietly isn't the whole truth —
# same convention bin/write-build-info.js already uses for file-sync
# deploys.
if [ -n "$(git status --porcelain)" ]; then
    GIT_COMMIT="${GIT_COMMIT}-dirty"
    echo "⚠️  Working tree is dirty — stamping ${GIT_COMMIT}"
fi

export GIT_COMMIT GIT_BRANCH
echo "🔨 Building router at ${GIT_COMMIT} (${GIT_BRANCH})"
docker compose up -d --build router

echo "⏳ Waiting for /health..."
for _ in $(seq 1 30); do
    if curl -sf http://localhost:5000/health >/dev/null 2>&1; then
        echo "✅ Router healthy, reporting:"
        curl -s http://localhost:5000/health
        echo
        exit 0
    fi
    sleep 2
done

echo "❌ Router did not become healthy in 60s — check: docker compose logs router"
exit 1
