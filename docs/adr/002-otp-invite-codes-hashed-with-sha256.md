# 2. OTP and invite codes are hashed with SHA-256, not bcrypt

## Context

Every other credential in this system (account passwords, driver PINs) is
hashed with bcrypt. OTP codes (`otp_codes.code_hash`) and driver invite
codes (`driver_invites.invite_code_hash`) are hashed with plain
`crypto.createHash('sha256')` instead.

## Decision

Keep SHA-256 for these two specifically, and don't "fix" it to bcrypt.

## Consequences

- This is intentional, not an oversight: bcrypt's cost is what makes it
  worth using for a password or PIN — a secret an attacker might try to
  crack offline over an unbounded amount of time. OTP codes (6 digits, 5
  minute expiry) and invite codes (6 characters, 48 hour expiry) are
  short-lived and already protected by per-phone rate limiting on the
  verify endpoints (`middleware/rateLimit.js`'s `keyFn` support exists
  specifically for this). Bcrypt's slowness would add real per-request
  latency for zero additional protection against a code that expires in
  minutes and is rate-limited regardless.
- Do not reuse this pattern for anything long-lived or unthrottled — the
  moment a "code" needs to survive longer than a rate-limit window can
  meaningfully bound attempts, it needs bcrypt (or equivalent) instead.
