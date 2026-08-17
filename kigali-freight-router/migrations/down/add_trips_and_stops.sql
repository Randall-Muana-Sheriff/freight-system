-- Reverses add_trips_and_stops.sql. Drops the runs themselves, not the
-- orders on them: an order's own status lifecycle predates this feature
-- and survives without it.
DROP INDEX IF EXISTS trips_one_active_per_driver;
DROP INDEX IF EXISTS trip_stops_one_open_per_order_kind;
DROP TABLE IF EXISTS trip_stops;
DROP TABLE IF EXISTS trips;
