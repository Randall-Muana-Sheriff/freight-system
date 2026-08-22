// The one place that reads the rate card. Kept apart from pricingService.js
// so the arithmetic there stays pure and testable without a database.
import pool from '../config/db.js';

// The market this deployment serves. One country per deployment for now --
// every rate card, corridor and order here belongs to it. When a second
// market arrives this stops being a constant and starts coming from the
// booking, but making that call before there is a second market would be
// guessing at how it should be chosen.
const DEFAULT_COUNTRY = process.env.MARKET_COUNTRY_CODE || 'RW';
import { SpatialService } from './spatialService.js';
import { quote, classForWeight, detentionCharge, PricingError } from './pricingService.js';

// The newest card for a class. Rows are insert-only, so "current" is the
// latest effective_from rather than a mutable flag nobody remembers to move.
export async function currentRateFor(vehicleClass, countryCode = 'RW') {
    const { rows } = await pool.query(
        `SELECT * FROM pricing_rates
          WHERE vehicle_class = $1 AND country_code = $2 AND effective_from <= NOW()
          ORDER BY effective_from DESC, id DESC
          LIMIT 1`,
        [vehicleClass, countryCode]
    );
    return rows[0] || null;
}

export async function listCurrentRates(countryCode = DEFAULT_COUNTRY) {
    const { rows } = await pool.query(
        `SELECT DISTINCT ON (vehicle_class) *
           FROM pricing_rates
          WHERE effective_from <= NOW() AND country_code = $1
          ORDER BY vehicle_class, effective_from DESC, id DESC`,
        [countryCode]
    );
    return rows;
}

// The single entry point both order-creation paths use, so a price can only
// ever be produced one way.
//
// distanceKm is optional and normally absent on a public booking, which
// captures addresses as free text and has no coordinates until a dispatcher
// places the order. The returned breakdown says which it was.
export async function priceJob({ weightKg, distanceKm = null, pickup = null, delivery = null, countryCode = DEFAULT_COUNTRY }) {
    const vehicleClass = classForWeight(weightKg);
    const rate = await currentRateFor(vehicleClass, countryCode);
    if (!rate) throw new PricingError(`No rate card for ${vehicleClass} in ${countryCode}.`);

    // Only worth looking up once there are two points and enough distance for
    // terrain to be charged at all -- inside the city none of it applies.
    let terrainFactor = null;
    if (pickup && delivery && distanceKm != null) {
        const roadKm = distanceKm * Number(rate.road_distance_factor ?? 1);
        const corridor = await corridorFor(pickup, delivery, roadKm, rate.country_code || 'RW');
        if (corridor) terrainFactor = corridor.terrainFactor;
    }

    return quote(rate, { weightKg, distanceKm, terrainFactor });
}

// Straight-line pickup-to-delivery distance, via the same PostGIS call the
// rest of the system uses for distance rather than a second implementation
// that could disagree with it. Straight-line, not routed: the quote is an
// agreed price, not a promise about which roads get taken.
export async function distanceKmBetween(pickup, delivery) {
    if (!pickup || !delivery) return null;
    const metres = await SpatialService.calculateDistance(pickup.lng, pickup.lat, delivery.lng, delivery.lat);
    return Number.isFinite(metres) ? metres / 1000 : null;
}

