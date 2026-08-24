-- Standing pre/post-deploy checks against the live database.
--
--   bash deploy/prod-psql.sh -f deploy/prod-checks.sql
--
-- These are the questions that have actually mattered before a deploy, kept
-- here so they get asked the same way every time instead of being retyped
-- from memory at the moment they are most likely to be typed wrong.
--
-- Add to this list whenever a review turns up "we should have checked X" --
-- that is exactly what happened with pricing_rates below.

\echo ''
\echo '=== migrations applied ==='
SELECT id, applied_at
  FROM schema_migrations
 ORDER BY applied_at DESC
 LIMIT 8;

\echo ''
\echo '=== pricing_rates: does any card break the return-leg band constraint? ==='
-- add_return_leg_taper.sql backfills return_leg_full_km and then requires
-- full_km > beyond_km. The backfill is GREATEST(75, beyond + 50) so this
-- cannot fail any more, but the table is operator-editable through the rate
-- card supersede flow, so it is still worth seeing what is actually in it.
SELECT count(*)                                                  AS cards,
       max(return_leg_beyond_km)                                 AS max_beyond_km,
       max(return_leg_full_km)                                   AS max_full_km,
       count(*) FILTER (WHERE return_leg_full_km IS NOT NULL
                          AND return_leg_beyond_km IS NOT NULL
                          AND return_leg_full_km <= return_leg_beyond_km) AS inverted_band
  FROM pricing_rates;

\echo ''
\echo '=== drivers holding cash the platform has not been paid for ==='
-- The assignment gate blocks new work past MAX_DRIVER_CASH_OWED. Before a
-- deploy that touches the gate, check nobody is sitting near the limit --
-- shipping it would silently stop them being given jobs.
-- Mirrors cashOwedBy() in services/paymentService.js. Kept in step with it by
-- hand, which is a real cost -- but the alternative is an endpoint that
-- exposes every driver's balance, and this is read from an operator's laptop
-- a few times a month.
SELECT assigned_to                AS driver,
       count(*)                   AS unsettled_jobs,
       sum(platform_fee)          AS owed,
       max(currency)              AS currency,
       min(cash_collected_at)     AS oldest
  FROM orders
 WHERE payment_method = 'CASH'
   AND cash_settled_at IS NULL
   AND platform_fee IS NOT NULL
   AND platform_fee > 0
 GROUP BY assigned_to
 ORDER BY owed DESC
 LIMIT 10;

\echo ''
\echo '=== orders by status ==='
-- Production is fixtures only. A number here that looks like real demand
-- means something has changed and the assumption needs revisiting.
SELECT status, count(*)
  FROM orders
 GROUP BY status
 ORDER BY count(*) DESC;

\echo ''
\echo '=== the App Store review fixtures, which must never be deleted ==='
SELECT id, status, assigned_to
  FROM orders
 WHERE cargo_description LIKE '%App Store review%'
 ORDER BY id;
