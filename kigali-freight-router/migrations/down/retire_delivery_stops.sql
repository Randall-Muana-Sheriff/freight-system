-- Recreates the shape delivery_stops had, empty. The rows it held were
-- three seeded demo points, not data anyone should want back.
CREATE TABLE IF NOT EXISTS delivery_stops (
    id SERIAL PRIMARY KEY,
    name TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    demand INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_status ON delivery_stops (status);
