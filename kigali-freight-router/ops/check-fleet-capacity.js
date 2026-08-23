// Guards the self-service quoting cap against the fleet it claims to have.
//
// MAX_SELF_SERVICE_KG is the heaviest load the public site will price on
// its own. It is a hardcoded fleet fact rather than a live query, because
// quotes that move when a lorry goes in for repair are worse than a number
// that is occasionally conservative — but a hardcoded fact drifts, and the
// direction that hurts is the cap claiming more than anything can carry.
// That is the bug this existed to fix in the first place: the site quoted
// 30 tonnes against a fleet whose largest vehicle takes 12.
//
// Run after any fleet change, and in CI:  npm run check:fleet-capacity

import pool from '../config/db.js';
import { MAX_SELF_SERVICE_KG } from '../services/pricingService.js';

const { rows } = await pool.query(`
    SELECT vehicle_type, max_weight_kg
    FROM fleet_vehicles
    WHERE max_weight_kg IS NOT NULL
    ORDER BY max_weight_kg DESC
`);
await pool.end();

if (rows.length === 0) {
    console.error('No fleet vehicle records a capacity, so the quoting cap cannot be checked.');
    console.error('Set max_weight_kg on the fleet before trusting what the site quotes.');
    process.exit(1);
}

const largest = Number(rows[0].max_weight_kg);
const kg = (n) => `${n.toLocaleString('en-US')} kg`;

if (MAX_SELF_SERVICE_KG > largest) {
    console.error(`The site will quote up to ${kg(MAX_SELF_SERVICE_KG)}, but the largest vehicle on the fleet`);
    console.error(`carries ${kg(largest)} (${rows[0].vehicle_type}). Every booking in between is a price`);
    console.error('nothing can deliver.\n');
    console.error(`Lower MAX_SELF_SERVICE_KG in services/pricingService.js to ${kg(largest)},`);
    console.error('and move the published payload band in the UI\'s i18n files to match.\n');
    process.exit(1);
}

if (MAX_SELF_SERVICE_KG < largest) {
    // Not a failure: capacity bought and not yet sold is a choice, and the
    // conservative direction is the safe one. Said out loud so it is a
    // decision rather than something nobody noticed.
    console.warn(`Cap is ${kg(MAX_SELF_SERVICE_KG)} while the fleet's largest carries ${kg(largest)}.`);
    console.warn('Safe, but there is capacity the site is not selling.');
}

console.log(`Quoting cap (${kg(MAX_SELF_SERVICE_KG)}) is within fleet capacity (${kg(largest)}).`);
