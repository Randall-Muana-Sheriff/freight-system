-- Drops what was charged for waiting. Any detention already billed is lost
-- from the record, so this is only safe before real invoices exist.
ALTER TABLE orders
    DROP COLUMN IF EXISTS detention_minutes,
    DROP COLUMN IF EXISTS detention_rwf;
