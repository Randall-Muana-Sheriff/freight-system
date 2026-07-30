-- Vehicle "type" used to be a hardcoded 3-option dropdown in the fleet
-- registration form (Heavy Hauler / Medium Truck / Light Van) with no way
-- to add a new category without editing the frontend source. This makes it
-- a real, admin-manageable reference list instead.
--
-- fleet_vehicles.vehicle_type deliberately stays a plain text column, not a
-- new FK — it was already loosely-typed free text before this (nothing in
-- the app branches on its exact value), and retiring a type here should
-- never retroactively affect vehicles already registered with it.
CREATE TABLE IF NOT EXISTS vehicle_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO vehicle_types (name) VALUES
    ('Heavy Hauler'),
    ('Medium Truck'),
    ('Light Van')
ON CONFLICT (name) DO NOTHING;
