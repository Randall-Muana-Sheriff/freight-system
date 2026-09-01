# Inzira — Freight Management and Tracking Platform

Inzira is an early-stage freight and logistics project for Kigali, started in July 2026. It brings dispatch, fleet tracking and delivery confirmation into a connected web, backend and mobile system.

[Project website](https://inzira.systems) · [Architecture decisions](docs/adr/README.md) · [Local setup](#quick-start-local-dev) · [Deployment guide](docs/deployment/README.md) · [Contributing](CONTRIBUTING.md)

## The problem

Coordinating a delivery involves more than creating an order: dispatchers need to assign a driver, understand vehicle location, follow delivery progress and respond to incidents. Inzira brings those workflows together so that the people coordinating and carrying out deliveries can work from shared operational information.

## Engineering highlights

- **Full-stack system:** a React/TypeScript dispatch dashboard, Node.js/Express REST API and Expo/React Native driver app.
- **Real-time communication:** Socket.IO updates connect fleet telemetry and operational state with the dispatch interface.
- **Relational and geospatial data:** PostgreSQL/PostGIS supports orders, fleet data, location queries and geofences.
- **Shared contracts:** Zod schemas in `packages/freight-types` sit alongside shared TypeScript and lint configuration.
- **Engineering workflow:** npm workspaces and Turborepo coordinate builds and checks; the repository includes automated tests, database migrations, Docker configuration and architecture decision records.

This is a project under active development, not a claim of commercial adoption or production readiness. The implemented system and forward-looking plans are documented separately below.

## Applications and shared packages

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

## Testing and quality checks

From the repository root, after installing dependencies:

```bash
npm run lint
npm run typecheck
npm run test
```

Router integration tests also need their database and service dependencies. Follow the [backend testing instructions](kigali-freight-router/README.md) before running:

```bash
npm run test:integration --workspace=kigali-freight-router
```

The [CI workflow](.github/workflows/ci.yml) defines the automated checks. See the [Actions history](https://github.com/Randall-Muana-Sheriff/freight-system/actions) for actual run results; having a workflow does not by itself mean the latest checks passed.

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
