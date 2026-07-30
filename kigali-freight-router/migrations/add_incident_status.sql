-- Incident-report lifecycle: driver-submitted incident reports (and
-- automated geofence/speed alerts, which share this table) previously had
-- no state beyond "it was created" — a dispatcher had no way to mark one
-- as seen or closed, so the list only ever grew.
ALTER TABLE geofence_alerts
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS resolved_by TEXT,
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE geofence_alerts
    ADD CONSTRAINT geofence_alerts_status_check
    CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED'));
