#!/usr/bin/env bash
# Run a READ-ONLY query against the production database.
#
#   bash deploy/prod-psql.sh "SELECT count(*) FROM orders;"
#   bash deploy/prod-psql.sh -f some/query.sql
#
# Why this exists: production is not reachable from a dev machine except
# through the bastion, and the useful checks -- did the migration land, what
# is actually in pricing_rates, is anyone holding cash -- all need the live
# database. Doing that by hand means typing an ssh line with the prod compose
# files in it, which is both easy to fat-finger into a write and correctly
# treated as a sensitive action by any permission layer worth having.
#
# This does NOT grant access. Anyone who can run it already holds the deploy
# key and could open a full psql session directly. What it does is make the
# safe thing the easy thing, and give a permission rule one narrow named
# command to allow instead of blanket ssh-to-the-live-host.
#
# Read-only is enforced in three layers, strongest first:
#
#   1. default_transaction_read_only=on for the whole session, via PGOPTIONS.
#      Postgres rejects the write itself. This survives a COMMIT in the
#      middle of the input, which the wrapper in layer 2 does not.
#   2. The statement is wrapped in BEGIN READ ONLY ... ROLLBACK.
#   3. A keyword guard that refuses obvious writes with a clear message
#      rather than a Postgres error forty lines down.
#
# Layer 1 is the real one. Layers 2 and 3 are there so a mistake fails
# immediately and legibly. None of this is a security boundary against
# someone who means it -- it is a guard against a tired operator, which is
# the actual failure mode.
set -euo pipefail

HOST="api.inzira.systems"
SSH_USER="freightadmin"
REMOTE_PATH="freight-system"
KEY="$HOME/.ssh/kigali_freight_azure"
CONTAINER="inzira-postgres"
DB="kigali_freight"
ENV_FILE=".env.production"

usage() {
    sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

[ $# -eq 0 ] && usage

if [ "${1:-}" = "-f" ]; then
    [ -f "${2:-}" ] || { echo "No such file: ${2:-<missing>}" >&2; exit 2; }
    SQL="$(cat "$2")"
else
    SQL="$1"
fi

[ -z "${SQL//[[:space:]]/}" ] && { echo "Empty query." >&2; exit 2; }

# Layer 3. Word-boundary matched so a column called "updated_at" or a table
# called "deliveries" does not trip it.
if printf '%s' "$SQL" | grep -qiE '(^|[^a-z_])(insert|update|delete|drop|truncate|alter|create|grant|revoke|vacuum|reindex|copy)([^a-z_]|$)'; then
    echo "That looks like a write. This wrapper is read-only on purpose." >&2
    echo "If you genuinely need to write to the live database, do it" >&2
    echo "deliberately and by hand -- not through a script named 'query'." >&2
    exit 3
fi

exec ssh -i "$KEY" -o ConnectTimeout=15 "$SSH_USER@$HOST" \
    "cd $REMOTE_PATH \
     && PGUSER=\$(grep -m1 '^POSTGRES_USER=' $ENV_FILE | cut -d= -f2-) \
     && docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -i $CONTAINER \
          psql -U \"\$PGUSER\" -d $DB -v ON_ERROR_STOP=1 <<'PRODSQL'
BEGIN READ ONLY;
$SQL
ROLLBACK;
PRODSQL"
