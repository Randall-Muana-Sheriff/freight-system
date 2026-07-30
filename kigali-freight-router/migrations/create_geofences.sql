-- Geofences: named polygon zones with a speed limit, drawn on the
-- dispatcher map. Matches controllers/geofenceController.js, which
-- upserts on (name).
CREATE TABLE IF NOT EXISTS geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    speed_limit_kmh INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_geom ON geofences USING GIST(geom);
