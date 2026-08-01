ALTER TABLE geofence_alerts DROP CONSTRAINT IF EXISTS geofence_alerts_status_check;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS resolved_at;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS resolved_by;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS status;
