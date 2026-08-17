-- Multi-stop runs.
--
-- Until now the unit of work was one order = one pickup + one delivery, and
-- a driver holding five jobs held five unrelated cards in whatever order
-- the query returned them. A run is the thing a driver actually does: one
-- vehicle, one sequence of stops, several orders.
--
-- What was here before this is not that. `delivery_stops` holds free
-- points with no link to any order, and `completed_routes` stores a
-- 'SNAPSHOT' row with a hardcoded vehicle and zero distance — a line drawn
-- on the dispatcher's map that no driver ever sees. Both stay for now so
-- the old panel keeps working while this replaces it; add_trips_retire_legacy_stops.sql
-- removes them once nothing reads them.

CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    -- SET NULL rather than CASCADE: a run that happened is a record of work
    -- done, and deleting a driver should not delete the history of it.
    driver_username TEXT REFERENCES users(username) ON DELETE SET NULL,
    vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    -- What the optimiser predicted, kept so the plan can be compared with
    -- what actually happened rather than silently overwritten by it.
    planned_distance_m INTEGER,
    planned_duration_s INTEGER,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_stops (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- Typed rather than assuming depot-then-drops. A run that collects from
    -- three shippers and delivers to two receivers is ordinary freight, and
    -- a model that cannot express it forces dispatchers to lie to it.
    kind TEXT NOT NULL CHECK (kind IN ('PICKUP', 'DROP')),
    sequence INTEGER NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    address_text TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ARRIVED', 'DONE', 'FAILED', 'SKIPPED')),
    -- Required by the API when a stop ends FAILED or SKIPPED: "nobody at the
    -- gate" is the difference between a retry tomorrow and a refund, and
    -- without it a failed stop is indistinguishable from a lazy one.
    failure_reason TEXT,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT trip_stops_sequence_unique UNIQUE (trip_id, sequence)
        DEFERRABLE INITIALLY DEFERRED
);

-- Re-sequencing a run swaps positions inside one transaction, which trips a
-- non-deferrable unique constraint halfway through even though the end
-- state is valid. Hence DEFERRABLE above.

-- An order cannot sit on two live runs at once — that would have two
-- drivers turning up for the same cargo. Only open stops are constrained,
-- so a failed attempt can legitimately be re-planned onto a later run.
CREATE UNIQUE INDEX IF NOT EXISTS trip_stops_one_open_per_order_kind
    ON trip_stops (order_id, kind)
    WHERE status IN ('PENDING', 'ARRIVED');

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip ON trip_stops (trip_id, sequence);
CREATE INDEX IF NOT EXISTS idx_trip_stops_order ON trip_stops (order_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_status ON trips (driver_username, status);

-- One active run per driver. A driver cannot be doing two sequences at
-- once, and letting dispatch create that state produces a driver app that
-- has to guess which run to show.
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_per_driver
    ON trips (driver_username)
    WHERE status = 'ACTIVE';
