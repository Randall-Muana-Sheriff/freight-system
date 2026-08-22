-- Drops the learned points. Nothing is lost that cannot be re-learned, but
-- the next sweep pays the geocoder's throttle again from scratch.
DROP INDEX IF EXISTS idx_place_hints_unresolved;
DROP TABLE IF EXISTS place_hints;
