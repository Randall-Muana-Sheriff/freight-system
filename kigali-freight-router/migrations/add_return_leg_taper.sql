-- Where the empty-return charge reaches its full share.
--
-- The charge recovers a real cost: past the city a driver comes home with
-- nothing to carry and burns fuel doing it. But it was applied as a switch --
-- nothing at 25.00 km, the full 70% share at 25.01 -- so two deliveries on
-- opposite sides of one street differed by 5,132 RWF. Ten metres of road.
--
-- The switch was modelling the wrong thing. Whether a driver comes back empty
-- is not a fact that changes at a line on the map; it is a probability that
-- falls away with distance from the freight market, and Kigali is that market
-- for almost all of Rwanda.
--
-- Inside the city a driver picks up the next job where they finished. Out
-- through the satellite belt -- Nyamata, Kamonyi, Rwamagana, Muhanga, all
-- roughly 30 to 50 km -- there is real two-way traffic feeding Kigali daily,
-- so a return load is plausible but not dependable. Past about 75 km the
-- towns move one or two freight loads a day rather than a continuous flow:
-- produce does come back from Musanze and Rubavu, but it cannot be matched to
-- the hour a van happens to be free, and a driver cannot wait until tomorrow.
-- It is the timing that fails out there, not the existence of cargo.
--
-- So: nothing below return_leg_beyond_km, the full share at or beyond
-- return_leg_full_km, and a straight line between them.
--
-- A straight line rather than a curve on purpose. This rate card is published
-- on the public site, and a rule a customer cannot predict is a rule that
-- cannot honestly be published. Over the band that matters the difference
-- from a truer curve is small and favours neither side.
--
-- 75 km is the default and not a law. Per card, because a Heavy Hauler works
-- different lanes from a Light Van, and because the operator will know better
-- than this comment once there is a season of real backload data.
ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS return_leg_full_km NUMERIC(10, 2);

UPDATE pricing_rates
   SET return_leg_full_km = 75.00
 WHERE return_leg_full_km IS NULL
   AND return_leg_beyond_km IS NOT NULL;

-- The ramp needs somewhere to ramp to. A full point at or below the start
-- would restore the cliff it exists to remove.
DO $$ BEGIN
    ALTER TABLE pricing_rates ADD CONSTRAINT pricing_rates_return_leg_band_check
        CHECK (return_leg_full_km IS NULL
               OR return_leg_beyond_km IS NULL
               OR return_leg_full_km > return_leg_beyond_km);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
