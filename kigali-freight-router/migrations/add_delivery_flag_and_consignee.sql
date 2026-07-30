-- Delivery location soft-flag: confirmDelivery still accepts the
-- confirmation even when the driver's last known position is far from the
-- order's delivery point (a stale GPS fix or an imprecise drop pin
-- shouldn't block a real delivery), but records how far off it was so a
-- dispatcher can spot-check anything suspicious.
ALTER TABLE delivery_confirmations
    ADD COLUMN IF NOT EXISTS distance_from_target_m NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS location_flagged BOOLEAN NOT NULL DEFAULT FALSE;

-- Consignee contact info: orders previously carried no record of who was
-- actually receiving the shipment or how to reach them — a driver arriving
-- at a delivery point had no way to call ahead or confirm they had the
-- right person.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(50);
