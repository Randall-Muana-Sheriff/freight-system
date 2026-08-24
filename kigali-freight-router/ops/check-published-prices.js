// Guards everything the marketing site says about money against what the
// system actually does.
//
// The first version checked four numbers per vehicle class in one file, and
// passed while the page around them went wrong in five separate ways. An
// audit found all five. This version checks what that one assumed:
//
//   the rate card      base / per km / per kg / minimum, against pricing_rates
//   the worked examples  re-quoted through the real pricing engine
//   the detention rates  including the NULL case, which charges nothing
//   the taper claim      per_km_long must exist, or "a lower rate for the
//                        remainder" is simply false
//   the payload bands    against WEIGHT_CLASS_BANDS and MAX_SELF_SERVICE_KG
//   the currency         against pricing_rates.currency
//   BOTH LANGUAGE FILES  en.ts and fr.ts carry independent copies of every
//                        figure. The old script read only en.ts while its own
//                        failure message told you to update fr.ts as well.
//
// Run after any pricing change, and in CI:  npm run check:prices

import pool from '../config/db.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { classForWeight, WEIGHT_CLASS_BANDS, MAX_SELF_SERVICE_KG } from '../services/pricingService.js';
import { distanceKmBetween, priceJob } from '../services/pricingRepository.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const I18N = path.join(HERE, '../../kigali-freight-ui/src/public/i18n');

const PUBLISHED_TO_DB = {
    'Light van': 'Light Van', 'Medium truck': 'Medium Truck', 'Heavy hauler': 'Heavy Hauler',
    'Fourgon léger': 'Light Van', 'Camion moyen': 'Medium Truck', 'Gros porteur': 'Heavy Hauler',
};

// "8,000" and the French "8 000" and "3,5" all mean the same number.
const toNumber = (s) => {
    const cleaned = String(s).replace(/[\s  ]/g, '');
    // A comma is a thousands separator in English and a decimal point in
    // French. Decide by what follows it: three digits and nothing else is a
    // separator, anything shorter is a decimal.
    return Number(/,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, ''));
};

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

async function readLocale(file) {
    const src = await readFile(path.join(I18N, file), 'utf8');
    const rows = [...src.matchAll(
        /\{ vehicle: '([^']+)', payload: '([^']+)', base: '([^']+)', perKm: '([^']+)', perKg: '([^']+)', minimum: '([^']+)' \}/g,
    )].map(([, vehicle, payload, base, perKm, perKg, minimum]) => ({ vehicle, payload, base, perKm, perKg, minimum }));
    const examples = [...src.matchAll(
        /\{ job: '([^']+)', detail: '([^']+)', price: '([^']+)' \}/g,
    )].map(([, job, detail, price]) => ({ job, detail, price }));
    const detention = [...src.matchAll(/([\d\s, ]{3,9})\s*RWF/g)].map((m) => toNumber(m[1]));
    return { src, rows, examples, detention };
}

const live = await pool.query(`
    SELECT DISTINCT ON (vehicle_class) *
    FROM pricing_rates ORDER BY vehicle_class, effective_from DESC
`);
const card = new Map(live.rows.map((r) => [r.vehicle_class, r]));

// ── the rate card, in every language that publishes one ──────────────────
for (const file of ['en.ts', 'fr.ts']) {
    const { rows, examples } = await readLocale(file);
    if (rows.length === 0) { fail(file, 'no published rate rows found — the shape of the file changed'); continue; }
    if (examples.length === 0) fail(file, 'no worked examples found');

    for (const row of rows) {
        const dbClass = PUBLISHED_TO_DB[row.vehicle];
        if (!dbClass) { fail(file, `"${row.vehicle}" maps to no vehicle class`); continue; }
        const r = card.get(dbClass);
        if (!r) { fail(file, `"${row.vehicle}" is published but ${dbClass} has no rate card`); continue; }

        for (const [label, published, actual] of [
            ['base', row.base, r.base_fare], ['per km', row.perKm, r.per_km],
            ['per kg', row.perKg, r.per_kg], ['minimum', row.minimum, r.minimum_fare],
        ]) {
            if (toNumber(published) !== Number(actual)) {
                fail(file, `${row.vehicle} ${label}: site says ${published}, card says ${actual}`);
            }
        }

        // A published taper that the card cannot deliver.
        if (r.per_km_long === null) {
            fail(file, `${row.vehicle}: the site promises a lower rate beyond the taper, but per_km_long is NULL — quote() falls back to the full per-km rate`);
        }
        // A published detention rate the system would charge nothing for.
        if (r.detention_per_hour === null) {
            fail(file, `${row.vehicle}: the site publishes an hourly waiting charge, but detention_per_hour is NULL and detentionCharge returns 0`);
        }
    }
}

