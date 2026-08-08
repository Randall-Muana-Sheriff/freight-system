-- One row per driver per calendar day. `items` is a flexible JSONB map
-- (e.g. {"seatbelt": true, "mirrorsLights": false, ...}) rather than one
-- column per check — the canonical item list lives in application code, so
-- adding/renaming a check later doesn't need a migration.
CREATE TABLE IF NOT EXISTS driver_safety_checklists (
    id SERIAL PRIMARY KEY,
    driver_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    checklist_date DATE NOT NULL DEFAULT CURRENT_DATE,
    items JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (driver_username, checklist_date)
);
