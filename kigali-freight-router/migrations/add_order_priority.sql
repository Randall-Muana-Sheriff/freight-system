-- Lets dispatch flag an order's urgency so drivers can tell at a glance
-- which assignment matters most, instead of every job looking equally
-- routine on the Jobs list.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE orders ADD CONSTRAINT orders_priority_check CHECK (priority IN ('high', 'normal', 'low'));
