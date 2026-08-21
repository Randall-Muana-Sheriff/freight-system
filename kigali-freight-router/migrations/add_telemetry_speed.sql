-- Records the speed the device actually reported with each position fix.
--
-- The column is nullable on purpose, and that is the point of this
-- migration. Until now the speed attached to every ping was
-- Math.random() * 45 + 40 — the app has always sent a real, noise-filtered
-- speedKmh, and the socket handler discarded it and invented a number
-- between 40 and 85. That fabricated value was written to the live map and
-- compared against geofence speed limits, so drivers could be recorded as
-- speeding on the strength of a random number.
--
-- A fix whose speed is genuinely unknown must therefore be storable as
-- unknown rather than as a plausible-looking invention. NULL means "the
-- device did not report a speed for this fix", which is a fact, and is what
-- any later analysis of this trail needs to be able to see.
ALTER TABLE driver_location_history
    ADD COLUMN IF NOT EXISTS speed_kmh DOUBLE PRECISION;

COMMENT ON COLUMN driver_location_history.speed_kmh IS
    'Device-reported ground speed in km/h at this fix. NULL when the device did not supply one — never a substituted or estimated value.';
