# Deploying to a real environment

This is real, tested scaffolding — not a plan. Every piece here has been
verified to actually work (the Compose merge, the systemd unit syntax, the
backup/restore/verify round-trip) against this exact codebase. What it
deliberately does **not** do is invent a server or a cloud account on your
behalf — those are real decisions only you can make. This doc tells you
exactly what to decide and what to run once you have.

Until you do this, the system runs on one developer's machine via
`docker-compose.yml` alone — that's the honest current state, and it's
fine for local dev. This is what changes it.

## 1. Get a host and point DNS at it

Pick anything that can run Docker and has a public IP — a small VPS
(Hetzner, DigitalOcean, Linode, etc.) is enough for this system's current
scale. You need two DNS records pointing at that IP:

```
api.yourcompany.com       A    <host IP>
dispatch.yourcompany.com  A    <host IP>
```

## 2. Real secrets — pick a secrets manager, don't invent one

Nothing in this repo hardcodes a secrets-manager choice, on purpose — that
should be a deliberate decision (AWS Secrets Manager, GCP Secret Manager,
HashiCorp Vault, Doppler, or even just your CI platform's own encrypted
secrets store all work). What every option has in common, and what this
repo is built to consume regardless of which you pick:

- All of this system's secrets are plain environment variables
  (`config/appConfig.js` reads them directly; there's no
  secrets-manager-specific SDK call anywhere in the app). Whatever you
  choose, its job is just to get real values into the environment of the
  host running `docker compose` — via a deploy script that fetches them
  and writes a `.env.production` file (gitignored, never committed) right
  before `docker compose up`, or via your CI/CD platform injecting them
  directly as job environment variables.
- Generate a real `JWT_SECRET`: `openssl rand -base64 48`
- Generate a real `ADMIN_PASSWORD` for the bootstrap admin account, and
  rotate it after first login.
- Point `R2_ACCOUNT_ID`/`R2_ENDPOINT`/`R2_ACCESS_KEY_ID`/
  `R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME` at **real Cloudflare R2**, not
  the local MinIO container — MinIO exists specifically so local dev
  doesn't need a real cloud account; production should use the real
  thing. Don't start the `minio`/`minio-init` services in production at
  all (`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis router ui caddy`,
  omitting `minio`/`minio-init` from the service list).
- Set `R2_PUBLIC_URL_BASE` to real R2's own endpoint — unlike the local-
  MinIO case, there's no internal-vs-external-hostname split to work
  around for real R2 (see the comment in `config/r2Client.js`).
- Set `API_BASE_URL`, `API_DOMAIN`, `APP_DOMAIN` to your real domains from
  step 1.
- Optional: `ANTHROPIC_API_KEY` enables AI-assisted features (document
  review triage first — see `services/documentAnalysisService.js`). Get
  one at console.anthropic.com under Settings → API Keys; that's a
  separate, pay-as-you-go product from a Claude.ai/Claude Code
  subscription, not included in it. Leave unset to run without any AI
  features — every feature that reads this key is written to no-op
  cleanly (no annotation shown, nothing blocked) rather than fail.

## 3. Deploy

```bash
# Stamps the running commit onto /health so you can tell from outside the
# box which code is actually live. Without these two exports the build
# args are empty and /health reports "unknown" — it still deploys fine,
# you just lose the drift check. Never hardcode a SHA here.
export GIT_COMMIT="$(git rev-parse HEAD)$([ -n "$(git status --porcelain)" ] && echo -dirty)"
export GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d --build postgres redis router ui caddy
```

Confirm the deploy actually landed before walking away — this is the
whole point of the stamp, and the failure it catches (code committed but
not running) is silent otherwise:

```bash
curl -s https://<your-api-domain>/health
# "version" must equal the SHA you just deployed, not an older one
```

`docker-compose.prod.yml` (repo root):
- Adds Caddy in front of the router and dashboard, which requests and
  renews real Let's Encrypt certificates on its own — the only manual
  step is DNS (step 1) and the two domain env vars (step 2). See
  `deploy/Caddyfile`.
- Stops publishing postgres/redis/router/ui ports directly to the host —
  only Caddy's 80/443 should be reachable from the internet on a real
  production machine.
- Sets `NODE_ENV=production` on the router, which activates the safe-
  error-message behavior in `utils/httpResponse.js` — internal error
  detail (DB constraint names, stack traces) is only ever included in
  non-production responses; production always gets a generic message
  plus a `requestId` to correlate with server-side logs.

## 4. Automate backups

`kigali-freight-router/ops/backup-db.js` / `verify-backup.js` /
`prune-backups.js` already exist and work — they just weren't scheduled
anywhere before. Install the provided systemd units on the host running
Postgres:

