DROP INDEX IF EXISTS idx_orders_cash_settled_by;
ALTER TABLE driver_payouts DROP COLUMN IF EXISTS gross_amount;
ALTER TABLE driver_payouts DROP COLUMN IF EXISTS cash_recovered;
ALTER TABLE orders DROP COLUMN IF EXISTS cash_settled_by_payout_id;
