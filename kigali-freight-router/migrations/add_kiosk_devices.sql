-- A wall-display device (control room, dispatch desk, warehouse) that
-- authenticates with a long-lived, admin-issued token instead of a human
-- login. The token itself is a JWT (role: 'kiosk', deviceId) with no
-- expiry; this table is what makes it revocable — losing a device or
-- decommissioning one means marking its row revoked, not rotating
-- JWT_SECRET and logging out every dispatcher and driver. Hashed with
-- fast SHA-256 (not bcrypt), matching driver_invites/otp_codes: the token
-- is high-entropy (32 random bytes) and protected by that entropy plus
-- revocability, not by slow-hash cost.
CREATE TABLE IF NOT EXISTS kiosk_devices (
    id SERIAL PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
