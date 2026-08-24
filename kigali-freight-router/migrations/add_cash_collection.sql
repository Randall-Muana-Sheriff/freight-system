-- Recording that a driver took the fare in cash.
--
-- The system tells a driver "take cash and record it with dispatch" whenever
-- mobile money is unavailable -- no MTN number, no credit, an unreachable
-- provider -- and gave them nowhere to record it. So a cash job and an unpaid
-- job looked identical in the database, which is a fairness problem for
-- honest drivers before it is an accounting one: nothing distinguished a
-- driver who collected and handed over from one who pocketed it, and the
-- driver had no way to prove which they were.
--
-- 108 delivered orders currently sit unbilled with no way to tell which were
-- paid in cash at the door.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
DO $$ BEGIN
    ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
        CHECK (payment_method IS NULL OR payment_method IN ('MOMO', 'CASH'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cash runs the opposite way to mobile money, and this is the column that
-- says so.
--
-- On a MoMo job the customer pays the platform and the platform owes the
-- driver their share -- that is driver_payouts. On a cash job the driver is
-- already holding the whole fare, so nobody owes them anything: THEY owe the
-- platform its commission. Queuing a payout for a cash job would pay a driver
-- a second time for money already in their pocket.
--
-- Null while the driver still holds the platform's share; stamped when
-- dispatch confirms they have handed it over.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_settled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_collected_at TIMESTAMPTZ;

-- The board's work list: cash taken and the commission not yet handed in.
CREATE INDEX IF NOT EXISTS idx_orders_cash_unsettled
    ON orders(cash_collected_at) WHERE payment_method = 'CASH' AND cash_settled_at IS NULL;
