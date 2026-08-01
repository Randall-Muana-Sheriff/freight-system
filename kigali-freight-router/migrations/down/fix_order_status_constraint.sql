-- Reverts to the original, narrower constraint. Any existing rows with a
-- status this constraint no longer allows (IN_TRANSIT, ARRIVED, CANCELLED)
-- will make this ALTER fail outright rather than silently corrupting
-- data — that's the correct behavior for a rollback, not a bug to work
-- around here.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED'));
