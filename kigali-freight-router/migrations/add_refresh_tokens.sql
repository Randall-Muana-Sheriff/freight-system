-- Refresh tokens let a session survive past the (deliberately short)
-- access token expiry, without ever re-prompting for a password mid-shift.
-- Only the SHA-256 hash is stored — never the raw token — mirroring why
-- passwords are hashed rather than stored plain: a DB read alone should
-- never be enough to impersonate a session.

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_username ON refresh_tokens (username);
