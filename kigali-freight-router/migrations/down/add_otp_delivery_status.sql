DROP INDEX IF EXISTS idx_otp_codes_undelivered;
ALTER TABLE otp_codes DROP COLUMN IF EXISTS sms_status;
