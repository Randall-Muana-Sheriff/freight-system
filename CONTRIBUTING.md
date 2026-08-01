# Contributing

## Before you start

Read the root [README.md](README.md) for the repo layout, then the README
of whichever app you're actually touching — each one documents its own
environment variables, scripts, and quirks in detail.

## Running checks locally

From the repo root (via Turborepo, runs across every workspace that
defines the script):

```bash
npm run lint
npm run typecheck
npm run test
```

Scoped to one workspace:

```bash
npm run test --workspace=kigali-freight-ui
npm run test:integration --workspace=kigali-freight-router   # needs postgres+redis running, see that app's README
```

All three apps have real test suites and CI enforces them — a PR that
doesn't pass `lint`/`typecheck`/`test` for the workspace it touches
shouldn't be merged. If you're adding a new endpoint, component, or
module with meaningful logic, add a test for it in the same PR; don't
defer it to "later."

## Conventions this codebase actually follows

These aren't aspirational — they're patterns already used consistently
across the three apps, worth matching rather than introducing a new style:

- **Comments explain *why*, not *what*.** Look at any existing file before
  adding a new one — the comment density and style (a short paragraph
  above a non-obvious decision, not a docstring on every function) is
  deliberate. Don't add comments that just restate the code.
- **Identity always comes from the verified session, never a
  client-supplied value.** Every driver-scoped endpoint derives the
  driver's identity from `req.user.username` (the JWT), never from a
  request body/param — see `orderController.js` or `fleetController.js`
  for the pattern. A new endpoint that trusts a client-supplied driver ID
  instead is a tenancy bug, not a style nitpick.
- **Parameterized SQL, always.** No template-literal interpolation into a
  `pool.query(...)` call, anywhere, ever — this has been true throughout
  the whole backend and should stay true.
- **`errorMessage(err, fallback)` (utils/httpResponse.js) is the only way
  a caught error's message should reach an API response.** Never
  interpolate `err.message` directly into a response — see the comment on
  that function for why, and don't reintroduce the leak it fixed.
- **New env vars need a default and a comment** in the relevant
  `.env.example`, explaining what happens when it's left unset (most
  optional integrations in this app degrade gracefully rather than
  crashing — SMS falls back to console logging, push notifications become
  a no-op, etc.). Match that pattern rather than making a new integration
  a hard requirement.
- **Don't add an abstraction for a single use case.** This codebase
  consistently prefers three similar inline blocks over a premature shared
  helper — only extract a shared function once a real second/third
  use actually exists.

## Database migrations

- Add new files to `kigali-freight-router/migrations/`, then append them
  to the `MIGRATIONS` array in `bin/migrate.js` — that array is the only
  thing that makes a migration actually run, in that exact order.
- Prefer `IF NOT EXISTS`/`IF EXISTS` guards so a migration is safe to
  re-run.
- Add a matching down-migration under `migrations/down/` when the change
  is safely reversible (a straightforward `ADD COLUMN`/`CREATE TABLE`).
  If it isn't (a data migration, a multi-step schema change with no clean
  inverse), don't fake one — add a note to `migrations/down/README.md`
  explaining why, matching the existing entries there.

## Commits and PRs

- Commit messages: explain *why*, matching this repo's existing log
  style — what problem the change solves, not just what files changed.
- Keep PRs scoped to one thing. A bug fix doesn't need an accompanying
  refactor of the surrounding code.
