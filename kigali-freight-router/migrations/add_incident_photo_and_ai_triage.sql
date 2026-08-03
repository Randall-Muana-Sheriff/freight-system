-- Backs photo-first incident reporting and AI-assisted triage. Driver
-- reports can now optionally attach a photo (stored the same way as
-- delivery/document photos — a private R2 key, signed at read time) and
-- their GPS position at the moment of the report, so the backend can
-- compute a nearest hub for immediate guidance. severity/ai_analysis are
-- populated synchronously at submit time (unlike document review's
-- fire-and-forget analysis) specifically so the driver's own submit
-- response can carry real-time guidance, not just an annotation for later.
ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

ALTER TABLE geofence_alerts DROP CONSTRAINT IF EXISTS geofence_alerts_severity_check;
ALTER TABLE geofence_alerts
    ADD CONSTRAINT geofence_alerts_severity_check
    CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_geofence_alerts_severity ON geofence_alerts (severity) WHERE event_type = 'MANUAL_INCIDENT';
