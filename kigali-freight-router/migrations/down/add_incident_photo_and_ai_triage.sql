DROP INDEX IF EXISTS idx_geofence_alerts_severity;
ALTER TABLE geofence_alerts DROP CONSTRAINT IF EXISTS geofence_alerts_severity_check;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS ai_analysis;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS severity;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS lng;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS lat;
ALTER TABLE geofence_alerts DROP COLUMN IF EXISTS photo_url;
