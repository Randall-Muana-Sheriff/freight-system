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
#
# WHAT IT REFUSES TO SHIP, and why each check exists separately:
#   - a dirty tree        — the code would match no commit at all
#   - a non-main branch   — nothing has reviewed it (DEPLOY_ALLOW_BRANCH=1)
#   - a HEAD that differs — a clean tree on a stale or unpushed main is
#     from origin/<branch>  still clean, and that is how the wrong commit
#                           shipped once already
# and it prints what is live, what is about to replace it, and any
# migrations in between before asking for the short sha out loud.
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

# A CLEAN TREE IS NOT THE SAME AS THE RIGHT COMMIT.
#
# The dirty-tree check above was the only guard, and it answers a different
# question than the one that matters: it proves what ships corresponds to
# *some* commit, not that it corresponds to the one that was reviewed and
# went green. A checkout sitting on a feature branch, or on a main that is
# five commits behind origin, is perfectly clean — which is how the wrong
# commit shipped, with the clean tree read as an all-clear.
#
# Three separate things are checked, because they fail separately:
#   1. HEAD is on main            — a feature branch has not been reviewed.
#   2. main matches origin/main   — a stale or unpushed local main ships
#                                   code CI has never seen.
#   3. The operator confirms      — everything above can be legitimately
#      the SHA out loud             overridden; none of it should be
#                                   overridden by accident.
#
# DEPLOY_ALLOW_BRANCH=1 skips (1) for the genuine hotfix-from-a-branch case.
# There is deliberately no override for (2): shipping a commit that does not
# exist on the remote means nobody else can check out what is running, and
# rollback-production.sh's ancestor arithmetic has nothing to anchor to.
if [ "$BRANCH" != "main" ] && [ "${DEPLOY_ALLOW_BRANCH:-}" != "1" ]; then
    echo "❌ HEAD is on '$BRANCH', not main."
    echo "   Production ships main. If this is a deliberate hotfix from a"
    echo "   branch, re-run with DEPLOY_ALLOW_BRANCH=1."
    exit 1
fi

echo "🔍 Fetching origin to check this commit is the one that was pushed..."
git fetch --quiet origin "$BRANCH" 2>/dev/null || git fetch --quiet origin || true
REMOTE_SHA="$(git rev-parse --verify --quiet "origin/$BRANCH" || true)"

if [ -z "$REMOTE_SHA" ]; then
    echo "❌ No origin/$BRANCH to compare against — cannot tell whether this"
    echo "   commit was ever pushed, reviewed, or built by CI."
    exit 1
fi
if [ "$SHA" != "$REMOTE_SHA" ]; then
    echo "❌ HEAD does not match origin/$BRANCH."
    echo "   local:  ${SHA:0:7} $(git log -1 --format=%s "$SHA")"
    echo "   remote: ${REMOTE_SHA:0:7} $(git log -1 --format=%s "$REMOTE_SHA" 2>/dev/null || echo '(not fetched)')"
    echo
    if git merge-base --is-ancestor "$SHA" "$REMOTE_SHA" 2>/dev/null; then
        echo "   Your checkout is BEHIND the remote — pull first, or you will"
        echo "   ship an older commit over a newer one."
    else
        echo "   Your checkout has commits the remote does not — push them"
        echo "   first, so what runs in production is something someone else"
        echo "   can check out and CI has actually seen."
    fi
    exit 1
fi

# What is live right now, so the operator confirms a transition rather than
# a destination. Best-effort: a router that is already down should not stop
# the deploy that fixes it.
LIVE="$(curl -fsS "https://$HOST/health" 2>/dev/null \
    | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"

if [ -n "$LIVE" ]; then
    LIVE_LABEL="${LIVE:0:7} $(git log -1 --format=%s "$LIVE" 2>/dev/null || echo '(commit not in this checkout)')"
else
    LIVE_LABEL="unknown (/health is unstamped or unreachable)"
fi

