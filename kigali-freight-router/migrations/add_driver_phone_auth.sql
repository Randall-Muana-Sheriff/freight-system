-- Driver auth is moving from username+password to phone+OTP+PIN (mobile app
-- only — dispatcher/admin username+password on the web dashboard is
-- untouched). Rather than introduce a second identity key and ripple it
-- through every existing FK/JWT that already keys off users.username
-- (orders.assigned_to, driver_locations.driver_name, push_tokens.username,
-- refresh_tokens.username), driver accounts created via the new invite flow
-- simply use their phone number AS their username. Everything downstream
-- keeps working unmodified.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

-- Set once, at the first successful PIN setup. Deliberately separate from
-- pin_hash: a dispatcher-triggered "reset PIN" (POST
-- /api/admin/users/:id/reset-driver-pin) nulls pin_hash to force the driver
-- back through PIN setup, but must NOT also send them back through the
-- invite-code step — onboarding_completed_at staying set is what tells
-- POST /api/auth/driver/otp/verify this is a "returning" driver either way.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Drivers no longer have a human-readable username (theirs is now a phone
-- number) — the reveal/profile screens need a real display name instead.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Driver rows created via dispatcher invite have no password at all.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Generates the 'KF-####' staff ID shown on the driver's profile-reveal
-- screen, atomically, at invite time.
CREATE SEQUENCE IF NOT EXISTS staff_id_seq START WITH 1001;
