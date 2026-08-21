-- Letting a driver say no.
--
-- Assignment today is a push: dispatch sets assigned_to and the job appears on
-- a driver's board already theirs. That is right for someone this business
-- employs -- being given work is what the job is -- and wrong for an
-- independent operator with their own truck, who is choosing whether this
-- particular run is worth their diesel and their afternoon.
--
-- So this adds a second path rather than replacing the first. Dispatch still
-- assigns a fleet driver directly; a partner gets an offer they can accept or
-- refuse. Both models have to work at once, because the fleet and the partner
-- network are meant to run side by side.
--
-- OFFERED sits before ASSIGNED. assigned_to is reused rather than adding an
-- offered_to column: the driver app already lists work by that field, so an
-- offer reaches the right phone with no change to how jobs are fetched, and
-- there is never a moment where a job is both offered to one driver and
-- assigned to another.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'OFFERED', 'ASSIGNED', 'AT_PICKUP', 'PICKED_UP',
                      'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.offer_expires_at IS
    'When an unanswered offer lapses back to PENDING. An offer nobody answers must not strand a customer''s job on a driver who has gone home.';

CREATE INDEX IF NOT EXISTS idx_orders_offer_expiry
    ON orders (offer_expires_at) WHERE status = 'OFFERED';

-- Who has already said no, so the same job is not handed straight back to
-- them. A refusal is information: a driver who declined a Rubavu run this
-- morning has told dispatch something, and re-offering it ten seconds later
-- teaches them the button does nothing.
CREATE TABLE IF NOT EXISTS order_offer_declines (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    -- Optional and free text. "Too far for the rate" and "already loaded" are
    -- different problems, and only one of them is about pricing.
    reason TEXT,
    declined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, driver_username)
);

CREATE INDEX IF NOT EXISTS idx_offer_declines_order ON order_offer_declines (order_id);
