-- Let a delivery confirmation say "not checked" instead of "not flagged".
--
-- location_flagged was BOOLEAN NOT NULL DEFAULT FALSE, and confirmDelivery
-- only ran the proximity check when the order had delivery coordinates and
-- the driver had a known position. When either was missing the check was
-- skipped and the row was still written FALSE — so a delivery nobody could
-- verify was recorded as one that had been verified and passed.
--
-- Two states cannot carry three facts. NULL now means "no reference point,
-- so nothing was checked", which is the honest answer and the one an audit
-- needs. TRUE and FALSE keep exactly the meaning they always had.
ALTER TABLE delivery_confirmations ALTER COLUMN location_flagged DROP NOT NULL;
ALTER TABLE delivery_confirmations ALTER COLUMN location_flagged DROP DEFAULT;

-- Correcting the existing false assertions, not backfilling an opinion.
--
-- distance_from_target_m is written if and only if the check actually ran, so
-- a NULL distance is precisely the set of rows that were never checked. Those
-- rows currently claim FALSE — "we looked and it was fine" — which is untrue.
-- Setting them NULL removes a claim rather than making one, which is why this
-- is safe to do to history: nothing that was known is being discarded.
UPDATE delivery_confirmations
   SET location_flagged = NULL
 WHERE distance_from_target_m IS NULL;
