#!/usr/bin/env bash
# Ship the current checkout to production.
#
# Run this ON YOUR LAPTOP, from anywhere:
#
#   bash deploy/push-to-production.sh
#
# It exists because the production host is not a git checkout — the CI
# deploy rsyncs with --exclude='.git' on purpose — so `git pull` there can
# never work, and the commit stamp has to be carried over from here rather
# than derived on the far side. Typing that by hand across two machines is
# how a deploy silently ships nothing: an empty GIT_COMMIT stamps /health
# as "unknown", and an rsync that didn't land leaves every Docker COPY
# layer cached, so the build "succeeds" and serves the previous code.
#
# Mirrors .github/workflows/ci.yml's deploy-production job, with the same
# exclude list — .env/.env.production/secrets/ are both skipped AND
# protected from --delete, since they are server-only and never in git.
set -euo pipefail

HOST="api.inzira.systems"
USER="freightadmin"
REMOTE_PATH="freight-system"
KEY="$HOME/.ssh/kigali_freight_azure"

cd "$(dirname "$0")/.."

# A dirty tree means what ships matches no commit, and the stamp would say
# so with a -dirty suffix. Better to stop and let the operator decide than
# to deploy something unreproducible.
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working tree is dirty. Commit or stash first — otherwise the"
    echo "   deployed code corresponds to no commit anyone can check out."
    git status --short
    exit 1
fi

SHA="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "📦 Deploying $BRANCH @ ${SHA:0:7} to $USER@$HOST:$REMOTE_PATH"
echo

# --delete keeps the server from drifting, but never touches an --exclude'd
# path, so the server-only env files survive it.
rsync -az --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='**/node_modules' \
    --exclude='kigali-freight-driver' \
    --exclude='.env' \
    --exclude='.env.production' \
    --exclude='.env.local' \
    --exclude='secrets/' \
    --exclude='.turbo' \
    --exclude='**/.turbo' \
    --exclude='.claude' \
    -e "ssh -i $KEY" \
    ./ "$USER@$HOST:$REMOTE_PATH/"

echo "✅ Files synced. Building..."
echo

# GIT_COMMIT is passed rather than derived because there is no git on the
# far side to derive it from. This is the one case where carrying the SHA
# across is correct instead of hardcoding it — it still comes from
# `git rev-parse`, just on this side of the connection.
ssh -i "$KEY" "$USER@$HOST" \
    "cd $REMOTE_PATH && GIT_COMMIT=$SHA GIT_BRANCH=$BRANCH docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml build router ui && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d router ui"

echo
echo "⏳ Waiting for the router to come back..."
for _ in $(seq 1 30); do
    REPORTED="$(curl -fsS "https://$HOST/health" 2>/dev/null \
        | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"
    [ -n "$REPORTED" ] && break
    sleep 2
done

echo
if [ "$REPORTED" = "$SHA" ]; then
    echo "✅ Live and verified: $HOST is running $SHA"
else
    echo "❌ DEPLOY DID NOT LAND."
    echo "   expected: $SHA"
    echo "   reported: ${REPORTED:-<no response>}"
    echo
    echo "   'unknown'  -> the build args never reached the build."
    echo "   older SHA  -> the rsync did not land; Docker rebuilt cached layers."
    exit 1
fi
