-- Proof-of-delivery photo + notes, captured when a driver marks an order
-- as DELIVERED. One row per confirmation (an order should only ever have
-- one, but this isn't constrained unique in case a redelivery genuinely
-- needs a second confirmation later).

CREATE TABLE IF NOT EXISTS delivery_confirmations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_name VARCHAR(255) NOT NULL,
    photo_url TEXT NOT NULL,
    notes TEXT,
    confirmed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_confirmations_order_id ON delivery_confirmations (order_id);
