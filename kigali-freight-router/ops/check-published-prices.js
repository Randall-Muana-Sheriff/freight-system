// Guards the rate card printed on the marketing site against the one the
// system actually quotes from.
//
// The landing page publishes real figures — base fare, per km, per kg and
// the minimum for each vehicle class — which is unusual in this market and
// is the strongest thing the site says. It is also the most fragile: a
// price is only worth publishing while it is true, and a card that has
// quietly drifted from what the booking form charges is worse than never
// having published one. Nothing about editing pricing_rates reminds anyone
// that a public page repeats those numbers, so this makes the link
// mechanical instead of remembered.
//
// Run it after any pricing change, and in CI:  npm run check:prices

import pool from '../config/db.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EN = path.join(HERE, '../../kigali-freight-ui/src/public/i18n/en.ts');

// The published class names are prose ("Light van"); the database's are
// identifiers ("Light Van"). Mapped explicitly rather than case-folded, so
// renaming one on the site is a deliberate edit here and not a silent miss.
const PUBLISHED_TO_DB = {
    'Light van': 'Light Van',
    'Medium truck': 'Medium Truck',
    'Heavy hauler': 'Heavy Hauler',
};

// "8,000" and the French "8 000" both mean 8000.
const toNumber = (s) => Number(String(s).replace(/[,   ]/g, '').replace(',', '.'));

async function publishedRows() {
    const src = await readFile(EN, 'utf8');
    const block = src.match(/rows: \[([\s\S]*?)\],/);
    if (!block) throw new Error(`Could not find the published pricing rows in ${EN}`);
    return [...block[1].matchAll(
        /\{ vehicle: '([^']+)', payload: '[^']*', base: '([^']+)', perKm: '([^']+)', perKg: '([^']+)', minimum: '([^']+)' \}/g,
    )].map(([, vehicle, base, perKm, perKg, minimum]) => ({
        vehicle, base: toNumber(base), perKm: toNumber(perKm),
        perKg: toNumber(perKg), minimum: toNumber(minimum),
    }));
}

async function liveCard() {
    // DISTINCT ON mirrors how the app picks a card: newest effective_from
    // per class wins. Comparing against every historical row would pass on
    // a superseded one, which is exactly the drift being looked for.
    const { rows } = await pool.query(`
        SELECT DISTINCT ON (vehicle_class)
               vehicle_class, base_fare, per_km, per_kg, minimum_fare
        FROM pricing_rates
        ORDER BY vehicle_class, effective_from DESC
    `);
    return new Map(rows.map((r) => [r.vehicle_class, {
        base: Number(r.base_fare), perKm: Number(r.per_km),
        perKg: Number(r.per_kg), minimum: Number(r.minimum_fare),
    }]));
}

const published = await publishedRows();
const live = await liveCard();
const problems = [];

if (published.length === 0) problems.push('No published rows were parsed — the shape of en.ts has changed.');

for (const row of published) {
    const dbClass = PUBLISHED_TO_DB[row.vehicle];
    if (!dbClass) { problems.push(`"${row.vehicle}" on the site maps to no vehicle class.`); continue; }
    const card = live.get(dbClass);
    if (!card) { problems.push(`"${row.vehicle}" is published but ${dbClass} has no rate card.`); continue; }
    for (const field of ['base', 'perKm', 'perKg', 'minimum']) {
        if (row[field] !== card[field]) {
            problems.push(`${row.vehicle} ${field}: the site says ${row[field].toLocaleString('en-US')}, the rate card says ${card[field].toLocaleString('en-US')}.`);
        }
    }
}

await pool.end();

if (problems.length > 0) {
    console.error('Published prices no longer match the live rate card:\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error('\nUpdate pricing.rows in kigali-freight-ui/src/public/i18n/{en,fr}.ts,');
    console.error('and re-quote the worked examples — they are in the same block.\n');
    process.exit(1);
}

console.log(`Published rate card matches the live one (${published.length} vehicle classes checked).`);
