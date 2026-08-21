-- Removes the calibrated rows and the distance correction. Prices already
-- agreed against these rows keep their stored figures; only the ability to
-- explain them from the card is lost.
DELETE FROM pricing_rates WHERE note LIKE 'Calibrated Aug 2026%' OR note LIKE 'Kigali-area heavy work only%';
ALTER TABLE pricing_rates DROP COLUMN IF EXISTS road_distance_factor;
