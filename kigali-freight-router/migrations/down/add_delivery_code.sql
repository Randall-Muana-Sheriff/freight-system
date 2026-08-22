-- Back to photo-only proof. Any code-only confirmation would violate the
-- restored NOT NULL, so those rows go first -- which deletes the record of
-- deliveries that really happened, and is why this is only safe before any
-- driver has closed a job without a camera.
DELETE FROM delivery_confirmations WHERE photo_url IS NULL;

ALTER TABLE delivery_confirmations DROP CONSTRAINT IF EXISTS delivery_confirmations_has_proof;
ALTER TABLE delivery_confirmations ALTER COLUMN photo_url SET NOT NULL;
ALTER TABLE delivery_confirmations DROP COLUMN IF EXISTS proof_method;

ALTER TABLE orders
    DROP COLUMN IF EXISTS delivery_code_hash,
    DROP COLUMN IF EXISTS delivery_code_sent_at,
    DROP COLUMN IF EXISTS delivery_code_attempts;
