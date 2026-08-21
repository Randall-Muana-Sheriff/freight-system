ALTER TABLE driver_safety_checklists DROP CONSTRAINT IF EXISTS driver_safety_checklists_inspection_type_check;
ALTER TABLE driver_safety_checklists DROP COLUMN IF EXISTS vehicle_id;
ALTER TABLE driver_safety_checklists DROP COLUMN IF EXISTS inspection_type;
DROP INDEX IF EXISTS idx_geofence_alerts_vehicle_open;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS vehicle_id;
