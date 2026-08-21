// The one place that reads the rate card. Kept apart from pricingService.js
// so the arithmetic there stays pure and testable without a database.
import pool from '../config/db.js';
import { SpatialService } from './spatialService.js';
import { quote, classForWeight, PricingError } from './pricingService.js';

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
export async function priceJob({ weightKg, distanceKm = null }) {
    const vehicleClass = classForWeight(weightKg);
    const rate = await currentRateFor(vehicleClass);
    if (!rate) throw new PricingError(`No rate card for ${vehicleClass}.`);
    return quote(rate, { weightKg, distanceKm });
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
