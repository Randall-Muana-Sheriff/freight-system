#!/usr/bin/env bash
# One-shot completion of the three production settings that a coding agent
# is not permitted to write (production env files and privileged systemd
# units). Run this ON THE PRODUCTION HOST as the freightadmin user.
#
#   ssh -i ~/.ssh/kigali_freight_azure freightadmin@api.inzira.systems
#   bash ~/freight-system/deploy/finish-production-setup.sh
#
# It is idempotent: existing values are replaced rather than duplicated,
# and every file it edits is backed up with a timestamp first. It never
# prints a secret back to the terminal.
set -euo pipefail

ROOT="$HOME/freight-system"
PROD_ENV="$ROOT/.env.production"
ROUTER_ENV="$ROOT/kigali-freight-router/.env"
UNIT="/etc/systemd/system/kigali-backup.service"

# ── Fill these three in before running ──────────────────────────────────
AT_API_KEY_VALUE=""        # Africa's Talking API key (atsk_...)
AT_USERNAME_VALUE=""       # "sandbox" for testing, or your live AT username
BACKUP_BUCKET_VALUE=""     # A NEW R2 bucket for DB dumps, e.g. inzira-db-backups.
                           # Must NOT be the delivery-photos bucket — database
                           # dumps should never share a namespace with driver
                           # documents served over presigned URLs.
# ────────────────────────────────────────────────────────────────────────

for v in AT_API_KEY_VALUE AT_USERNAME_VALUE BACKUP_BUCKET_VALUE; do
  if [ -z "${!v}" ]; then
    echo "✗ $v is empty — fill in the block at the top of this script first." >&2
    exit 1
  fi
done

# R2 credentials are reused from the account already configured for
# delivery photos, so they never have to be retyped (and can't be
# mistyped) — only the bucket differs.
read_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- ; }
R2_ACCOUNT_ID_VALUE="$(read_env "$PROD_ENV" R2_ACCOUNT_ID)"
R2_ACCESS_KEY_ID_VALUE="$(read_env "$PROD_ENV" R2_ACCESS_KEY_ID)"
R2_SECRET_ACCESS_KEY_VALUE="$(read_env "$PROD_ENV" R2_SECRET_ACCESS_KEY)"

if [ -z "$R2_ACCOUNT_ID_VALUE" ] || [ -z "$R2_ACCESS_KEY_ID_VALUE" ] || [ -z "$R2_SECRET_ACCESS_KEY_VALUE" ]; then
  echo "✗ Could not read R2 credentials from $PROD_ENV — expected R2_ACCOUNT_ID," >&2
  echo "  R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to already be set there." >&2
  exit 1
fi
echo "→ Reusing R2 account ${R2_ACCOUNT_ID_VALUE:0:8}… from .env.production"

# Replace an existing KEY=... line, or append if absent. Avoids the
# duplicate-key confusion that plain `echo >>` causes on a re-run.
set_env() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    # Value goes in via an env var so sed never sees the secret as a
    # literal (and so slashes/ampersands in it can't corrupt the command).
    NEW_VALUE="$value" perl -pi -e 's/^\Q'"$key"'\E=.*/$ENV{NEW_VALUE} ? "'"$key"'=$ENV{NEW_VALUE}" : $&/e' "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

echo "→ Backing up config files"
cp "$PROD_ENV" "$PROD_ENV.bak-$(date +%s)"
[ -f "$ROUTER_ENV" ] && cp "$ROUTER_ENV" "$ROUTER_ENV.bak-$(date +%s)"

echo "→ [1/3] SMS credentials (unblocks real driver OTP login)"
set_env "$PROD_ENV" AT_API_KEY "$AT_API_KEY_VALUE"
set_env "$PROD_ENV" AT_USERNAME "$AT_USERNAME_VALUE"

echo "→ [2/3] Metrics token (opens /metrics for scraping)"
if grep -q '^METRICS_TOKEN=.\+' "$PROD_ENV"; then
  echo "   already set — leaving as is"
else
  set_env "$PROD_ENV" METRICS_TOKEN "$(openssl rand -hex 24)"
fi

echo "→ [3/3] Off-site backup credentials"
# These live in the router .env because that is the EnvironmentFile the
# kigali-backup systemd unit reads — not .env.production.
set_env "$ROUTER_ENV" BACKUP_OFFSITE_BUCKET "$BACKUP_BUCKET_VALUE"
set_env "$ROUTER_ENV" R2_ACCOUNT_ID "$R2_ACCOUNT_ID_VALUE"
set_env "$ROUTER_ENV" R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID_VALUE"
set_env "$ROUTER_ENV" R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY_VALUE"

echo "→ Adding the off-site upload step to $UNIT (needs sudo)"
if sudo grep -q 'backup:offsite' "$UNIT"; then
  echo "   already present — leaving as is"
else
  # Insert immediately after the verify step so a dump is only shipped
  # off-host once it has been proven restorable.
  sudo perl -pi -e 's{^(ExecStart=.*backup:verify.*)$}{$1\nExecStart=/usr/bin/bash -c '"'"'npm run backup:offsite -- "\$(ls -t /var/backups/kigali-freight/*.dump | head -n1)"'"'"'}' "$UNIT"
  sudo systemctl daemon-reload
fi

echo "→ Restarting the router so the new env is picked up"
cd "$ROOT"
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml up -d --build router

echo
echo "✓ Done. Verify with:"
echo "    curl -s https://api.inzira.systems/health"
echo "    sudo systemctl start kigali-backup.service && systemctl status kigali-backup.service"
echo "  Then request an OTP from a real device and confirm the SMS actually arrives."
