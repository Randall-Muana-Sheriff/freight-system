-- Driver self-signup (POST /api/auth/signup) previously activated the
-- account immediately and logged the driver straight in — there was no way
-- for an admin to review who's requesting access before they can see
-- assignments or send telemetry. Staff accounts (dispatcher/admin) are
-- always created directly by an existing admin, so they default to
-- 'approved' and skip the review step entirely; only self-signups start
-- 'pending'.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved';

ALTER TABLE users
    ADD CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));
