-- Customer-placed orders. Until now every order was typed in by a
-- dispatcher (POST /api/orders is admin/dispatcher only), so the table had
-- no notion of who asked for the delivery — recipient_name/recipient_phone
-- describe whoever receives the goods, not whoever booked and pays.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- What the customer actually typed. A public form cannot produce
-- coordinates, and guessing them is worse than not having them: "Kimironko
-- Market" geocodes to several places and a truck sent to the wrong one is
-- a real cost. The dispatcher who reviews the order places it on the map,
-- and these stay as the customer's own words for them to work from.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_address_text TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_text TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;

-- Which door the order came through. Dispatchers need to see at a glance
-- that a row is an unreviewed public request rather than something a
-- colleague entered and already validated.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'dispatch';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check CHECK (source IN ('dispatch', 'public'));

-- Public tracking handle. Deliberately NOT derived from the id: the driver
-- app already displays 'KGL-TRIP-' || lpad(id) and the mockup carried that
-- straight onto a public page, which would let anyone walk KF-0043,
-- KF-0044, KF-0045 and read every customer's cargo, addresses and driver
-- name. A random token makes the tracking page safe to expose with no
-- login. Nullable because dispatcher-created orders predate it and don't
-- need one.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders (tracking_token) WHERE tracking_token IS NOT NULL;

-- Coordinates become optional. They were NOT NULL because only dispatchers
-- —- who pick points on a map -— could ever create an order. A customer
-- request legitimately has no coordinates until someone places it, and
-- storing a placeholder (hub centroid, 0/0) would put phantom trucks on
-- the fleet map and feed garbage into the ST_DistanceSphere route-progress
-- maths. Absent is the truthful representation.
ALTER TABLE orders ALTER COLUMN pickup_coordinates DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN delivery_coordinates DROP NOT NULL;

-- Contact-form submissions from the public site. Separate table rather
-- than an order with no cargo: a sales enquiry is not a delivery and
-- should never appear on the dispatch board.
CREATE TABLE IF NOT EXISTS contact_messages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    message TEXT NOT NULL,
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_unhandled
    ON contact_messages (created_at DESC) WHERE handled_at IS NULL;
