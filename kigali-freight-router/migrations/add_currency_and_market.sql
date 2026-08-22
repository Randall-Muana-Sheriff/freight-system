-- Take Rwanda out of the column names, and give the system a currency.
--
-- Every money column was named for the franc -- price_total_rwf,
-- driver_net_rwf, base_fare_rwf, nineteen of them. That was fine while there
-- was one country. It stops being fine the moment a Ghanaian order stores
-- cedis in a column called _rwf, which is a field that lies to everyone who
-- reads it, including the next person writing a report against it.
--
-- Done now because production holds three priced orders and nine rate cards.
-- The same rename after two markets of real order history is a data migration
-- with money in it, and those get done at two in the morning with a backup
-- open. Renaming a column is cheap exactly once.
--
-- Three things are added along with the rename:
--
--   currency        -- which money these figures are in. A card and the orders
--                      quoted from it carry it, so Rwanda and Ghana can hold
--                      rates side by side and no total is ambiguous.
--
--   currency_minor_units -- how many decimal places the money actually has.
--                      RWF has none: rounding a fare to whole francs is
--                      correct. Cedis have pesewas and shillings have cents,
--                      and rounding those to whole units quietly overcharges
--                      or underpays on every single job.
--
--   country_code    -- which market a rate card and a road corridor belong to.
--                      Without it the corridor table is a trap: it matches on
--                      bearing alone, so a route in Accra heading east would
--                      match "Eastern plain" and be given Rwanda's flat-
--                      terrain discount for the Akagera basin.

ALTER TABLE pricing_rates RENAME COLUMN base_fare_rwf TO base_fare;
ALTER TABLE pricing_rates RENAME COLUMN per_km_rwf TO per_km;
ALTER TABLE pricing_rates RENAME COLUMN per_km_long_rwf TO per_km_long;
ALTER TABLE pricing_rates RENAME COLUMN per_kg_rwf TO per_kg;
ALTER TABLE pricing_rates RENAME COLUMN minimum_fare_rwf TO minimum_fare;
ALTER TABLE pricing_rates RENAME COLUMN diesel_price_rwf_per_litre TO fuel_price_per_litre;
ALTER TABLE pricing_rates RENAME COLUMN platform_minimum_fee_rwf TO platform_minimum_fee;
ALTER TABLE pricing_rates RENAME COLUMN detention_per_hour_rwf TO detention_per_hour;

ALTER TABLE orders RENAME COLUMN quoted_total_rwf TO quoted_total;
ALTER TABLE orders RENAME COLUMN price_total_rwf TO price_total;
ALTER TABLE orders RENAME COLUMN price_fuel_rwf TO price_fuel;
ALTER TABLE orders RENAME COLUMN price_service_rwf TO price_service;
ALTER TABLE orders RENAME COLUMN platform_fee_rwf TO platform_fee;
ALTER TABLE orders RENAME COLUMN driver_net_rwf TO driver_net;
ALTER TABLE orders RENAME COLUMN detention_rwf TO detention_amount;
ALTER TABLE orders RENAME COLUMN pickup_detention_rwf TO pickup_detention_amount;
ALTER TABLE orders RENAME COLUMN dropoff_detention_rwf TO dropoff_detention_amount;
ALTER TABLE orders RENAME COLUMN return_leg_rwf TO return_leg_amount;
ALTER TABLE orders RENAME COLUMN backfill_credit_rwf TO backfill_credit;

ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RWF',
    ADD COLUMN IF NOT EXISTS currency_minor_units SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'RW';

-- Stamped on the order, not looked up through the rate card. A card can be
-- superseded and a country could in principle change currency; what a customer
-- was quoted in cannot be allowed to move afterwards.
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE orders SET currency = 'RWF' WHERE currency IS NULL AND price_total IS NOT NULL;

ALTER TABLE route_corridors
    ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'RW';

CREATE INDEX IF NOT EXISTS idx_pricing_rates_market
    ON pricing_rates (country_code, vehicle_class, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_route_corridors_country
    ON route_corridors (country_code);

COMMENT ON COLUMN pricing_rates.currency_minor_units IS
    'Decimal places the currency actually has. 0 for RWF, 2 for GHS or KES. Rounding a fare to whole units is right in Kigali and wrong in Accra.';
COMMENT ON COLUMN route_corridors.country_code IS
    'Corridors match on bearing, which is not unique to a country -- eastbound out of Accra is not the Akagera plain.';
