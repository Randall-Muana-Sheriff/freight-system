DROP TABLE IF EXISTS driver_payouts;
DROP TABLE IF EXISTS payment_requests;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders DROP COLUMN IF EXISTS paid_at;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_status;
