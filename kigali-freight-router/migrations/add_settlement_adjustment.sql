-- What is still owed, in either direction, after the money was collected.
--
-- Cash on delivery is collected at the door, at ARRIVED. Two figures are only
-- known afterwards: drop detention, computed when the driver finally leaves,
-- and the return-leg credit, applied when a backfill fills the empty run
-- home. Both were being added to price_total after the charge had already
-- happened, so the amount collected and the amount owed silently disagreed
-- and nothing recorded which was which.
--
-- Once money has moved, price_total is a record of what was charged and must
-- stop moving. The difference lives here instead.
--
-- Positive means the customer owes more -- they held the driver two hours and
-- were charged before the clock stopped. Negative means they are owed a
-- refund -- their empty leg was filled by somebody else's load after they
-- had already paid for it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_adjustment NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_note TEXT;

-- The board's work list: money outstanding in either direction. Partial,
-- because on a healthy job it is zero and there is nothing to chase.
CREATE INDEX IF NOT EXISTS idx_orders_settlement_outstanding
    ON orders(updated_at DESC) WHERE settlement_adjustment <> 0;
