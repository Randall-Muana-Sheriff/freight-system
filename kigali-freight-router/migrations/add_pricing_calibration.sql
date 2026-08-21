-- Real rates, and the distance correction they depend on.
--
-- The opening card was invented. These come from what Kigali actually
-- charges and what a driver actually clears, gathered by ringing operators
-- for a defined job: 400 kg of general goods, Nyabugogo market to Kimironko.
-- The answers were 15,000-20,000 for a Piaggio Ape, 20,000-25,000 for a small
-- cargo van, 25,000-35,000 for a Toyota TownAce pickup. Against that,
-- drivers report taking home 20,000-35,000 a day over two or three van trips,
-- and 40,000-70,000 over roughly two light-truck trips.
--
-- The correction is the bigger change. ST_DistanceSphere returns straight-line
-- distance, and that same Nyabugogo-Kimironko job measures 8.38 km straight
-- while the route is about 14 km -- Kigali's hills and one-ways make the road
-- 1.67x the crow's flight. Every price the system has produced so far charged
-- for roughly 40% less distance than the driver covers, in both the per-km
-- line and the fuel. road_distance_factor is applied to the measured distance
-- before anything is charged on it.
--
-- 1.6 is one observed ratio, not a survey. It is defensible and much closer
-- than the 1.0 that was implicit before, and it is a column rather than a
-- constant so it can be refined as real jobs accumulate. A routing service
-- would replace it outright.
ALTER TABLE pricing_rates
    ADD COLUMN IF NOT EXISTS road_distance_factor NUMERIC(5,3) NOT NULL DEFAULT 1.600;

COMMENT ON COLUMN pricing_rates.road_distance_factor IS
    'Multiplier from straight-line distance to road distance. Kigali observed ~1.67 on one route; refine against real jobs.';

-- Superseding rows, not edits: a quote already given stays explainable and a
-- commission already taken can never be restated.
INSERT INTO pricing_rates (
    vehicle_class, base_fare_rwf, per_km_rwf, per_kg_rwf, minimum_fare_rwf,
    fuel_litres_per_100km, diesel_price_rwf_per_litre,
    platform_commission_pct, platform_minimum_fee_rwf, road_distance_factor, note
) VALUES
    -- Toyota TownAce / Suzuki Carry / Piaggio Ape. 10 L/100km is the TownAce;
    -- an Ape uses a third of that, but pricing the class on its thirstiest
    -- member is what keeps a TownAce driver willing to take the job.
    ('Light Van', 8000, 700, 8.0, 15000, 10.0, 2927, 15.0, 500, 1.600,
     'Calibrated Aug 2026 against Kigali quotes: 400kg Nyabugogo-Kimironko lands ~24,500, inside the 20,000-35,000 quoted range.'),

    -- Hyundai Porter / Mitsubishi Fuso 4-tonne.
    ('Medium Truck', 18000, 900, 6.0, 40000, 16.0, 2927, 15.0, 500, 1.600,
     'Calibrated Aug 2026: 3t over 10km straight lands ~58,000, inside the 40,000-80,000 quoted for a Kigali truck trip.'),

    -- Not really priceable this way. Heavy haulage is corporate contracts and
    -- cross-border lanes at 500,000 to 1,500,000 a trip, where fuel is bought
    -- in several countries and tolls, border fees and multi-day driver costs
    -- dominate. These numbers are a floor for a heavy job inside Kigali; a
    -- Dar es Salaam or Mombasa run needs quoting by hand.
    ('Heavy Hauler', 60000, 1500, 3.5, 120000, 30.0, 2927, 15.0, 500, 1.600,
     'Kigali-area heavy work only. Cross-border haulage must be quoted by hand -- see comment in migration.')
ON CONFLICT DO NOTHING;
