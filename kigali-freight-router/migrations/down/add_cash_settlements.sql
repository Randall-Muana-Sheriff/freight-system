ALTER TABLE orders DROP COLUMN IF EXISTS cash_settled_by_settlement_id;
DROP TABLE IF EXISTS cash_settlements;
