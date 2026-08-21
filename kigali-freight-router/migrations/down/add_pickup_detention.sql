-- Puts the status list back and drops the per-end breakdown. The totals in
-- detention_minutes/detention_rwf survive, so nothing already billed is lost;
-- only the ability to say which end of the job it happened at.
--
-- Any order sitting in AT_PICKUP would violate the restored constraint, so it
-- is moved back to ASSIGNED first -- the status it would have held if the
-- driver had never been able to mark arrival.
UPDATE orders SET status = 'ASSIGNED' WHERE status = 'AT_PICKUP';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE orders
    DROP COLUMN IF EXISTS pickup_detention_minutes,
    DROP COLUMN IF EXISTS pickup_detention_rwf,
    DROP COLUMN IF EXISTS dropoff_detention_minutes,
    DROP COLUMN IF EXISTS dropoff_detention_rwf;
