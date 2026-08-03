import pool from '../config/db.js';

// Used to give a driver immediate guidance in a safety report response
// ("nearest hub: X, 2.3km away") — a plain nearest-neighbor query against
// the same PostGIS `hubs.coordinates` column already used for order
// routing elsewhere in this codebase.
export async function findNearestHub(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    const result = await pool.query(
        `SELECT id, name, ST_Y(coordinates) AS lat, ST_X(coordinates) AS lng,
                ST_DistanceSphere(coordinates, ST_MakePoint($1, $2)) AS distance_meters
         FROM hubs
         ORDER BY distance_meters ASC
         LIMIT 1;`,
        [lng, lat]
    );

    return result.rows[0] || null;
}