// Which corridor a route runs through, and what its terrain costs.
//
// Scoped to a market. Corridors match on bearing, and a bearing is not unique
// to a country -- eastbound out of Accra is not the Akagera plain, and without
// this a Ghanaian route would be handed Rwanda's flat-terrain discount for a
// basin two thousand kilometres away.
//
// Bearing comes from PostGIS rather than a hand-rolled great-circle formula --
// ST_Azimuth is the same maths the rest of the system's spatial work uses, and
// there is no reason to have two implementations that could disagree.
//
// Narrowest match wins: a distance-limited corridor is a slice of a direction
// that is otherwise something else, so Bugesera has to be tried before the
// wider southern sweep it sits inside. Returns null when no corridor matches,
// which means the rate card's own factor applies -- climbing, the safe default
// in a country this hilly.
export async function corridorFor(pickup, delivery, roadDistanceKm, countryCode = 'RW') {
    if (!pickup || !delivery) return null;

    const { rows } = await pool.query(
        `WITH route AS (
             SELECT degrees(ST_Azimuth(
                 ST_SetSRID(ST_MakePoint($1, $2), 4326),
                 ST_SetSRID(ST_MakePoint($3, $4), 4326)
             )) AS bearing
         )
         SELECT c.name, c.terrain_fuel_factor, route.bearing
           FROM route_corridors c, route
          WHERE c.country_code = $6
            AND route.bearing >= c.bearing_from_deg
            AND route.bearing <  c.bearing_to_deg
            AND (c.max_distance_km IS NULL OR $5 <= c.max_distance_km)
          ORDER BY c.max_distance_km NULLS LAST
          LIMIT 1`,
        [pickup.lng, pickup.lat, delivery.lng, delivery.lat, roadDistanceKm, countryCode]
    );

    const row = rows[0];
    return row ? { name: row.name, terrainFactor: Number(row.terrain_fuel_factor), bearingDeg: Number(row.bearing) } : null;
}

// How long a driver was held at one end of the job, and what that is worth.
//
// Both ends work the same way once the arrival event exists: the wait is the
// gap between the arrival status and now. ARRIVED-to-DELIVERED needed nothing
// new because both statuses already existed; AT_PICKUP had to be added,
// because ASSIGNED-to-PICKED_UP contains the drive to the pickup as well as
// the wait there and no arithmetic separates the two.
//
// The wait is the gap between the ARRIVED and DELIVERED entries in
// order_status_logs, which has stamped every transition since the original
// schema -- so this needs nothing recorded that was not already there. The
// latest ARRIVED is used rather than the first: a driver who arrives, is
// turned away and comes back has not been waiting the whole time in between.
//
// Priced against the same rate card the job was quoted on, not today's, so a
// card superseded mid-shift cannot change what a completed job pays.
export async function detentionForOrder(client, orderId, { arrivalStatus = 'ARRIVED' } = {}) {
    const { rows } = await client.query(
        `WITH arrived AS (
             SELECT MAX(changed_at) AS at FROM order_status_logs
              WHERE order_id = $1 AND new_status = $2
         )
         SELECT EXTRACT(EPOCH FROM (NOW() - arrived.at)) / 60 AS waited_minutes,
                o.pricing_rate_id
           FROM orders o, arrived
          WHERE o.id = $1 AND arrived.at IS NOT NULL`,
        [orderId, arrivalStatus]
    );

    const row = rows[0];
    // No ARRIVED at all means the driver went straight to delivered, which is
    // a job with no recorded wait rather than a job with a zero one.
    if (!row || row.waited_minutes == null) return null;

    const waited = Math.max(0, Math.round(Number(row.waited_minutes)));
    if (!row.pricing_rate_id) return { waitedMinutes: waited, detentionAmount: 0, chargeableMinutes: 0 };

    const rateResult = await client.query('SELECT * FROM pricing_rates WHERE id = $1', [row.pricing_rate_id]);
    const rate = rateResult.rows[0];
    if (!rate) return { waitedMinutes: waited, detentionAmount: 0, chargeableMinutes: 0 };

    return detentionCharge(rate, waited);
}

// How near another job's collection has to be to this one's drop before the
// run home counts as loaded rather than empty. Generous on purpose: a driver
// dropping in Rubavu town and collecting from an depot ten minutes outside it
// has still not driven home empty, and pretending otherwise keeps a charge
// that the customer plainly did not incur.
const BACKFILL_RADIUS_KM = 15;

