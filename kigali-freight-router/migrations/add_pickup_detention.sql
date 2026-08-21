-- The wait at the pickup, which could not be worked out from what the system
-- already recorded.
--
-- The drop was easy: ARRIVED and DELIVERED are both real statuses, so the gap
-- between them is the wait and it has been in order_status_logs all along. The
-- pickup has no equivalent. ASSIGNED to PICKED_UP contains the drive to the
-- pickup as well as the wait once there, and no amount of arithmetic separates
-- them -- a driver forty minutes away and a driver held forty minutes at the
-- gate produce the same gap.
--
-- So the event has to be sent. AT_PICKUP sits between ASSIGNED and PICKED_UP:
-- the driver marks that they have arrived and are waiting to be loaded, and
-- the gap from there to PICKED_UP is the wait, measured the same way as the
-- drop.
--
-- detention_minutes and detention_rwf stay as the totals, so everything
-- already reading them keeps working and a customer still sees one waiting
-- line rather than two. The two ends are broken out beside them because a
-- dispute is always about one of them, never the sum.
ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS pickup_detention_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS pickup_detention_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS dropoff_detention_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS dropoff_detention_rwf NUMERIC(12,2);

COMMENT ON COLUMN orders.pickup_detention_minutes IS
    'Minutes between AT_PICKUP and PICKED_UP. NULL when the driver never marked arrival -- an unmeasured wait, not a zero one.';
COMMENT ON COLUMN orders.dropoff_detention_minutes IS
    'Minutes between ARRIVED and DELIVERED. The end that needed no new event, since both statuses already existed.';

-- What was already charged was all at the drop, so file it there rather than
-- leaving it counted twice by a later sum.
UPDATE orders
   SET dropoff_detention_minutes = detention_minutes,
       dropoff_detention_rwf = detention_rwf
 WHERE detention_minutes IS NOT NULL
   AND dropoff_detention_minutes IS NULL;
