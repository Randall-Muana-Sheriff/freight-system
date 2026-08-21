// The one place that reads the rate card. Kept apart from pricingService.js
// so the arithmetic there stays pure and testable without a database.
import pool from '../config/db.js';
import { SpatialService } from './spatialService.js';
import { quote, classForWeight, detentionCharge, PricingError } from './pricingService.js';

// The newest card for a class. Rows are insert-only, so "current" is the
// latest effective_from rather than a mutable flag nobody remembers to move.
export async function currentRateFor(vehicleClass) {
    const { rows } = await pool.query(
        `SELECT * FROM pricing_rates
          WHERE vehicle_class = $1 AND effective_from <= NOW()
          ORDER BY effective_from DESC, id DESC
          LIMIT 1`,
        [vehicleClass]
    );
    return rows[0] || null;
}

export async function listCurrentRates() {
    const { rows } = await pool.query(
        `SELECT DISTINCT ON (vehicle_class) *
           FROM pricing_rates
          WHERE effective_from <= NOW()
          ORDER BY vehicle_class, effective_from DESC, id DESC`
    );
    return rows;
}

// The single entry point both order-creation paths use, so a price can only
// ever be produced one way.
//
// distanceKm is optional and normally absent on a public booking, which
// captures addresses as free text and has no coordinates until a dispatcher
// places the order. The returned breakdown says which it was.
export async function priceJob({ weightKg, distanceKm = null, pickup = null, delivery = null }) {
    const vehicleClass = classForWeight(weightKg);
    const rate = await currentRateFor(vehicleClass);
    if (!rate) throw new PricingError(`No rate card for ${vehicleClass}.`);

    // Only worth looking up once there are two points and enough distance for
    // terrain to be charged at all -- inside the city none of it applies.
    let terrainFactor = null;
    if (pickup && delivery && distanceKm != null) {
        const roadKm = distanceKm * Number(rate.road_distance_factor ?? 1);
        const corridor = await corridorFor(pickup, delivery, roadKm);
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
// Bearing comes from PostGIS rather than a hand-rolled great-circle formula --
// ST_Azimuth is the same maths the rest of the system's spatial work uses, and
// there is no reason to have two implementations that could disagree.
//
// Narrowest match wins: a distance-limited corridor is a slice of a direction
// that is otherwise something else, so Bugesera has to be tried before the
// wider southern sweep it sits inside. Returns null when no corridor matches,
// which means the rate card's own factor applies -- climbing, the safe default
// in a country this hilly.
export async function corridorFor(pickup, delivery, roadDistanceKm) {
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
          WHERE route.bearing >= c.bearing_from_deg
            AND route.bearing <  c.bearing_to_deg
            AND (c.max_distance_km IS NULL OR $5 <= c.max_distance_km)
          ORDER BY c.max_distance_km NULLS LAST
          LIMIT 1`,
        [pickup.lng, pickup.lat, delivery.lng, delivery.lat, roadDistanceKm]
    );

    const row = rows[0];
    return row ? { name: row.name, terrainFactor: Number(row.terrain_fuel_factor), bearingDeg: Number(row.bearing) } : null;
}

// How long a driver was held at the drop, and what that is worth.
//
// The wait is the gap between the ARRIVED and DELIVERED entries in
// order_status_logs, which has stamped every transition since the original
// schema -- so this needs nothing recorded that was not already there. The
// latest ARRIVED is used rather than the first: a driver who arrives, is
// turned away and comes back has not been waiting the whole time in between.
//
// Priced against the same rate card the job was quoted on, not today's, so a
// card superseded mid-shift cannot change what a completed job pays.
export async function detentionForOrder(client, orderId) {
    const { rows } = await client.query(
        `WITH arrived AS (
             SELECT MAX(changed_at) AS at FROM order_status_logs
              WHERE order_id = $1 AND new_status = 'ARRIVED'
         )
         SELECT EXTRACT(EPOCH FROM (NOW() - arrived.at)) / 60 AS waited_minutes,
                o.pricing_rate_id
           FROM orders o, arrived
          WHERE o.id = $1 AND arrived.at IS NOT NULL`,
        [orderId]
    );

    const row = rows[0];
    // No ARRIVED at all means the driver went straight to delivered, which is
    // a job with no recorded wait rather than a job with a zero one.
    if (!row || row.waited_minutes == null) return null;

    const waited = Math.max(0, Math.round(Number(row.waited_minutes)));
    if (!row.pricing_rate_id) return { waitedMinutes: waited, detentionRwf: 0, chargeableMinutes: 0 };

    const rateResult = await client.query('SELECT * FROM pricing_rates WHERE id = $1', [row.pricing_rate_id]);
    const rate = rateResult.rows[0];
    if (!rate) return { waitedMinutes: waited, detentionRwf: 0, chargeableMinutes: 0 };

    return detentionCharge(rate, waited);
}
