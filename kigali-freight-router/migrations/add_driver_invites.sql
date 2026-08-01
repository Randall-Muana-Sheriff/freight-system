-- A dispatcher-issued invite (staff ID + 6-character code) that a new
-- driver redeems once, from their phone, to prove they're the person the
-- dispatcher actually onboarded. The code is hashed with fast SHA-256 (not
-- bcrypt) since it's short-lived (48h) and protected by rate limiting on
-- the verify endpoint rather than slow hashing.
CREATE TABLE IF NOT EXISTS driver_invites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_invites_user_id ON driver_invites(user_id);
