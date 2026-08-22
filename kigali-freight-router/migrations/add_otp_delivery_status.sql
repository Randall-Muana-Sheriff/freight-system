-- Whether the sign-in code actually reached a handset.
--
-- The row already recorded that a code was issued; nothing recorded whether
-- the text carrying it went anywhere. So when Africa's Talking ran out of
-- credit, a driver waited for a message that was never sent and dispatch had
-- no way to know it had happened.
--
-- Null means not recorded -- every row written before this column existed,
-- and the review demo account, which deliberately sends nothing. 'Sent' means
-- the provider accepted it. Anything else is the provider's own status
-- verbatim (InsufficientBalance, UserInBlacklist, ...), which is what makes
-- an account-wide problem distinguishable from one unreachable number.
ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS sms_status TEXT;

-- The exceptions board asks one question of this table: which recent codes
-- did not arrive and were never used. Partial, because undelivered codes are
-- meant to be the rare case -- if this index ever grows large, something is
-- badly wrong and the index is the least of it.
CREATE INDEX IF NOT EXISTS idx_otp_codes_undelivered
    ON otp_codes (created_at DESC)
 WHERE sms_status IS NOT NULL AND sms_status <> 'Sent' AND consumed_at IS NULL;
