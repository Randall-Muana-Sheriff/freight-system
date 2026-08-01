ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_username_fkey;
ALTER TABLE driver_locations DROP CONSTRAINT IF EXISTS driver_locations_driver_name_fkey;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_assigned_to_fkey;
ALTER TABLE orders DROP COLUMN IF EXISTS vehicle_id;
ALTER TABLE fleet_vehicles DROP COLUMN IF EXISTS max_range_km;
ALTER TABLE fleet_vehicles DROP COLUMN IF EXISTS max_weight_kg;
