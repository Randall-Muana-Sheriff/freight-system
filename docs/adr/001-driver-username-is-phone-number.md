# 1. A driver's username is their phone number

## Context

Driver auth moved from username+password to phone+OTP+PIN (mobile app
only — dispatcher/admin username+password on the web dashboard was
untouched). Every existing FK and JWT already keyed off `users.username`:
`orders.assigned_to`, `driver_locations.driver_name`,
`push_tokens.username`, `refresh_tokens.username`, and the JWT payload
itself (`{ username, role }`) consumed by `authMiddleware` on every
protected route.

## Decision

Rather than introduce a second identity key (e.g. `users.phone_number` as
the "real" driver identity, with `username` becoming legacy/nullable for
driver rows) and ripple that through every table/route/JWT claim above,
driver accounts created via the phone-invite flow simply use their
normalized phone number (`+250XXXXXXXXX`) *as* `users.username`.

## Consequences

- Every existing FK, JWT shape, and `authMiddleware` check keeps working
  completely unmodified for driver accounts — no migration of historical
  data, no dual-identity branching logic anywhere in the request path.
- `users.phone_number` still exists as its own column (unique, used to
  look up a driver during OTP request/verify) — it's redundant with
  `username` for driver rows specifically, which is a deliberate, accepted
  duplication in exchange for zero ripple-refactor risk.
- A driver's "username" is not human-readable or memorable — `full_name`
  was added as a separate column specifically because of this, for
  anywhere the UI needs to show a real name instead.
- Migrating an *existing* pre-phone-auth driver account onto the new
  system is not an in-place upgrade — a dispatcher re-invites them by
  phone number, which creates a new row (new `username` = their phone
  number). Any order/location history tied to their old username doesn't
  automatically follow; reassigning it, if it matters, is a manual step.
