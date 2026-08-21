-- Money on an order, and the rate card that produced it.
--
-- Two things this schema is built around, both from what Rwanda actually
-- looks like rather than from a generic pricing model:
--
-- 1. Diesel is fixed nationally by RURA and moved 1,757 -> 2,927 RWF/litre
--    in the twelve months to August 2026 (+66%), 2,205 -> 2,927 in the last
--    three of those. A rate card with prices baked into it would have been
--    wrong three times this year, so fuel is a separate input that can be
--    re-indexed on its own when RURA moves, without touching anything else.
--
-- 2. A public booking has no coordinates -- only free-text addresses -- so
--    there is no distance to price on until a dispatcher places the order
--    (PATCH /api/orders/:id/place). Pricing therefore happens twice: an
--    estimate at booking from class and weight, and a firm price once the
--    distance is real. Both are stored, because a customer who was quoted
--    one number and charged another is owed an explanation.

CREATE TABLE IF NOT EXISTS pricing_rates (
    id SERIAL PRIMARY KEY,

    -- Matches vehicle_types.name ('Light Van', 'Medium Truck', 'Heavy
    -- Hauler'). Not a foreign key: a rate card row must stay readable after
    -- a vehicle class is retired, or historical orders priced against it
    -- become unexplainable.
    vehicle_class TEXT NOT NULL,

    -- The service side -- what the driver is paid for beyond fuel.
    base_fare_rwf NUMERIC(12,2) NOT NULL,
    per_km_rwf NUMERIC(12,2) NOT NULL,
    per_kg_rwf NUMERIC(12,4) NOT NULL,
    minimum_fare_rwf NUMERIC(12,2) NOT NULL,

    -- The fuel side, kept apart so a RURA price change is one number.
    fuel_litres_per_100km NUMERIC(8,2) NOT NULL,
    diesel_price_rwf_per_litre NUMERIC(10,2) NOT NULL,

    -- What the platform keeps. Charged on the service component only, never
    -- on the fuel pass-through: taking a percentage of fuel would have grown
    -- the platform's cut by 66% this year while the driver absorbed the
    -- entire increase, which is how an operator loses its drivers.
    platform_commission_pct NUMERIC(5,2) NOT NULL,

    -- A floor, because a percentage of a small job does not cover what the
    -- job costs to run. Every completed job spends real money: SMS to the
    -- customer (Africa's Talking bills this system RWF 14 a message), the
    -- MoMo collection fee (0.5-1.5%), storage for the proof-of-delivery
    -- photo, and a share of hosting. Without a floor the platform loses
    -- money on exactly the small local runs it most wants to attract.
    platform_minimum_fee_rwf NUMERIC(12,2) NOT NULL,

    -- Insert-only. Superseding a rate means writing a new row, never editing
    -- one, so a quote given last week can still be explained and a
    -- commission already taken can never be silently restated.
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rates_lookup
    ON pricing_rates (vehicle_class, effective_from DESC);

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS pricing_rate_id INTEGER REFERENCES pricing_rates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS priced_vehicle_class TEXT,
    ADD COLUMN IF NOT EXISTS quoted_total_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_total_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_fuel_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_service_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS platform_fee_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS driver_net_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS price_distance_km NUMERIC(10,3),
    ADD COLUMN IF NOT EXISTS price_is_estimate BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS price_override_reason TEXT;

COMMENT ON COLUMN orders.quoted_total_rwf IS
    'What the customer was shown at booking, before a distance was known. Never overwritten.';
COMMENT ON COLUMN orders.price_total_rwf IS
    'The agreed price. Equals quoted_total_rwf until a dispatcher places the order and a real distance replaces the estimate.';
COMMENT ON COLUMN orders.price_is_estimate IS
    'TRUE while the price came from class and weight alone; FALSE once it was recomputed against a real pickup-to-delivery distance.';

-- Opening rate card. These numbers are a starting point to calibrate
-- against real jobs, not researched market rates: Rwandan freight pricing
-- is quoted by phone and published nowhere, and RURA "contributes in fixing
-- goods transport fares", so the regulated position has to be confirmed
-- before these are treated as final. Fuel is the one figure here that is
-- real -- 2,927 RWF/litre, the RURA diesel price on 17 August 2026.
INSERT INTO pricing_rates (
    vehicle_class, base_fare_rwf, per_km_rwf, per_kg_rwf, minimum_fare_rwf,
    fuel_litres_per_100km, diesel_price_rwf_per_litre,
    platform_commission_pct, platform_minimum_fee_rwf, note
) VALUES
    ('Light Van',     5000,  400, 15.0,  8000, 10.0, 2927, 15.0, 500, 'Opening card. Calibrate against real jobs.'),
    ('Medium Truck', 12000,  700, 12.0, 20000, 20.0, 2927, 15.0, 500, 'Opening card. Calibrate against real jobs.'),
    ('Heavy Hauler', 25000, 1100,  8.0, 45000, 35.0, 2927, 15.0, 500, 'Opening card. Calibrate against real jobs.')
ON CONFLICT DO NOTHING;
