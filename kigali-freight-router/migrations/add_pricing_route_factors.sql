-- Three costs a driver carries that the card was making them absorb.
--
-- 1. THE EMPTY RETURN LEG. A delivery outside Kigali means driving back with
--    nothing to carry, and the fuel for that is real. Operators reportedly
--    charge 20-40% more for one-way upcountry work to cover it. Charging the
--    whole empty leg comes to 50%, so the market plainly does not recover all
--    of it -- which is the same fact behind drivers calling dry days their
--    biggest problem and drivers with a return load making twice as much.
--    return_leg_share_pct charges 70% of it, landing at ~35% and inside the
--    band operators quote. The 30% left is precisely what a matched return
--    load would cover, which is the thing this platform exists to find, so
--    the day it can backfill a lane this number should fall further. Inside
--    the city none of it applies: a driver finishing in Kimironko picks up
--    the next job there.
--
-- 2. TERRAIN. Routes north and south of Kigali climb, and mountainous driving
--    is documented at 20-30% more fuel than flat highway. 1.20 is the bottom
--    of that band, chosen because Rwanda's trunk roads are engineered rather
--    than forest tracks, and it applies only to the stretch beyond the city --
--    the flat run across Kigali should not be charged for hills it never
--    climbs.
--
-- 3. LOADING DETENTION. Waiting at a warehouse is unpaid time on a job that is
--    priced by distance, and drivers charge for it past about an hour. The
--    hourly figures are derived, not invented: from what drivers report
--    clearing in a day over the nine-hour day Kigali hire listings quote.
--
-- The long-distance per-km rate comes out of the same arithmetic. Beyond the
-- city, fuel is charged on its own line, so the per-km rate only has to cover
-- the driver's time and wear -- their hourly rate over a 60km/h highway
-- average. That is why it is a fraction of the city rate: the city rate is
-- carrying stop-start fuel burn and short-job overhead that a highway km does
-- not have. Charging the city rate for 132km of open road was what put a
-- Kigali-Rubavu run 30% above what anyone in Rwanda actually pays for it.
ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS per_km_long_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS taper_after_km NUMERIC(8,2) NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS return_leg_beyond_km NUMERIC(8,2) NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS terrain_fuel_factor NUMERIC(5,3) NOT NULL DEFAULT 1.200,
    ADD COLUMN IF NOT EXISTS detention_free_minutes INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS detention_per_hour_rwf NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS return_leg_share_pct NUMERIC(5,2) NOT NULL DEFAULT 70;

COMMENT ON COLUMN pricing_rates.return_leg_share_pct IS
    'Share of the empty-return fuel actually charged. 70 puts the uplift at ~35%, inside the 20-40% operators charge; the rest is what a return load would cover.';

COMMENT ON COLUMN pricing_rates.per_km_long_rwf IS
    'Per-km beyond taper_after_km. Covers driver time and wear only, since fuel is its own line. NULL falls back to per_km_rwf.';
COMMENT ON COLUMN pricing_rates.return_leg_beyond_km IS
    'Past this one-way road distance the driver returns empty and the return fuel is charged. 25km is roughly the longest trip across Kigali.';
COMMENT ON COLUMN pricing_rates.terrain_fuel_factor IS
    'Fuel multiplier on the stretch beyond the city. 1.20 is the low end of the documented 20-30% penalty for mountainous driving.';

INSERT INTO pricing_rates (
    vehicle_class, base_fare_rwf, per_km_rwf, per_kg_rwf, minimum_fare_rwf,
    fuel_litres_per_100km, diesel_price_rwf_per_litre,
    platform_commission_pct, platform_minimum_fee_rwf, road_distance_factor,
    per_km_long_rwf, taper_after_km, return_leg_beyond_km, terrain_fuel_factor,
    detention_free_minutes, detention_per_hour_rwf, return_leg_share_pct, note
) VALUES
    -- 34,000/day over 9 hours is 3,778/hour; at 60km/h that is 63/km, rounded
    -- to 80 for tyre and service wear.
    ('Light Van', 8000, 700, 8.0, 15000, 10.0, 2927, 15.0, 500, 1.600,
     80, 25, 25, 1.200, 60, 3800, 70,
     'Aug 2026. Kigali unchanged at ~24,500 for 400kg Nyabugogo-Kimironko; long runs now taper and carry the empty return.'),

    -- 76,500/day is 8,500/hour, 142/km at highway speed, rounded to 160.
    ('Medium Truck', 18000, 900, 6.0, 40000, 16.0, 2927, 15.0, 500, 1.600,
     160, 25, 25, 1.200, 60, 8500, 70,
     'Aug 2026. Kigali unchanged at ~58,000 for 3t/10km; 4t to Rubavu lands ~232,000 against a quoted 150,000-250,000 for a full load.'),

    -- 175,000/day is 19,444/hour, 324/km, rounded to 350.
    ('Heavy Hauler', 60000, 1500, 3.5, 120000, 30.0, 2927, 15.0, 500, 1.600,
     350, 25, 25, 1.200, 60, 19400, 70,
     'Aug 2026. Kigali-area heavy work only; cross-border haulage still needs quoting by hand.')
ON CONFLICT DO NOTHING;
