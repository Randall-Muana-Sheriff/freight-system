-- Pay a driver for being kept waiting.
--
-- A job is priced by distance and weight, so the hour spent at a warehouse
-- gate earns nothing -- which is why drivers charge for it themselves. The
-- rate has been on the card since add_pricing_route_factors; this is where it
-- finally reaches a driver.
--
-- Nothing new has to be recorded to work it out. order_status_logs has stamped
-- every transition since the original schema, and ARRIVED and DELIVERED are
-- both real statuses, so the wait at the drop is the gap between them and has
-- been sitting in the data all along. On one local database there were 55
-- completed pairs, the longest a 151-minute wait -- 91 chargeable minutes, or
-- close to 13,000 RWF of a truck driver's time that nobody paid for.
--
-- The pickup side cannot be done this way. ASSIGNED to PICKED_UP contains the
-- drive to the pickup as well as the wait there, and separating them needs an
-- arrival event the driver app does not send yet.
--
-- Detention goes to the driver in full, like fuel and for the same reason: it
-- reimburses time lost, not service the platform brokered. Charging commission
-- on a driver's stolen hour is not a thing to do.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS detention_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS detention_rwf NUMERIC(12,2);

COMMENT ON COLUMN orders.detention_minutes IS
    'Minutes between ARRIVED and DELIVERED at the drop. Recorded even when under the free allowance, so a dispute has a number.';
COMMENT ON COLUMN orders.detention_rwf IS
    'Charged for the wait beyond the free allowance. Added to the customer''s total and passed to the driver whole -- no commission is taken on it.';
