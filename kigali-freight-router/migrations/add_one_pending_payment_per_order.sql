-- One live payment prompt per order, enforced by the database.
--
-- The application reuses an in-flight request rather than raising a second,
-- but two taps arriving together both pass that check before either inserts.
-- The consequence is not a tidy duplicate row: it is two live MTN prompts on
-- one handset for one fare, and because the payout dedupe keys on
-- payment_request_id, two collections and two driver payouts on one job.
--
-- Partial, because a resolved request must not block the next attempt — a
-- customer whose PIN failed has to be asked again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_one_live_per_order
    ON payment_requests(order_id) WHERE status = 'PENDING';
