import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, platformMargin, detentionCharge, PricingError,
         needsManualQuote, MAX_SELF_SERVICE_KG, classForWeight } from '../services/pricingService.js';

// The seeded Light Van card, as migrations/add_pricing.sql writes it.
const VAN = {
    id: 1,
    vehicle_class: 'Light Van',
    base_fare: 5000,
    per_km: 400,
    per_kg: 15,
    minimum_fare: 8000,
    fuel_litres_per_100km: 10,
    fuel_price_per_litre: 2927,
    platform_commission_pct: 15,
    platform_minimum_fee: 500,
    road_distance_factor: 1.6,
};

test('a normal Kigali run prices out of its parts', () => {
    // 10km measured straight-line is 16km of Kigali road at the 1.6 factor,
    // and everything is charged on the 16.
    const q = quote(VAN, { weightKg: 200, distanceKm: 10 });
    assert.equal(q.distanceKm, 16);
    // fuel: 16km at 10L/100km = 1.6L at 2927
    assert.equal(q.fuelAmount, 4683);
    // service: 5000 base + 16*400 + 200*15
    assert.equal(q.serviceAmount, 14400);
    assert.equal(q.totalAmount, 19083);
    // 15% of the service component only, never of the fuel
    assert.equal(q.platformFee, 2160);
    assert.equal(q.driverNet, 16923);
    assert.equal(q.isEstimate, false);
});

// The bug this factor exists for: a straight line between two points is not
// the journey, and charging it undercharges every single job.
test('distance is corrected from crow-flight to road before anything is charged', () => {
    const straight = quote({ ...VAN, road_distance_factor: 1 }, { weightKg: 200, distanceKm: 10 });
    const corrected = quote(VAN, { weightKg: 200, distanceKm: 10 });

    assert.equal(straight.distanceKm, 10);
    assert.equal(corrected.distanceKm, 16);
    // Both the per-km line and the fuel move, because the driver drives all
    // of it and burns fuel over all of it.
    assert.ok(corrected.fuelAmount > straight.fuelAmount, 'fuel must follow the real distance');
    assert.ok(corrected.serviceAmount > straight.serviceAmount, 'the per-km line must follow it too');
    assert.ok(corrected.driverNet > straight.driverNet, 'the driver was being underpaid');
});

// An older rate row predates the column and has no factor at all. It must
// price exactly as it always did rather than silently multiplying by zero.
test('a rate card with no factor prices on the raw distance', () => {
    const { road_distance_factor, ...legacy } = VAN;
    assert.equal(quote(legacy, { weightKg: 200, distanceKm: 10 }).distanceKm, 10);
    assert.equal(quote({ ...legacy, road_distance_factor: null }, { weightKg: 200, distanceKm: 10 }).distanceKm, 10);
});

// The reason fuel sits outside the commission base at all.
test('a fuel shock moves the customer and the driver, not the platform cut', () => {
    const before = quote({ ...VAN, fuel_price_per_litre: 1757 }, { weightKg: 200, distanceKm: 10 });
    const after = quote(VAN, { weightKg: 200, distanceKm: 10 });

    // Rwandan diesel went 1,757 -> 2,927 in the year to August 2026.
    assert.ok(after.totalAmount > before.totalAmount, 'the customer should feel a fuel rise');
    assert.ok(after.driverNet > before.driverNet, 'the driver should be reimbursed for it');
    assert.equal(
        after.platformFee,
        before.platformFee,
        'the platform must not get an automatic raise out of a fuel rise'
    );
    // And the driver is made whole on it exactly, not approximately.
    assert.equal(after.driverNet - before.driverNet, after.fuelAmount - before.fuelAmount);
});

test('a booking with no distance yet is priced as an estimate', () => {
    const q = quote(VAN, { weightKg: 200, distanceKm: null });
    assert.equal(q.isEstimate, true);
    assert.equal(q.distanceKm, null);
    assert.equal(q.fuelAmount, 0, 'no distance means no fuel to charge for');
    // 5000 base + 200*15 = 8000, exactly the minimum
    assert.equal(q.totalAmount, 8000);
});

test('the minimum fare lifts a tiny job without inflating the platform cut', () => {
    const q = quote(VAN, { weightKg: 1, distanceKm: 0.5 });
    assert.equal(q.minimumFareApplied, true);
    assert.equal(q.totalAmount, 8000, 'lifted to the floor');
    // 0.5km straight is 0.8km of road; service is 5000 + 320 + 15 = 5335, and
    // 15% of that is 800, above the 500 floor -- so the fee follows the
    // service component and not the lifted fare.
    assert.equal(q.platformFee, 800);
});

