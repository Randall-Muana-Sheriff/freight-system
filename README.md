# Inzira

A freight/logistics platform for Kigali: real-time fleet tracking, dispatch,
and delivery confirmation across three applications sharing one backend.

| App | What it is | Docs |
|---|---|---|
| `kigali-freight-router/` | Node/Express + PostgreSQL/PostGIS backend — auth, orders, fleet telemetry, geofencing, Socket.IO real-time updates | [README](kigali-freight-router/README.md) |
| `kigali-freight-ui/` | React dispatcher web dashboard — live fleet map, order dispatch, hub/geofence management | [README](kigali-freight-ui/README.md) |
| `kigali-freight-driver/` | Expo/React Native driver mobile app — phone/OTP/PIN auth, assignments, delivery confirmation, incident reporting | [README](kigali-freight-driver/README.md) |
| `packages/freight-types/` | Shared Zod schemas | — |
| `packages/freight-config/` | Shared lint/TS config | — |

## Quick start (local dev)

```bash
cp .env.example .env   # fill in JWT_SECRET at minimum — see comments inline
npm install
docker compose up -d   # postgres, redis, minio, router, dispatcher UI
```

Then, separately, run the driver app (`npm run start` inside
`kigali-freight-driver/`) — it's not containerized, since it needs Expo's
own dev tooling. See that app's own README for device/simulator setup.

Each subproject's README has the full picture: environment variables,
available scripts, testing, and troubleshooting. This file is the map, not
the manual.

## Deploying beyond your own machine

Local dev (above) is everything this system needs on one developer's
laptop. Deploying it somewhere real — a public domain, real TLS, scheduled
backups — is a distinct, larger step with its own guide:
[`docs/deployment/README.md`](docs/deployment/README.md).

## Repo layout notes

- This is an npm workspaces monorepo, orchestrated with
  [Turborepo](https://turborepo.com) (`turbo.json`, root `package.json`).
  Run `npm run <script>` from the repo root to run it across every
  workspace that defines it (e.g. `npm run test`, `npm run lint`), or
  `npm run <script> --workspace=kigali-freight-router` to scope it.
- CI lives in `.github/workflows/ci.yml` at the repo root — GitHub Actions
  only ever discovers workflows there, not inside a subproject's own
  `.github/` (there used to be two dead copies inside
  `kigali-freight-router/` and `kigali-freight-ui/` that GitHub never
  actually ran; they've been removed).
- `docs/v2/` is a **forward-looking planning corpus** (architecture,
  roadmap, coding standards for a proposed future iteration) — it
  describes where the team wants to go, not the current implementation.
  Don't treat it as documentation of what exists today; the per-app
  READMEs and this file are the source of truth for that.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
