-- Lossy by nature, and unavoidably so: restoring NOT NULL requires every
-- "not checked" row to claim something again, and FALSE is the value the
-- column held before. Rolling back therefore reinstates the original bug.
UPDATE delivery_confirmations SET location_flagged = FALSE WHERE location_flagged IS NULL;
ALTER TABLE delivery_confirmations ALTER COLUMN location_flagged SET DEFAULT FALSE;
ALTER TABLE delivery_confirmations ALTER COLUMN location_flagged SET NOT NULL;
