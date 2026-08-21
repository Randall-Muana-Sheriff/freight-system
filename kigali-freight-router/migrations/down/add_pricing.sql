-- Drops the money columns and the rate card. Destructive in the sense that
-- every price already agreed with a customer is lost, which is why it is
-- only ever right on a database that has not taken a real booking.
ALTER TABLE orders
    DROP COLUMN IF EXISTS pricing_rate_id,
    DROP COLUMN IF EXISTS priced_vehicle_class,
    DROP COLUMN IF EXISTS quoted_total_rwf,
    DROP COLUMN IF EXISTS price_total_rwf,
    DROP COLUMN IF EXISTS price_fuel_rwf,
    DROP COLUMN IF EXISTS price_service_rwf,
    DROP COLUMN IF EXISTS platform_fee_rwf,
    DROP COLUMN IF EXISTS driver_net_rwf,
    DROP COLUMN IF EXISTS price_distance_km,
    DROP COLUMN IF EXISTS price_is_estimate,
    DROP COLUMN IF EXISTS price_override_reason;

DROP INDEX IF EXISTS idx_pricing_rates_lookup;
DROP TABLE IF EXISTS pricing_rates;