test('the fee floor covers a job whose commission would not pay for itself', () => {
    // A long run on a thin service rate: nearly all of what the customer
    // pays is fuel, which is passed straight through, so 15% of the service
    // component is 150 RWF -- less than the SMS, MoMo fee and storage the
    // job itself costs. The floor is what stops that job losing money.
    const thin = { ...VAN, base_fare: 1000, per_km: 0, per_kg: 0, minimum_fare: 0 };
    const q = quote(thin, { weightKg: 0, distanceKm: 50 });

    assert.equal(q.fuelAmount, 23416, '50km straight is 80km of road, at 10L/100km at 2,927/L');
    assert.equal(q.serviceAmount, 1000);
    assert.equal(q.minimumFeeApplied, true);
    assert.equal(q.platformFee, 500, 'the floor, not 15% of 1000');
    assert.equal(q.driverNet, 23916, 'driver still gets all the fuel back');
});

test('the fee can never leave the driver owing money', () => {
    const q = quote({ ...VAN, base_fare: 50, per_kg: 0, minimum_fare: 200, platform_minimum_fee: 5000 },
        { weightKg: 0, distanceKm: 0 });
    assert.ok(q.platformFee <= q.totalAmount, 'fee exceeded the fare');
    assert.ok(q.driverNet >= 0, `driver net went negative: ${q.driverNet}`);
});

test('the parts always reconcile to the total', () => {
    // Swept rather than spot-checked: rounding total and fee independently and
    // deriving the net from the unrounded pair disagreed by a franc on roughly
    // one input in three, and the handful of values here originally missed it.
    for (let w = 0; w <= 2000; w += 137) {
        for (let d = 0; d <= 60; d += 3.7) {
            const q = quote(VAN, { weightKg: w, distanceKm: d });
            assert.equal(
                q.platformFee + q.driverNet,
                q.totalAmount,
                `fee + driver net != total at ${w}kg/${d}km`
            );
        }
    }
    for (const [w, d] of [[0, 0], [1, 0.1], [250, 8], [1200, 45], [5000, 120]]) {
        const q = quote(VAN, { weightKg: w, distanceKm: d });
        assert.equal(
            q.platformFee + q.driverNet,
            q.totalAmount,
            `fee + driver net != total at ${w}kg/${d}km`
        );
    }
});

test('nonsense inputs are refused rather than priced', () => {
    assert.throws(() => quote(null, { weightKg: 1 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: -1, distanceKm: 1 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: 1, distanceKm: -5 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: 'heavy', distanceKm: 1 }), PricingError);
    assert.throws(() => quote({ ...VAN, per_km: undefined }, { weightKg: 1, distanceKm: 1 }), PricingError);
});

// The question the commission percentage actually has to answer.
test('platform margin is what is left after the job costs money to run', () => {
    const q = quote(VAN, { weightKg: 200, distanceKm: 10 });
    const m = platformMargin(q, { smsCount: 2, smsCost: 14, momoFeePct: 1.0 });
    assert.equal(m.platformFee, 2160);
    assert.equal(m.smsCost, 28);
    assert.equal(m.momoFee, 191);
    assert.equal(m.netToPlatform, 2160 - 28 - 191);
    assert.ok(m.netToPlatform > 0, 'a normal job must leave the platform ahead');
});

// ── Route factors ────────────────────────────────────────────────────────

const TRUCK = {
    id: 2,
    vehicle_class: 'Medium Truck',
    base_fare: 18000, per_km: 900, per_kg: 6, minimum_fare: 40000,
    fuel_litres_per_100km: 16, fuel_price_per_litre: 2927,
    platform_commission_pct: 15, platform_minimum_fee: 500,
    road_distance_factor: 1.6, per_km_long: 160, taper_after_km: 25,
    return_leg_beyond_km: 25, terrain_fuel_factor: 1.2,
    detention_free_minutes: 60, detention_per_hour: 8500,
    return_leg_share_pct: 70,
};

test('a job inside the city is unaffected by any of the route factors', () => {
    // 10km straight is 16km of road, inside the 25km city band, so no taper,
    // no terrain, no empty return.
    const q = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(q.openRoadKm, 0);
    assert.equal(q.returnsEmpty, false);
    assert.equal(q.returnLegAmount, 0);
    assert.equal(q.totalAmount, 57893);
});

