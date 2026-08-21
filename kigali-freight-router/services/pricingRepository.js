// The one place that reads the rate card. Kept apart from pricingService.js
// so the arithmetic there stays pure and testable without a database.
import pool from '../config/db.js';

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
