-- The original orders table CHECK constraint only allowed
-- ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'), but orderController.js's
-- ALLOWED_ORDER_STATUSES (and the mobile trip screen's own action buttons)
-- also use IN_TRANSIT, ARRIVED, and CANCELLED. Without this fix, a driver
-- tapping "in transit" or "arrived" would hit a database constraint
-- violation. Widen the constraint to match what the application actually
-- sends.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'));
