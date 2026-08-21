-- Every route goes back to paying the rate card's terrain factor, which
-- overcharges eastbound work rather than undercharging anything.
DROP INDEX IF EXISTS idx_route_corridors_lookup;
DROP TABLE IF EXISTS route_corridors;
