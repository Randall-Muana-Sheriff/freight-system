-- Legacy refresh_tokens tables stored user_id instead of username.
-- The app now keys refresh tokens by username, so drop the old column.

ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS user_id;
