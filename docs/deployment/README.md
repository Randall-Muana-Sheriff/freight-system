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

## 3. Deploy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production \
  up -d postgres redis router ui caddy
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

## 5. Confirm it's actually working

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
