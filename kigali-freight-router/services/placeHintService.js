// Learning where a place name is, once.
//
// Measured against the real backlog, Nominatim resolves Kigali's sectors and
// not its landmarks: "Gikondo" resolves, "Gikondo depot gate 3" does not.
// So resolution walks backwards -- try the whole phrase, then drop trailing
// words until something matches -- and the answer is stored under the ORIGINAL
// phrase, so the walk happens once per distinct phrase ever rather than once
// per order.
//
// The point is deliberately NOT precise enough to place a delivery. A sector
// centroid can be most of a kilometre from the gate. It is for opening the map
// on the right neighbourhood so a dispatcher pans from Gikondo instead of from
// a default view, eighty times over.
import pool from '../config/db.js';
import { geocodeSearch } from './geocodeService.js';
// Two bookings that say "Kimironko Market, Shop 14" and "kimironko market
// shop 14" are the same question and must not cost two lookups.
import { normalizeToken } from '../utils/placeToken.js';

export { normalizeToken };

// Cache only, never geocodes. The UI calls this, and a UI must not wait on a
// throttled external service -- warming is a sweep's job.
export async function lookupHints(tokens) {
    const normalised = [...new Set(tokens.map(normalizeToken).filter(Boolean))];
    if (normalised.length === 0) return {};

    const { rows } = await pool.query(
        `SELECT token, lat, lng, label, resolved_from, miss_count FROM place_hints WHERE token = ANY($1)`,
        [normalised]
    );
    return Object.fromEntries(rows.map((r) => [r.token, {
        lat: r.lat, lng: r.lng, label: r.label,
        resolvedFrom: r.resolved_from,
        // A cached miss is an answer. The UI should stop asking rather than
        // treat it as not-yet-tried.
        unresolvable: r.lat === null,
    }]));
}

/**
 * Resolves one phrase, walking backwards until something matches.
 *
 * Returns the row it wrote. A miss is written too, with miss_count bumped --
 * otherwise a name Nominatim will never know is retried on every sweep for
 * ever, spending the throttle on a question already answered.
 */
export async function resolveToken(raw) {
    const token = normalizeToken(raw);
    if (!token) return null;

    const words = token.split(' ');
    for (let take = words.length; take > 0; take -= 1) {
        const attempt = words.slice(0, take).join(' ');
        if (attempt.length < 3) break;

        let results = [];
        try {
            results = await geocodeSearch(attempt, { limit: 1 });
        } catch {
            // A network failure is not a miss. Leave the token untouched so
            // the next sweep tries again rather than caching an outage.
            return null;
        }

        if (results.length > 0) {
            const hit = results[0];
            const { rows } = await pool.query(
                `INSERT INTO place_hints (token, lat, lng, label, resolved_from, resolved_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                 ON CONFLICT (token) DO UPDATE
                    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, label = EXCLUDED.label,
                        resolved_from = EXCLUDED.resolved_from, resolved_at = NOW(), updated_at = NOW()
                 RETURNING *`,
                [token, hit.lat, hit.lng, hit.label, attempt]
            );
            return rows[0];
        }
    }

    const { rows } = await pool.query(
        `INSERT INTO place_hints (token, miss_count, updated_at) VALUES ($1, 1, NOW())
         ON CONFLICT (token) DO UPDATE SET miss_count = place_hints.miss_count + 1, updated_at = NOW()
         RETURNING *`,
        [token]
    );
    return rows[0];
}

// Every distinct address phrase on an order that still needs placing and has
// never been looked up. This is the sweep's work list.
//
// The normalising is done in JS, not in SQL, so normalizeToken stays the only
// definition of "same place" in the system. A regexp_replace here that drifted
// from it by one character would resolve tokens under names the lookup never
// asks for, and the cache would silently never hit. The backlog is a few
// hundred rows at most -- there is nothing to gain by doing it in the query.
export async function unresolvedTokensForBacklog() {
    const { rows } = await pool.query(
        `SELECT pickup_address_text AS line FROM orders
          WHERE status = 'PENDING' AND (pickup_lat IS NULL OR delivery_lat IS NULL)
            AND pickup_address_text IS NOT NULL
         UNION ALL
         SELECT delivery_address_text FROM orders
          WHERE status = 'PENDING' AND (pickup_lat IS NULL OR delivery_lat IS NULL)
            AND delivery_address_text IS NOT NULL`
    );

    const tokens = [...new Set(rows.map((r) => normalizeToken(r.line)).filter(Boolean))].sort();
    if (tokens.length === 0) return [];

    const { rows: known } = await pool.query(
        'SELECT token FROM place_hints WHERE token = ANY($1)', [tokens]
    );
    const alreadyTried = new Set(known.map((r) => r.token));
    return tokens.filter((t) => !alreadyTried.has(t));
}
