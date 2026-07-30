-- Vehicle capacity: the dispatcher UI has always collected this
-- (AdminControlPanel's "Max Weight"/"Max Range" fields), but the backend
-- silently discarded it — fleet_vehicles never had columns for it, so
-- there was no way to check whether a truck could actually carry an
-- order's weight.
ALTER TABLE fleet_vehicles
    ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS max_range_km NUMERIC(10,2);

-- Which vehicle actually carried this order. orders and fleet_vehicles
-- previously never referenced each other at all — an order was assigned
-- to a driver by name only, with no link to the truck they were driving.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL;

-- Referential integrity: assigned_to/driver_name/username columns across
-- the operational tables were free-text with no guarantee the named user
-- actually exists — a typo or stale reference just silently vanished into
-- an assignment nobody would ever see. users.username is already UNIQUE,
-- so these are real foreign keys without changing the column type or any
-- application code that already treats these as plain strings.
--
-- Audit/history tables (geofence_alerts, delivery_confirmations,
-- order_status_logs, completed_routes) are deliberately NOT constrained
-- here: they use synthetic fallback identities like 'SYSTEM_DISPATCH' /
-- 'SYSTEM_DRIVER' that aren't real users, and a historical record should
-- survive even if the user who made it is later removed.
ALTER TABLE orders
    ADD CONSTRAINT orders_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES users(username) ON DELETE SET NULL;

ALTER TABLE driver_locations
    ADD CONSTRAINT driver_locations_driver_name_fkey
    FOREIGN KEY (driver_name) REFERENCES users(username) ON DELETE CASCADE;

ALTER TABLE push_tokens
    ADD CONSTRAINT push_tokens_username_fkey
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE;
