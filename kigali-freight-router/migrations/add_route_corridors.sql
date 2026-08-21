-- Which way out of Kigali is flat.
--
-- terrain_fuel_factor on the rate card assumes any run leaving the city is
-- climbing, which is true of most of Rwanda and wrong for the east. RURA's own
-- fare schedule groups routes into four directional corridors, and its eastern
-- group -- Rwamagana, Kayonza, Nyagatare, Rusumo, Bugesera -- runs onto the
-- Akagera plain rather than over the highlands. Charging those runs a mountain
-- fuel penalty overcharges the customer and pockets the difference.
--
-- This table holds only the exceptions. A corridor listed here overrides the
-- rate card's factor; anything not listed climbs, which is the safe default in
-- a country this hilly.
--
-- Bearing alone cannot do it. Nyagatare sits at 22 degrees and Gicumbi at 7, a
-- plain and a highland fifteen degrees apart, so the eastern sector has to
-- start tight. Worse, Bugesera is flat lowland lying due south at 168 degrees,
-- in the same direction as the climb to Huye -- so it is separated by distance
-- instead: the lowland is close, the highlands are far.
CREATE TABLE IF NOT EXISTS route_corridors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    -- Degrees clockwise from north, measured from the pickup toward the
    -- delivery. A range that wraps past 360 is written as two rows.
    bearing_from_deg NUMERIC(6,2) NOT NULL,
    bearing_to_deg NUMERIC(6,2) NOT NULL,
    -- NULL means the corridor runs as far as it runs.
    max_distance_km NUMERIC(8,2),
    terrain_fuel_factor NUMERIC(5,3) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Narrowest first: Bugesera is a distance-limited slice of a direction that is
-- otherwise mountainous, so it has to be tried before anything wider.
CREATE INDEX IF NOT EXISTS idx_route_corridors_lookup
    ON route_corridors (max_distance_km NULLS LAST, bearing_from_deg);

INSERT INTO route_corridors (name, bearing_from_deg, bearing_to_deg, max_distance_km, terrain_fuel_factor, note)
VALUES
    ('Bugesera lowland', 135, 200, 60, 1.000,
     'Nyamata and the Bugesera lowland lie due south at ~168 degrees but are flat. Distance-limited so the climb to Muhanga and Huye, same direction and much further, still pays the highland factor.'),
    ('Eastern plain', 15, 135, NULL, 1.000,
     'RURA''s eastern group -- Rwamagana 91, Kayonza 84, Rusumo 121, Nyagatare 22 degrees. Starts at 15 rather than 0 to keep Gicumbi, 7 degrees and firmly highland, out of it.')
ON CONFLICT DO NOTHING;
