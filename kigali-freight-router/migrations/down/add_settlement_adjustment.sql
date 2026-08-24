DROP INDEX IF EXISTS idx_orders_settlement_outstanding;
ALTER TABLE orders DROP COLUMN IF EXISTS settlement_note;
ALTER TABLE orders DROP COLUMN IF EXISTS settlement_adjustment;
