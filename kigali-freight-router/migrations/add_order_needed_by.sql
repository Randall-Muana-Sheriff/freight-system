-- When the customer needs it, in their words.
--
-- Deliberately NOT wired to orders.priority. If picking "today" silently
-- set high priority, every booking would say today within a week and the
-- queue's sort would stop meaning anything — the usual fate of a free,
-- self-declared urgency field. This is input for the dispatcher, who sets
-- priority themselves after reading the request.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needed_by TEXT;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_needed_by_check;
ALTER TABLE orders ADD CONSTRAINT orders_needed_by_check
    CHECK (needed_by IS NULL OR needed_by IN ('today', 'tomorrow', 'this_week', 'flexible'));
