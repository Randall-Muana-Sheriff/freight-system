-- Opt-in TOTP (authenticator-app) MFA for staff (admin/dispatcher) login.
-- totp_pending_secret holds a freshly-generated secret during enrollment,
-- before the user has proven they can generate a matching code — it's
-- only promoted to totp_secret (and totp_enabled_at set) after that
-- first successful confirmation, so a broken enrollment (bad QR scan,
-- wrong app) never leaves an account silently locked with no working
-- device behind it. Both secret columns are encrypted at rest (see
-- services/totpService.js) since, unlike a password hash, a TOTP secret
-- has to be retrievable to generate a comparison code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
-- Ten single-use backup codes generated at enrollment, shown once,
-- hashed with fast SHA-256 (same convention as OTP/invite codes
-- elsewhere) — without these, a lost authenticator device would mean a
-- permanently locked-out admin account with no self-service recovery.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_code_hashes TEXT[];
