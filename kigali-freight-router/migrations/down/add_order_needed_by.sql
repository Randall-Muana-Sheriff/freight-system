ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_needed_by_check;
ALTER TABLE orders DROP COLUMN IF EXISTS needed_by;
