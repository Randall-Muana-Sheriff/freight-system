-- A driver paying the platform's share back from their own phone.
--
-- Netting a cash debt off the next payout only works for a driver who has a
-- payout coming. Somebody working mostly in cash may not have one for days,
-- and their only other route was carrying notes to whoever could mark the
-- job settled by hand. Mobile money already moves money in this direction
-- every day in Rwanda; there is no reason a commission should be the
-- exception.
--
-- Its own table rather than a row in payment_requests, which means "we asked
-- the customer for the fare". A commission settlement is a different fact
-- about different money between different parties, and it is not tied to one
-- order — a single payment can clear several.
CREATE TABLE IF NOT EXISTS cash_settlements (
    id                      SERIAL PRIMARY KEY,
    driver_username         TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    -- Ours, sent as X-Reference-Id, and the only handle for asking MTN about
    -- this attempt afterwards.
    reference               UUID NOT NULL UNIQUE,
    payer_msisdn            TEXT NOT NULL,
    amount                  NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency                TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PENDING',
    provider_transaction_id TEXT,
    failure_reason          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at             TIMESTAMPTZ,
    CONSTRAINT cash_settlements_status_check
        CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED', 'TIMED_OUT'))
);

-- One live prompt per driver. Two prompts on one handset for one debt is how
-- somebody pays their commission twice, and unlike a customer's fare there is
-- no second party to notice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_settlements_one_live
    ON cash_settlements(driver_username) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_cash_settlements_pending
    ON cash_settlements(created_at) WHERE status = 'PENDING';

-- Which settlement cleared which job, alongside the payout column that does
-- the same for netting. A driver asking what a payment covered gets an answer
-- either way.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_settled_by_settlement_id INTEGER
    REFERENCES cash_settlements(id) ON DELETE SET NULL;
