-- Users table: authentication accounts for dispatchers, drivers, and admins.
-- Schema uses `username` (not name/email) and a free-text lowercase role,
-- matching controllers/authController.js and utils/roles.js (ALLOWED_ROLES).
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'dispatcher',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
