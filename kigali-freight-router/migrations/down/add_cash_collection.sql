DROP INDEX IF EXISTS idx_orders_cash_unsettled;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders DROP COLUMN IF EXISTS cash_collected_at;
ALTER TABLE orders DROP COLUMN IF EXISTS cash_settled_at;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_method;
