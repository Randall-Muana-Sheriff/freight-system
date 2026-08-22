-- Puts the franc back in the column names. Only safe while RWF is the only
-- currency in the data: any row holding another one becomes mislabelled
-- rather than merely awkward.
DROP INDEX IF EXISTS idx_route_corridors_country;
DROP INDEX IF EXISTS idx_pricing_rates_market;

ALTER TABLE route_corridors DROP COLUMN IF EXISTS country_code;
ALTER TABLE orders DROP COLUMN IF EXISTS currency;
ALTER TABLE pricing_rates
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS currency_minor_units,
    DROP COLUMN IF EXISTS country_code;

ALTER TABLE orders RENAME COLUMN backfill_credit TO backfill_credit_rwf;
ALTER TABLE orders RENAME COLUMN return_leg_amount TO return_leg_rwf;
ALTER TABLE orders RENAME COLUMN dropoff_detention_amount TO dropoff_detention_rwf;
ALTER TABLE orders RENAME COLUMN pickup_detention_amount TO pickup_detention_rwf;
ALTER TABLE orders RENAME COLUMN detention_amount TO detention_rwf;
ALTER TABLE orders RENAME COLUMN driver_net TO driver_net_rwf;
ALTER TABLE orders RENAME COLUMN platform_fee TO platform_fee_rwf;
ALTER TABLE orders RENAME COLUMN price_service TO price_service_rwf;
ALTER TABLE orders RENAME COLUMN price_fuel TO price_fuel_rwf;
ALTER TABLE orders RENAME COLUMN price_total TO price_total_rwf;
ALTER TABLE orders RENAME COLUMN quoted_total TO quoted_total_rwf;

ALTER TABLE pricing_rates RENAME COLUMN detention_per_hour TO detention_per_hour_rwf;
ALTER TABLE pricing_rates RENAME COLUMN platform_minimum_fee TO platform_minimum_fee_rwf;
ALTER TABLE pricing_rates RENAME COLUMN fuel_price_per_litre TO diesel_price_rwf_per_litre;
ALTER TABLE pricing_rates RENAME COLUMN minimum_fare TO minimum_fare_rwf;
ALTER TABLE pricing_rates RENAME COLUMN per_kg TO per_kg_rwf;
ALTER TABLE pricing_rates RENAME COLUMN per_km_long TO per_km_long_rwf;
ALTER TABLE pricing_rates RENAME COLUMN per_km TO per_km_rwf;
ALTER TABLE pricing_rates RENAME COLUMN base_fare TO base_fare_rwf;
