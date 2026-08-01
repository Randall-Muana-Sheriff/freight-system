-- Short-lived SMS verification codes for driver phone login (both new-driver
-- onboarding and returning-driver sign-in share this same OTP step). Hashed
-- with fast SHA-256, not bcrypt — a 5-minute expiry plus a per-phone rate
-- limit (see middleware/rateLimit.js) protects against brute-forcing a
-- 6-digit code, so slow hashing buys nothing here.
CREATE TABLE IF NOT EXISTS otp_codes (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_number ON otp_codes(phone_number);
