-- Reverses add_public_orders.sql. Restoring the NOT NULLs will fail if any
-- public order is still awaiting a dispatcher's placement — that is
-- correct: those rows are real customer requests and must be resolved or
-- cancelled deliberately, not silently dropped by a rollback.
DROP TABLE IF EXISTS contact_messages;

DROP INDEX IF EXISTS idx_orders_tracking_token;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_token;
ALTER TABLE orders DROP COLUMN IF EXISTS source;
ALTER TABLE orders DROP COLUMN IF EXISTS special_instructions;
ALTER TABLE orders DROP COLUMN IF EXISTS delivery_address_text;
ALTER TABLE orders DROP COLUMN IF EXISTS pickup_address_text;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_email;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE orders DROP COLUMN IF EXISTS customer_name;

ALTER TABLE orders ALTER COLUMN pickup_coordinates SET NOT NULL;
ALTER TABLE orders ALTER COLUMN delivery_coordinates SET NOT NULL;
