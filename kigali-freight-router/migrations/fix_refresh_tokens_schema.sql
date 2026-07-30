-- Repairs refresh_tokens when an older table exists without the username
-- column (the MVP migration's CREATE TABLE is skipped in that case).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'refresh_tokens'
    ) THEN
        CREATE TABLE refresh_tokens (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            token_hash VARCHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'username'
    ) THEN
        -- Drop stale tokens from any legacy schema; sessions can re-login.
        TRUNCATE refresh_tokens;
        ALTER TABLE refresh_tokens ADD COLUMN username VARCHAR(255);

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'refresh_tokens'
              AND column_name = 'user_id'
        ) THEN
            UPDATE refresh_tokens rt
            SET username = u.username
            FROM users u
            WHERE rt.user_id = u.id;
        END IF;

        UPDATE refresh_tokens SET username = 'unknown' WHERE username IS NULL;
        ALTER TABLE refresh_tokens ALTER COLUMN username SET NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_username ON refresh_tokens (username);