// ── the worked examples, re-quoted through the real engine ───────────────
// Coordinates rather than distances, because that is what the endpoint takes
// now and because a named route can be re-checked by a human.
const ROUTES = [
    { name: '400 kg Nyabugogo to Kimironko', weightKg: 400,
      from: { lat: -1.939800, lng: 30.043500 }, to: { lat: -1.944800, lng: 30.125600 } },
    { name: '3 t Nyabugogo to Gikondo', weightKg: 3000,
      from: { lat: -1.939800, lng: 30.043500 }, to: { lat: -1.978800, lng: 30.084000 } },
    { name: '4 t Gikondo to Rubavu', weightKg: 4000,
      from: { lat: -1.978800, lng: 30.084000 }, to: { lat: -1.6777, lng: 29.2595 } },
];

const { examples: enExamples } = await readLocale('en.ts');
const { examples: frExamples } = await readLocale('fr.ts');

if (enExamples.length !== ROUTES.length) {
    fail('en.ts', `${enExamples.length} worked examples published but ${ROUTES.length} routes are checked — they must correspond`);
}
if (frExamples.length !== enExamples.length) {
    fail('fr.ts', `${frExamples.length} worked examples against en.ts's ${enExamples.length}`);
}

for (const [i, route] of ROUTES.entries()) {
    // distanceKmBetween and priceJob: the same two the public quote endpoint
    // uses. The first draft computed the distance here with its own haversine
    // and disagreed with the server by one franc, which is exactly the drift
    // this script exists to catch, reintroduced inside the guard. There is one
    // distance function and this calls it.
    const distanceKm = await distanceKmBetween(route.from, route.to);
    const priced = await priceJob({ weightKg: route.weightKg, distanceKm });
    classForWeight(route.weightKg);   // throws if the bands and the weight disagree

    for (const [file, list] of [['en.ts', enExamples], ['fr.ts', frExamples]]) {
        const published = list[i];
        if (!published) continue;
        if (toNumber(published.price) !== priced.totalAmount) {
            fail(file, `worked example "${route.name}": site says ${published.price}, the engine quotes ${priced.totalAmount.toLocaleString('en-US')}`);
        }
    }
}

// ── payload bands and currency ───────────────────────────────────────────
const heaviestBand = WEIGHT_CLASS_BANDS.find((b) => b.vehicleClass === 'Heavy Hauler');
if (heaviestBand && Number.isFinite(heaviestBand.maxKg) && heaviestBand.maxKg !== MAX_SELF_SERVICE_KG) {
    fail('bands', `the heavy band ends at ${heaviestBand.maxKg} but the site may quote to ${MAX_SELF_SERVICE_KG}`);
}
for (const [cls, r] of card) {
    if (r.currency !== 'RWF') fail('currency', `${cls} is priced in ${r.currency} but the site says "All figures in RWF"`);
}

await pool.end();

if (problems.length > 0) {
    console.error('The site and the system disagree about money:\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error('\nFix the rate card, or update pricing.rows / pricing.examples in BOTH');
    console.error('kigali-freight-ui/src/public/i18n/en.ts and fr.ts.\n');
    process.exit(1);
}

console.log(`Site and system agree: ${card.size} rate cards, ${ROUTES.length} worked examples, 2 languages.`);