```bash
sudo cp kigali-freight-router/ops/systemd/kigali-backup.* /etc/systemd/system/
# Edit kigali-backup.service first: fix WorkingDirectory and
# EnvironmentFile to match where you actually deployed the router, and
# confirm the real path to `npm` on this host (`which npm`).
sudo systemctl daemon-reload
sudo systemctl enable --now kigali-backup.timer
sudo systemctl list-timers kigali-backup.timer   # confirm it's scheduled
```

This runs daily: a real `pg_dump`, a **real restore into a scratch
database with a row-count sanity check** (not just "is the archive file
listable" — see the comment at the top of `verify-backup.js` for why that
distinction matters), then prunes anything older than 14 days.

## 5. Automate expired-code cleanup

`otp_codes` and `driver_invites` otherwise grow forever — every driver
login attempt writes a row that's only ever read once. Same pattern as
backups, installed the same way:

```bash
sudo cp kigali-freight-router/ops/systemd/kigali-purge-auth-codes.* /etc/systemd/system/
# Edit kigali-purge-auth-codes.service first: fix WorkingDirectory and
# EnvironmentFile the same way you did for kigali-backup.service.
sudo systemctl daemon-reload
sudo systemctl enable --now kigali-purge-auth-codes.timer
sudo systemctl list-timers kigali-purge-auth-codes.timer   # confirm it's scheduled
```

## 6. Continuous deployment (optional)

`.github/workflows/ci.yml`'s `deploy-production` job automates exactly the
manual `rsync` + `docker compose build && up -d` cycle described in step 3
above — it runs on every push to `main`, only after every lint/typecheck/
test/security-audit job in the same workflow has passed. To turn it on:

1. Generate a dedicated deploy key (don't reuse a personal one):
   `ssh-keygen -t ed25519 -f deploy_key -N ""`.
2. Append `deploy_key.pub`'s contents to the production host's
   `~/.ssh/authorized_keys` for the deploy user.
3. In the GitHub repo: Settings → Secrets and variables → Actions → New
   repository secret, named `PRODUCTION_SSH_KEY`, value = the full
   contents of the private `deploy_key` file. Delete your local copy of
   `deploy_key` once it's saved there.
4. Push to `main` — the workflow's `deploy-production` job picks it up
   automatically from then on. Its host/user/path are plain values in the
   workflow file itself (not secrets — they're not exploitable without the
   key), so update those directly if either ever changes.

Until that secret exists, the job runs and fails loudly the moment the
sync step tries to actually use the empty/invalid key, rather than
silently doing nothing — a missing secret is a visible red X on the
workflow run, not a deploy that quietly never happened.

## 7. Driver app releases (optional)

`.github/workflows/driver-eas.yml` automates the same `eas update`/
`eas build` commands run by hand from a local machine all session: any
push to `main` touching `kigali-freight-driver/` or `packages/` runs a
typecheck/lint/test pass, then — only if that passes — publishes an OTA
update to the `preview` branch/environment. A full native build (a new
installable APK/IPA) is never automatic; trigger one manually from the
GitHub repo's Actions tab → "Driver App - EAS" → Run workflow, choosing
platform and build profile.

To turn it on: generate a token at
[expo.dev](https://expo.dev)/accounts/`<your account>`/settings/access-tokens,
then add it as a repository secret named `EXPO_TOKEN` (same Settings →
Secrets and variables → Actions page as above). Same fail-loudly behavior
as the production deploy above if it's missing.

## 8. Confirm it's actually working

- `curl https://api.yourcompany.com/health` → `{"success":true,"data":{"status":"ok",...}}`
- Open `https://dispatch.yourcompany.com` → the dispatcher login screen,
  served over real HTTPS with a browser-trusted certificate.
- `sudo systemctl status kigali-backup.timer` → shows the next scheduled run.
- Manually trigger one backup cycle once to see it succeed end to end:
  `sudo systemctl start kigali-backup.service && journalctl -u kigali-backup.service -f`

## What's still a manual/deliberate decision, on purpose

- **Which secrets manager** — see step 2. This repo is built to be
  agnostic to that choice; picking one is a real decision, not something
  to default silently.
- **Which host/cloud provider** — same reasoning.
- **Scaling beyond one host** — the router already supports horizontal
  scaling (`REDIS_URL` enables the Socket.IO Redis adapter and shared
  rate-limit/live-fleet state — see `config/appConfig.js`), but load-
  balancing multiple router instances, and where Postgres itself would
  need to live at real scale, is out of scope for this doc.
