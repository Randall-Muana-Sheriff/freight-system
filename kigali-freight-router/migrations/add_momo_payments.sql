-- Cash on delivery, collected by mobile money at the door.
--
-- The driver arrives, asks the customer to pay, and MTN pushes a PIN prompt
-- to the customer's handset. Nothing about the goods changes hands until the
-- money does -- which is what "cash on delivery" has always meant, and is why
-- the request is raised at ARRIVED rather than at booking.

-- Payment is tracked separately from delivery, deliberately.
--
-- Folding "paid" into the order status would mean a paid order is a finished
-- order, and a driver could collect at the gate and drive away with the load
-- while the record said DELIVERED. These are two facts about one job: the
-- money arrived, and the goods did. Both are required, and each is proven
-- its own way -- this column, and delivery_confirmations.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
DO $$ BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('UNPAID', 'PENDING', 'PAID', 'FAILED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per attempt to collect, not one per order.
--
-- A customer mistypes their PIN, or pays from a different handset than the
-- one they booked with, and the driver asks again. Each attempt is its own
-- conversation with MTN with its own reference, and keeping them all is what
-- lets anyone afterwards answer "how many times were they asked, and what
-- did MTN say each time".
CREATE TABLE IF NOT EXISTS payment_requests (
    id                      SERIAL PRIMARY KEY,
    order_id                INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- Ours, not MTN's. This is the X-Reference-Id we generate and send, and
    -- the only handle that lets us ask MTN about this attempt afterwards.
    -- Generated before the call so a request that times out mid-flight is
    -- still traceable rather than lost.
    reference               UUID NOT NULL UNIQUE,
    provider                TEXT NOT NULL DEFAULT 'MTN_MOMO',
    -- Who was actually asked, which is not always the booking number: a
    -- customer on Airtel hands over an MTN number at the door, and the
    -- record has to show which handset was charged.
    payer_msisdn            TEXT NOT NULL,
    payer_is_booking_number BOOLEAN NOT NULL DEFAULT TRUE,
    amount                  NUMERIC(12, 2) NOT NULL,
    currency                TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PENDING',
    -- MTN's own id for the money movement, once there is one. This is the
    -- number to quote to MTN support; ours means nothing to them.
    provider_transaction_id TEXT,
    failure_reason          TEXT,
    requested_by            TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at             TIMESTAMPTZ,
    CONSTRAINT payment_requests_status_check
        CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'TIMED_OUT'))
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_order ON payment_requests(order_id, created_at DESC);
-- The reconciliation sweep's work list: attempts MTN has not answered for.
-- Partial, because a healthy system has almost none.
CREATE INDEX IF NOT EXISTS idx_payment_requests_pending
    ON payment_requests(created_at) WHERE status = 'PENDING';

-- What the driver is owed, recorded the moment the customer pays.
--
-- The row exists before the money moves, on purpose. A driver who has just
-- been paid at the gate should see the earning immediately; the transfer
-- itself is a separate, slower thing that can fail and be retried without
-- the driver's balance flickering. release_at is what makes "a few minutes
-- later" a property of the data rather than a sleep in a worker.
CREATE TABLE IF NOT EXISTS driver_payouts (
    id                      SERIAL PRIMARY KEY,
    order_id                INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    payment_request_id      INTEGER REFERENCES payment_requests(id) ON DELETE SET NULL,
    driver_username         TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    payee_msisdn            TEXT NOT NULL,
    reference               UUID NOT NULL UNIQUE,
    amount                  NUMERIC(12, 2) NOT NULL,
    currency                TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'QUEUED',
    release_at              TIMESTAMPTZ NOT NULL,
    provider_transaction_id TEXT,
    failure_reason          TEXT,
    attempts                INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at                 TIMESTAMPTZ,
    CONSTRAINT driver_payouts_status_check
        CHECK (status IN ('QUEUED', 'SENDING', 'SUCCESSFUL', 'FAILED', 'HELD'))
);

-- One payout per collection. Paying a driver twice for one job is the single
-- worst thing this table can do, so the database refuses it rather than
-- trusting every code path that will ever write here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_payouts_one_per_payment
    ON driver_payouts(payment_request_id) WHERE payment_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_payouts_due
    ON driver_payouts(release_at) WHERE status = 'QUEUED';
CREATE INDEX IF NOT EXISTS idx_driver_payouts_driver ON driver_payouts(driver_username, created_at DESC);
