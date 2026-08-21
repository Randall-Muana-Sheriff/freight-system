-- Removes the route factors and the rows that use them. Prices already agreed
-- keep their stored figures; only the ability to re-derive them is lost.
DELETE FROM pricing_rates WHERE note LIKE 'Aug 2026.%';
ALTER TABLE pricing_rates
    DROP COLUMN IF EXISTS per_km_long_rwf,
    DROP COLUMN IF EXISTS taper_after_km,
    DROP COLUMN IF EXISTS return_leg_beyond_km,
    DROP COLUMN IF EXISTS terrain_fuel_factor,
    DROP COLUMN IF EXISTS detention_free_minutes,
    DROP COLUMN IF EXISTS detention_per_hour_rwf,
    DROP COLUMN IF EXISTS return_leg_share_pct;
