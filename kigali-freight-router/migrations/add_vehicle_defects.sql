-- Turns the pre-departure checklist from a tick-box into defect reporting.
--
-- The checklist could previously only say "ticked" or "not ticked" — its API
-- takes { itemKey, checked } as a boolean. A driver who found a cracked tyre
-- had two options: tick it anyway, or leave it blank, which is
-- indistinguishable from "haven't got to it yet". The record said boxes were
-- ticked and nothing more, which satisfies no regulator, changes no dispatch
-- decision, and quietly teaches drivers to tick without looking.
--
-- What the popular fleet platforms actually get from their equivalent (DVIR
-- in the US, the daily walkaround in the UK/EU) is not the ticks — it is the
-- defect: a fault raised by the person who touched the vehicle, attached to
-- that vehicle, visible to whoever drives it next, with a life of its own
-- until somebody fixes it. The checklist is only the prompt.
--
-- Almost all of that already exists here. geofence_alerts carries a status
-- lifecycle, resolved_by/resolved_at, a photo, severity, and reaches
-- dispatch. It was missing exactly one thing: a defect belongs to a truck,
-- not to whoever happened to be driving it that morning.
ALTER TABLE geofence_alerts
    ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL;

-- The lookup the next driver and the dispatcher both need: what is currently
-- wrong with this vehicle. Partial, because a resolved defect is history and
-- only open ones gate anything.
CREATE INDEX IF NOT EXISTS idx_geofence_alerts_vehicle_open
    ON geofence_alerts (vehicle_id, created_at DESC)
    WHERE status = 'OPEN';

-- Rwanda mandates no daily inspection record today, so nothing here is
-- required yet. The column exists because the regimes this system will meet
-- when it crosses a border do distinguish the two — FMCSA's DVIR is filed
-- pre-trip and post-trip, and a post-trip defect is what the next driver
-- must review before moving. Adding it now costs one nullable column;
-- adding it after there is inspection history costs a backfill nobody can
-- do accurately.
ALTER TABLE driver_safety_checklists
    ADD COLUMN IF NOT EXISTS inspection_type TEXT NOT NULL DEFAULT 'pre_trip';

ALTER TABLE driver_safety_checklists
    ADD CONSTRAINT driver_safety_checklists_inspection_type_check
    CHECK (inspection_type IN ('pre_trip', 'post_trip'));

-- Which vehicle was inspected. Nullable because existing rows have no answer
-- and inventing one would be worse than admitting it.
ALTER TABLE driver_safety_checklists
    ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL;

COMMENT ON COLUMN geofence_alerts.vehicle_id IS
    'The vehicle a defect belongs to. NULL for alerts that are about a driver or an order rather than a truck.';