test('an upcountry run is charged for coming back empty', () => {
    // Kigali to Rubavu: ~157km of road, so ~98km measured straight.
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.equal(q.returnsEmpty, true);
    assert.ok(q.returnLegAmount > 0, 'the empty leg must be charged');

    // The check that principle and market agree: operators reportedly add
    // 20-40% for one-way upcountry work, and charging the actual return fuel
    // has to land inside that band or the model is wrong about something.
    const oneWayOnly = quote({ ...TRUCK, return_leg_beyond_km: 100000 }, { weightKg: 4000, distanceKm: 98.125 });
    const uplift = (q.totalAmount - oneWayOnly.totalAmount) / oneWayOnly.totalAmount;
    assert.ok(uplift >= 0.20 && uplift <= 0.40, `empty-return uplift was ${(uplift * 100).toFixed(1)}%, outside the 20-40% operators charge`);
    // And the whole leg, uncharged-share aside, is genuinely bigger than that
    // -- which is the gap a matched return load closes.
    const wholeLeg = quote({ ...TRUCK, return_leg_share_pct: 100 }, { weightKg: 4000, distanceKm: 98.125 });
    assert.ok(wholeLeg.returnLegAmount > q.returnLegAmount, 'the driver is still carrying part of the empty leg');
});

test('the driver keeps the return fuel, not the platform', () => {
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    const noReturn = quote({ ...TRUCK, return_leg_beyond_km: 100000 }, { weightKg: 4000, distanceKm: 98.125 });
    // Fuel is outside the commission base, so charging the empty leg must
    // reach the driver whole and leave the fee untouched.
    assert.equal(q.platformFee, noReturn.platformFee);
    assert.equal(q.driverNet - noReturn.driverNet, q.returnLegAmount);
});

test('the open road is charged at its own rate, not the city rate', () => {
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    const noTaper = quote({ ...TRUCK, per_km_long: null }, { weightKg: 4000, distanceKm: 98.125 });
    // Charging the city rate for 132km of open road is what put this trip
    // 30% above anything anyone in Rwanda pays for it.
    assert.ok(q.totalAmount < noTaper.totalAmount, 'the taper must reduce a long run');
    assert.ok(q.totalAmount <= 260000, `4t to Rubavu priced at ${q.totalAmount}, above the 150,000-250,000 quoted`);
});

test('terrain is charged on the open road only, never on the city stretch', () => {
    const flatCity = quote({ ...TRUCK, terrain_fuel_factor: 1 }, { weightKg: 3000, distanceKm: 10 });
    const hillyCity = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(flatCity.fuelAmount, hillyCity.fuelAmount, 'a run across Kigali must not pay for hills it never climbs');

    const flatLong = quote({ ...TRUCK, terrain_fuel_factor: 1 }, { weightKg: 4000, distanceKm: 98.125 });
    const hillyLong = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.ok(hillyLong.fuelAmount > flatLong.fuelAmount, 'the climb out of Kigali must be charged');
});

test('a rate card predating the route factors prices exactly as it did', () => {
    const legacy = { ...VAN };
    const q = quote(legacy, { weightKg: 200, distanceKm: 10 });
    assert.equal(q.openRoadKm, 0, 'no taper column means no taper');
    assert.equal(q.returnsEmpty, false, 'no return column means no empty leg');
    assert.equal(q.totalAmount, 19083, 'unchanged from before the columns existed');
});

test('detention is free for an hour, then charged by the minute', () => {
    assert.equal(detentionCharge(TRUCK, 45).detentionAmount, 0, 'inside the free hour');
    assert.equal(detentionCharge(TRUCK, 60).detentionAmount, 0, 'exactly the free hour');

    // 8,500 an hour is what a truck driver's time is worth on the road, from
    // 76,500 a day over nine hours.
    assert.equal(detentionCharge(TRUCK, 120).detentionAmount, 8500, 'one chargeable hour');
    assert.equal(detentionCharge(TRUCK, 90).chargeableMinutes, 30);
    assert.equal(detentionCharge(TRUCK, 90).detentionAmount, 4250, 'half an hour, not rounded up to a whole one');
});

test('detention refuses nonsense and costs nothing without a rate', () => {
    assert.throws(() => detentionCharge(TRUCK, -5), PricingError);
    assert.throws(() => detentionCharge(TRUCK, 'ages'), PricingError);
    assert.equal(detentionCharge({}, 300).detentionAmount, 0, 'a card with no detention rate charges none');
});

// ── Corridors ────────────────────────────────────────────────────────────