echo
echo "📦 Deploying to $USER@$HOST:$REMOTE_PATH"
echo "   from $LIVE_LABEL"
echo "   to   ${SHA:0:7} $(git log -1 --format=%s "$SHA")"
if [ -n "$LIVE" ] && git rev-parse --verify --quiet "$LIVE" >/dev/null 2>&1; then
    AHEAD="$(git rev-list --count "$LIVE..$SHA" 2>/dev/null || echo '?')"
    echo "   ($AHEAD commit(s) ahead of what is live)"
    # Same warning rollback-production.sh gives in the other direction. A
    # migration is the part of a deploy that a rollback cannot undo, so it
    # is worth seeing before it runs, not after.
    CROSSED="$(git diff --name-only "$LIVE" "$SHA" -- kigali-freight-router/migrations/ | grep -v '/down/' || true)"
    if [ -n "$CROSSED" ]; then
        echo
        echo "⚠️  This deploy runs migrations:"
        echo "$CROSSED" | sed 's/^/      /'
        echo "   They run on container boot. A failure leaves the router"
        echo "   crash-looping and the site down until a human intervenes,"
        echo "   and rolling back afterwards does NOT unmigrate the schema."
    fi
fi
echo
read -r -p "Type the short sha (${SHA:0:7}) to confirm: " CONFIRM
[ "$CONFIRM" = "${SHA:0:7}" ] || { echo "Aborted."; exit 1; }
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

# Caddy's config is bind-mounted as a single FILE, and rsync replaces files
# by writing a temporary and renaming it — which allocates a new inode. A
# file bind-mount follows the inode, not the path, so the running container
# goes on reading the version it started with. Every Caddyfile change
# deployed this way was invisible, and `caddy reload` cheerfully reported
# "config is unchanged" and "load complete" while serving the old config —
# which is how HSTS appeared to deploy three times without ever arriving.
#
# Recreating the container is what re-resolves the path. Only done when the
# file actually changed, since it briefly drops the edge that fronts every
# host, and validated first: an invalid Caddyfile here takes the whole site
# down rather than one service.
CADDY_LOCAL_SUM="$(sha256sum deploy/Caddyfile | cut -d' ' -f1)"
CADDY_REMOTE_SUM="$(ssh -i "$KEY" "$USER@$HOST" \
    "docker exec inzira-caddy sha256sum /etc/caddy/Caddyfile 2>/dev/null | cut -d' ' -f1" || true)"

if [ "$CADDY_LOCAL_SUM" != "$CADDY_REMOTE_SUM" ]; then
    echo "🔁 Caddyfile changed — validating before recreating the edge..."
    ssh -i "$KEY" "$USER@$HOST" \
        "cd $REMOTE_PATH && set -a && . ./.env.production && set +a && \
         docker run --rm -v \$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro \
           -e API_DOMAIN -e APP_DOMAIN -e SITE_DOMAIN \
           caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile" \
      >/dev/null 2>&1 || { echo "❌ New Caddyfile is invalid — refusing to recreate the edge."; exit 1; }
    ssh -i "$KEY" "$USER@$HOST" \
        "cd $REMOTE_PATH && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate caddy" \
      >/dev/null
    echo "✅ Edge recreated with the new config."
    echo
fi

# GIT_COMMIT is passed rather than derived because there is no git on the
# far side to derive it from. This is the one case where carrying the SHA
# across is correct instead of hardcoding it — it still comes from
# `git rev-parse`, just on this side of the connection.
#
# `export`, not a `VAR=x cmd` prefix. A prefix applies to exactly the one
# command it precedes, so with `VAR=x build && up` the variable reached the
# build and not the `up` — which is invisible for anything baked in at build
# time, and silently empty for anything read from the runtime environment.
# The dashboard shipped with GIT_COMMIT="" in its /config.js that way, and
# every browser error it reported carried no release.
ssh -i "$KEY" "$USER@$HOST" \
    "cd $REMOTE_PATH && export GIT_COMMIT=$SHA GIT_BRANCH=$BRANCH && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml build router ui && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d router ui"

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
