-- Returns to push-only assignment. Any live offer becomes an unassigned job
-- rather than vanishing, since the customer's order still needs moving.
UPDATE orders SET status = 'PENDING', assigned_to = NULL, offer_expires_at = NULL
 WHERE status = 'OFFERED';

DROP INDEX IF EXISTS idx_offer_declines_order;
DROP TABLE IF EXISTS order_offer_declines;
DROP INDEX IF EXISTS idx_orders_offer_expiry;
ALTER TABLE orders DROP COLUMN IF EXISTS offer_expires_at;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP',
                      'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'));