test('a corridor overrides the card, so the eastern plain pays no mountain fuel', () => {
    // Same trip, same distance, different direction out of Kigali. Rwamagana
    // is 91 degrees onto the Akagera plain; Musanze is 316 and climbs.
    const east = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125, terrainFactor: 1.0 });
    const north = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });

    assert.equal(east.terrainFactor, 1.0);
    assert.equal(north.terrainFactor, 1.2);
    assert.ok(east.fuelAmount < north.fuelAmount, 'a flat run must burn less than a climb');
    assert.ok(east.totalAmount < north.totalAmount, 'and must cost the customer less');

    // The whole difference reaches the driver: fuel sits outside the
    // commission base, so a flatter route does not change what the platform
    // takes -- it just stops overcharging for hills that are not there.
    assert.equal(east.platformFee, north.platformFee);
});

test('a corridor cannot make a city job cheaper, because terrain never applied there', () => {
    const flat = quote(TRUCK, { weightKg: 3000, distanceKm: 10, terrainFactor: 1.0 });
    const hilly = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(flat.totalAmount, hilly.totalAmount, 'nothing beyond the city means nothing to adjust');
});

test('an unknown corridor climbs, which is the safe default here', () => {
    // corridorFor returns null when nothing matches, and null must mean "use
    // the card" rather than "no terrain" -- most of Rwanda is hills, so
    // guessing flat would undercharge and the driver would absorb it.
    const unknown = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125, terrainFactor: null });
    const carded = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.equal(unknown.totalAmount, carded.totalAmount);
    assert.equal(unknown.terrainFactor, 1.2);
});

test('a nonsense terrain factor is refused rather than priced', () => {
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: 0 }), PricingError);
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: -1 }), PricingError);
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: 'steep' }), PricingError);
});

// ── Other currencies ─────────────────────────────────────────────────────

// The franc has no minor unit, so rounding a fare to whole numbers is right in
// Kigali. It is wrong almost everywhere else this system might go: cedis have
// pesewas, shillings have cents, and rounding those away is a quiet overcharge
// or underpayment on every single job.
const CEDI = {
    ...VAN,
    currency: 'GHS',
    currency_minor_units: 2,
    country_code: 'GH',
    base_fare: 80, per_km: 7, per_kg: 0.08, minimum_fare: 150,
    fuel_price_per_litre: 15.42, detention_per_hour: 38,
};

test('a two-decimal currency keeps its decimals', () => {
    const q = quote(CEDI, { weightKg: 200, distanceKm: 10 });
    assert.equal(q.currency, 'GHS');
    // 16km of road at 10L/100km at 15.42 = 24.672, which must not become 25.
    assert.equal(q.fuelAmount, 24.67);
    assert.ok(!Number.isInteger(q.totalAmount), `${q.totalAmount} was rounded to a whole cedi`);
});

test('the parts still reconcile when the currency has decimals', () => {
    for (let w = 0; w <= 900; w += 91) {
        for (let d = 0; d <= 40; d += 3.3) {
            const q = quote(CEDI, { weightKg: w, distanceKm: d });
            assert.ok(
                Math.abs(q.platformFee + q.driverNet - q.totalAmount) < 1e-9,
                `fee + net != total at ${w}kg/${d}km: ${q.platformFee} + ${q.driverNet} vs ${q.totalAmount}`
            );
        }
    }
});

test('the currency comes from the card, never from a constant', () => {
    assert.equal(quote(VAN, { weightKg: 100, distanceKm: 5 }).currency, 'RWF');
    assert.equal(quote(CEDI, { weightKg: 100, distanceKm: 5 }).currency, 'GHS');
    // A card written before the column existed still prices, in francs.
    const { currency, ...older } = CEDI;
    assert.equal(quote(older, { weightKg: 100, distanceKm: 5 }).currency, 'RWF');
});

test('a whole-unit currency is still rounded whole', () => {
    // The regression that matters in the other direction: adding minor units
    // must not start handing Kigali fares with centimes on them.
    const q = quote(VAN, { weightKg: 200, distanceKm: 10 });
    assert.ok(Number.isInteger(q.totalAmount), `${q.totalAmount} is not a whole franc`);
    assert.ok(Number.isInteger(q.driverNet) && Number.isInteger(q.platformFee), '');
});


// The bug: the weight bands class anything over 8 tonnes as a Heavy Hauler
// and price it confidently, while the heaviest vehicle on the fleet carries
// 12. A 30-tonne booking got an instant, firm, undeliverable number. The
// bands are left open-ended on purpose -- a dispatcher pricing a hand-quoted
// 20-tonne job still needs the card -- so the line is drawn at the public
// door instead, and this is where it is drawn.
test('the fleet cap is what separates a quote from a conversation', () => {
    assert.equal(needsManualQuote(MAX_SELF_SERVICE_KG), false, 'the cap itself is bookable');
    assert.equal(needsManualQuote(MAX_SELF_SERVICE_KG - 1), false);
    assert.equal(needsManualQuote(MAX_SELF_SERVICE_KG + 1), true);

    // The weight that started this. Priced without complaint before.
    assert.equal(needsManualQuote(30000), true);

    // Strings arrive from a query string, so the numeric coercion matters.
    assert.equal(needsManualQuote('30000'), true);
    assert.equal(needsManualQuote('400'), false);
});

