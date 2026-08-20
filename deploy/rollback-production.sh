#!/usr/bin/env bash
# Put production back on a known-good commit.
#
#   bash deploy/rollback-production.sh <sha>
#   bash deploy/rollback-production.sh --list
#
# Rolling back was previously an improvised `git checkout` plus a re-run of
# push-to-production.sh, worked out under whatever pressure had made a
# rollback necessary. This is the same operation written down, with the two
# checks that improvisation skips.
#
# READ THIS BEFORE ROLLING BACK ACROSS A MIGRATION.
#
# This reverts CODE ONLY. It never touches the database, deliberately: an
# automatic down-migration under pressure is how a bad deploy becomes a lost
# day of orders. If the commit you are leaving added a migration, the schema
# stays migrated and the older code has to tolerate it — usually fine for an
# added column, not fine for a renamed or dropped one.
#
# Five migrations have no down script at all:
#   add_full_schema.sql, init_spatial.sql   (baseline — never reversible)
#   consolidate_roles.sql                   (data migration)
#   fix_refresh_tokens_schema.sql
#   fix_refresh_tokens_drop_user_id.sql     (drops a column — data is gone)
#
# Crossing one of those backwards is a restore-from-backup job, not a
# rollback. Last night's dump is in /var/backups/kigali-freight and every
# one is verified by a real restore, so that path works — but it costs
# whatever has happened since.
set -euo pipefail

HOST="api.inzira.systems"
USER="freightadmin"
KEY="$HOME/.ssh/kigali_freight_azure"

cd "$(dirname "$0")/.."

LIVE="$(curl -fsS "https://$HOST/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"

if [ "${1:-}" = "--list" ] || [ $# -eq 0 ]; then
    echo "Currently live: ${LIVE:-<unreachable>}"
    echo
    echo "Recent commits (newest first):"
    git log --oneline -15 | cat
    echo
    echo "Usage: bash deploy/rollback-production.sh <sha>"
    exit 0
fi

TARGET="$(git rev-parse "$1")"

# A rollback to something that was never deployed is not a rollback, it is a
# deploy of untested code wearing a rollback's clothes.
if ! git merge-base --is-ancestor "$TARGET" HEAD; then
    echo "❌ $1 is not an ancestor of HEAD — that is a deploy, not a rollback."
    echo "   Use push-to-production.sh if you really mean to ship it."
    exit 1
fi

echo "Rolling back:"
echo "   from ${LIVE:0:7} $(git log -1 --format=%s "$LIVE" 2>/dev/null || echo '(unknown commit)')"
echo "   to   ${TARGET:0:7} $(git log -1 --format=%s "$TARGET")"
echo
if [ -n "$LIVE" ] && ! git merge-base --is-ancestor "$LIVE" "$TARGET"; then
    CROSSED="$(git diff --name-only "$TARGET" "$LIVE" -- kigali-freight-router/migrations/ | grep -v '/down/' || true)"
    if [ -n "$CROSSED" ]; then
        echo "⚠️  This crosses migrations:"
        echo "$CROSSED" | sed 's/^/      /'
        echo "   The schema will stay migrated. Read the header of this script."
        echo
    fi
fi

read -r -p "Type the short sha (${TARGET:0:7}) to confirm: " CONFIRM
[ "$CONFIRM" = "${TARGET:0:7}" ] || { echo "Aborted."; exit 1; }

WORKTREE="$(mktemp -d)"
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true' EXIT
# A detached worktree rather than checking out in place: a rollback should
# not leave the operator's working copy on an old commit, which is its own
# way to lose an afternoon.
git worktree add --detach "$WORKTREE" "$TARGET" >/dev/null

rsync -az --delete \
    --exclude='.git' --exclude='node_modules' --exclude='**/node_modules' \
    --exclude='kigali-freight-driver' --exclude='.env' --exclude='.env.production' \
    --exclude='.env.local' --exclude='secrets/' --exclude='.turbo' --exclude='**/.turbo' \
    --exclude='.claude' \
    -e "ssh -i $KEY" "$WORKTREE/" "$USER@$HOST:freight-system/"

ssh -i "$KEY" "$USER@$HOST" \
    "cd freight-system && GIT_COMMIT=$TARGET GIT_BRANCH=rollback docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml build router ui && docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.prod.yml up -d router ui"

echo
echo "⏳ Verifying..."
for _ in $(seq 1 30); do
    REPORTED="$(curl -fsS "https://$HOST/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)"
    [ "$REPORTED" = "$TARGET" ] && break
    sleep 2
done

if [ "$REPORTED" = "$TARGET" ]; then
    echo "✅ Rolled back: $HOST is running ${TARGET:0:7}"
    echo "   Your working copy is untouched and still on $(git rev-parse --abbrev-ref HEAD)."
else
    echo "❌ ROLLBACK DID NOT LAND. expected $TARGET, got ${REPORTED:-<no response>}"
    exit 1
fi
