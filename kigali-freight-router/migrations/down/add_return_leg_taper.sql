ALTER TABLE pricing_rates DROP CONSTRAINT IF EXISTS pricing_rates_return_leg_band_check;
ALTER TABLE pricing_rates DROP COLUMN IF EXISTS return_leg_full_km;
