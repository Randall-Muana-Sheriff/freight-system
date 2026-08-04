ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_pending_secret;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled_at;
ALTER TABLE users DROP COLUMN IF EXISTS totp_recovery_code_hashes;