// Did anything fill the return leg?
//
// Answered from trip_stops rather than from guesswork: another order on the
// same run, collecting within BACKFILL_RADIUS_KM of where this one was
// dropped. That is what a loaded return actually looks like in the data.
//
// Only asked of orders that were charged for an empty return in the first
// place -- an inside-Kigali job never was, so it has nothing to give back.
export async function backfillCreditForOrder(client, orderId) {
    const { rows } = await client.query(
        `WITH this_order AS (
             SELECT o.id, o.return_leg_amount, ts.trip_id,
                    ST_SetSRID(ST_MakePoint(o.delivery_lng, o.delivery_lat), 4326) AS drop_point
               FROM orders o
               JOIN trip_stops ts ON ts.order_id = o.id AND ts.kind = 'DROP'
               -- The run has to have actually happened. A planned pairing
               -- that was never driven filled nothing, and crediting it would
               -- refund a customer for an empty leg the driver still drove.
               JOIN trips t ON t.id = ts.trip_id AND t.status IN ('ACTIVE', 'COMPLETED')
              WHERE o.id = $1
                AND o.return_leg_amount IS NOT NULL
                AND o.return_leg_amount > 0
                AND o.delivery_lat IS NOT NULL
              LIMIT 1
         )
         SELECT other.order_id AS filled_by,
                ST_DistanceSphere(other_point.geom, this_order.drop_point) / 1000 AS km_apart,
                this_order.return_leg_amount
           FROM this_order
           JOIN trip_stops other
             ON other.trip_id = this_order.trip_id
            AND other.kind = 'PICKUP'
            AND other.order_id <> this_order.id
           JOIN LATERAL (
                SELECT ST_SetSRID(ST_MakePoint(other.lng, other.lat), 4326) AS geom
           ) other_point ON other.lat IS NOT NULL
          WHERE ST_DistanceSphere(other_point.geom, this_order.drop_point) / 1000 <= $2
          ORDER BY 2 ASC
          LIMIT 1`,
        [orderId, BACKFILL_RADIUS_KM]
    );

    const row = rows[0];
    if (!row) return null;
    return {
        filledByOrderId: row.filled_by,
        kmApart: Number(Number(row.km_apart).toFixed(2)),
        creditAmount: Math.round(Number(row.return_leg_amount)),
    };
}

// Candidate pairings for a job that is about to run empty on the way home.
// Read-only and for dispatch: the credit above only ever fires on a pairing
// that actually happened, and a pairing only happens if somebody makes it.
export async function returnLoadCandidatesFor(orderId, { withinKm = BACKFILL_RADIUS_KM, withinHours = 24 } = {}) {
    const { rows } = await pool.query(
        `WITH this_order AS (
             SELECT id,
                    ST_SetSRID(ST_MakePoint(delivery_lng, delivery_lat), 4326) AS drop_point,
                    ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326) AS origin_point
               FROM orders
              WHERE id = $1 AND delivery_lat IS NOT NULL AND pickup_lat IS NOT NULL
         )
         SELECT c.id, c.cargo_description, c.weight_kg, c.status, c.needed_by,
                ST_DistanceSphere(c.pickup_geom, t.drop_point) / 1000 AS collect_km_from_drop,
                ST_DistanceSphere(c.delivery_geom, t.origin_point) / 1000 AS deliver_km_from_origin
           FROM orders c, this_order t
          WHERE c.id <> t.id
            AND c.status IN ('PENDING', 'ASSIGNED')
            AND c.pickup_lat IS NOT NULL
            AND ST_DistanceSphere(c.pickup_geom, t.drop_point) / 1000 <= $2
            AND c.created_at >= NOW() - ($3 || ' hours')::interval
          ORDER BY 6 ASC
          LIMIT 5`,
        [orderId, withinKm, String(withinHours)]
    );
    return rows.map((r) => ({
        orderId: r.id,
        cargo: r.cargo_description,
        weightKg: Number(r.weight_kg),
        status: r.status,
        neededBy: r.needed_by,
        collectKmFromDrop: Number(Number(r.collect_km_from_drop).toFixed(1)),
        deliverKmFromOrigin: Number(Number(r.deliver_km_from_origin).toFixed(1)),
    }));
}