test('rubbish weights are left for the validator to reject, not claimed here', () => {
    // Returning true for these would turn "that is not a number" into
    // "talk to us about your load", which sends the customer down a path
    // that cannot help them.
    for (const bad of [undefined, null, '', 'heavy', NaN, Infinity]) {
        assert.equal(needsManualQuote(bad), false, `${JSON.stringify(String(bad))} should not read as too heavy`);
    }
});

test('the dispatcher can still price above the public cap', () => {
    // The bands stay open-ended: a hand-quoted 20-tonne job has to land on
    // a real rate card, or refusing it publicly would just move the problem
    // into the dispatcher's screen.
    assert.equal(classForWeight(MAX_SELF_SERVICE_KG + 8000), 'Heavy Hauler');
});

// The empty-return charge used to be a switch: nothing at 25.00 km, the full
// 70% share at 25.01. Two deliveries on opposite sides of one street differed
// by 5,132 RWF, and a customer could save that by moving a pin ten metres.
//
// The switch modelled the wrong thing. Whether a driver comes back empty is
// not a fact that changes at a line on the map — it is a likelihood that
// falls away with distance from the market they load in.
const TAPERED_VAN = { ...VAN, return_leg_beyond_km: 25, return_leg_share_pct: 70, return_leg_full_km: 75 };

// A road kilometre, expressed as the straight-line distance quote() expects.
const atRoadKm = (card, km) => quote(card, { weightKg: 400, distanceKm: km / card.road_distance_factor });

test('crossing the point where the empty return starts costs almost nothing', () => {
    const just_under = atRoadKm(TAPERED_VAN, 24.99);
    const just_over = atRoadKm(TAPERED_VAN, 25.01);
    const step = just_over.totalAmount - just_under.totalAmount;

    assert.equal(just_under.returnLegAmount, 0, 'nothing is charged below the start point');
    assert.ok(step >= 0, 'and going further never costs less');
    // The old behaviour put 5,132 here. Anything of that order is a cliff,
    // whatever the exact figure.
    assert.ok(step < 100, `two metres of road should not cost ${step} — that is the cliff returning`);
});

test('the full share applies once the band is crossed, and not before', () => {
    // Half way along the band, half the share.
    const mid = atRoadKm(TAPERED_VAN, 50);
    const full = atRoadKm(TAPERED_VAN, 75);
    const beyond = atRoadKm(TAPERED_VAN, 120);

    const shareAt = (q, km) => q.returnLegAmount / (q.fuelAmount - q.returnLegAmount);
    assert.ok(Math.abs(shareAt(mid) - 0.35) < 0.02, `half way along the band should be half the share, got ${shareAt(mid)}`);
    assert.ok(Math.abs(shareAt(full) - 0.70) < 0.02, `the full point should be the full share, got ${shareAt(full)}`);
    // Past the full point the share stops growing — only the leg does.
    assert.ok(Math.abs(shareAt(beyond) - 0.70) < 0.02, 'the share is capped, not extrapolated');
    assert.ok(beyond.returnLegAmount > full.returnLegAmount, 'but a longer empty leg still costs more');
});

test('the price never falls as the journey grows', () => {
    // The bug this catches is a taper applied the wrong way round, which
    // would make a longer job cheaper somewhere in the band.
    let previous = 0;
    for (let km = 20; km <= 120; km += 0.5) {
        const total = atRoadKm(TAPERED_VAN, km).totalAmount;
        assert.ok(total >= previous, `going from just under ${km}km to ${km}km made the job cheaper`);
        previous = total;
    }
});

// A card written before this column existed must price exactly as it did, or
// a customer who was already quoted sees the number change underneath them.
test('a card with no upper point behaves as the old switch did', () => {
    const legacy = { ...VAN, return_leg_beyond_km: 25, return_leg_share_pct: 70 };
    const under = atRoadKm(legacy, 24.99);
    const over = atRoadKm(legacy, 25.01);
    assert.equal(under.returnLegAmount, 0);
    // Full share immediately — the cliff, deliberately preserved for a card
    // that has not been migrated.
    const share = over.returnLegAmount / (over.fuelAmount - over.returnLegAmount);
    assert.ok(Math.abs(share - 0.70) < 0.02, 'an un-migrated card still applies the whole share at once');
});
