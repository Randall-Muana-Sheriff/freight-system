-- Recovering the platform's share of a cash fare, without asking a driver to
-- make a trip to hand over notes.
--
-- A cash job leaves the driver holding the whole fare, part of which is
-- commission. Until now the only way that came back was a dispatcher marking
-- it settled by hand, which means somebody has to notice, chase, and meet.
-- Nothing recovered it automatically and nothing capped how far it could run:
-- a driver could take ten cash jobs, be paid in full for an eleventh by
-- mobile money, and still owe all of it.
--
-- Most jobs will be paid by mobile money, so the natural place to recover a
-- cash debt is the next payout — the money is already moving, and netting
-- costs the driver no trip, no transfer fee and no reminder.
--
-- Which payout cleared which job. Without this the settlement is a timestamp
-- with no explanation, and a driver asking "why was I paid less" has no
-- answer they can check.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_settled_by_payout_id INTEGER
    REFERENCES driver_payouts(id) ON DELETE SET NULL;

-- What a payout actually withheld, so the driver's statement adds up. Null
-- means nothing was owed; zero means something was owed but this payout was
-- too small to take any of it.
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS cash_recovered NUMERIC(12, 2);
ALTER TABLE driver_payouts ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_orders_cash_settled_by
    ON orders(cash_settled_by_payout_id) WHERE cash_settled_by_payout_id IS NOT NULL;
