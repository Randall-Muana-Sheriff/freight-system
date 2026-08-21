import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, platformMargin, detentionCharge, PricingError } from '../services/pricingService.js';

// The seeded Light Van card, as migrations/add_pricing.sql writes it.
const VAN = {
    id: 1,
    vehicle_class: 'Light Van',
    base_fare_rwf: 5000,
    per_km_rwf: 400,
    per_kg_rwf: 15,
    minimum_fare_rwf: 8000,
    fuel_litres_per_100km: 10,
    diesel_price_rwf_per_litre: 2927,
    platform_commission_pct: 15,
    platform_minimum_fee_rwf: 500,
    road_distance_factor: 1.6,
};

test('a normal Kigali run prices out of its parts', () => {
    // 10km measured straight-line is 16km of Kigali road at the 1.6 factor,
    // and everything is charged on the 16.
    const q = quote(VAN, { weightKg: 200, distanceKm: 10 });
    assert.equal(q.distanceKm, 16);
    // fuel: 16km at 10L/100km = 1.6L at 2927
    assert.equal(q.fuelRwf, 4683);
    // service: 5000 base + 16*400 + 200*15
    assert.equal(q.serviceRwf, 14400);
    assert.equal(q.totalRwf, 19083);
    // 15% of the service component only, never of the fuel
    assert.equal(q.platformFeeRwf, 2160);
    assert.equal(q.driverNetRwf, 16923);
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
    assert.ok(corrected.fuelRwf > straight.fuelRwf, 'fuel must follow the real distance');
    assert.ok(corrected.serviceRwf > straight.serviceRwf, 'the per-km line must follow it too');
    assert.ok(corrected.driverNetRwf > straight.driverNetRwf, 'the driver was being underpaid');
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
    const before = quote({ ...VAN, diesel_price_rwf_per_litre: 1757 }, { weightKg: 200, distanceKm: 10 });
    const after = quote(VAN, { weightKg: 200, distanceKm: 10 });

    // Rwandan diesel went 1,757 -> 2,927 in the year to August 2026.
    assert.ok(after.totalRwf > before.totalRwf, 'the customer should feel a fuel rise');
    assert.ok(after.driverNetRwf > before.driverNetRwf, 'the driver should be reimbursed for it');
    assert.equal(
        after.platformFeeRwf,
        before.platformFeeRwf,
        'the platform must not get an automatic raise out of a fuel rise'
    );
    // And the driver is made whole on it exactly, not approximately.
    assert.equal(after.driverNetRwf - before.driverNetRwf, after.fuelRwf - before.fuelRwf);
});

test('a booking with no distance yet is priced as an estimate', () => {
    const q = quote(VAN, { weightKg: 200, distanceKm: null });
    assert.equal(q.isEstimate, true);
    assert.equal(q.distanceKm, null);
    assert.equal(q.fuelRwf, 0, 'no distance means no fuel to charge for');
    // 5000 base + 200*15 = 8000, exactly the minimum
    assert.equal(q.totalRwf, 8000);
});

test('the minimum fare lifts a tiny job without inflating the platform cut', () => {
    const q = quote(VAN, { weightKg: 1, distanceKm: 0.5 });
    assert.equal(q.minimumFareApplied, true);
    assert.equal(q.totalRwf, 8000, 'lifted to the floor');
    // 0.5km straight is 0.8km of road; service is 5000 + 320 + 15 = 5335, and
    // 15% of that is 800, above the 500 floor -- so the fee follows the
    // service component and not the lifted fare.
    assert.equal(q.platformFeeRwf, 800);
});

test('the fee floor covers a job whose commission would not pay for itself', () => {
    // A long run on a thin service rate: nearly all of what the customer
    // pays is fuel, which is passed straight through, so 15% of the service
    // component is 150 RWF -- less than the SMS, MoMo fee and storage the
    // job itself costs. The floor is what stops that job losing money.
    const thin = { ...VAN, base_fare_rwf: 1000, per_km_rwf: 0, per_kg_rwf: 0, minimum_fare_rwf: 0 };
    const q = quote(thin, { weightKg: 0, distanceKm: 50 });

    assert.equal(q.fuelRwf, 23416, '50km straight is 80km of road, at 10L/100km at 2,927/L');
    assert.equal(q.serviceRwf, 1000);
    assert.equal(q.minimumFeeApplied, true);
    assert.equal(q.platformFeeRwf, 500, 'the floor, not 15% of 1000');
    assert.equal(q.driverNetRwf, 23916, 'driver still gets all the fuel back');
});

test('the fee can never leave the driver owing money', () => {
    const q = quote({ ...VAN, base_fare_rwf: 50, per_kg_rwf: 0, minimum_fare_rwf: 200, platform_minimum_fee_rwf: 5000 },
        { weightKg: 0, distanceKm: 0 });
    assert.ok(q.platformFeeRwf <= q.totalRwf, 'fee exceeded the fare');
    assert.ok(q.driverNetRwf >= 0, `driver net went negative: ${q.driverNetRwf}`);
});

test('the parts always reconcile to the total', () => {
    for (const [w, d] of [[0, 0], [1, 0.1], [250, 8], [1200, 45], [5000, 120]]) {
        const q = quote(VAN, { weightKg: w, distanceKm: d });
        assert.equal(
            q.platformFeeRwf + q.driverNetRwf,
            q.totalRwf,
            `fee + driver net != total at ${w}kg/${d}km`
        );
    }
});

test('nonsense inputs are refused rather than priced', () => {
    assert.throws(() => quote(null, { weightKg: 1 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: -1, distanceKm: 1 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: 1, distanceKm: -5 }), PricingError);
    assert.throws(() => quote(VAN, { weightKg: 'heavy', distanceKm: 1 }), PricingError);
    assert.throws(() => quote({ ...VAN, per_km_rwf: undefined }, { weightKg: 1, distanceKm: 1 }), PricingError);
});

// The question the commission percentage actually has to answer.
test('platform margin is what is left after the job costs money to run', () => {
    const q = quote(VAN, { weightKg: 200, distanceKm: 10 });
    const m = platformMargin(q, { smsCount: 2, smsCostRwf: 14, momoFeePct: 1.0 });
    assert.equal(m.platformFeeRwf, 2160);
    assert.equal(m.smsCostRwf, 28);
    assert.equal(m.momoFeeRwf, 191);
    assert.equal(m.netToPlatformRwf, 2160 - 28 - 191);
    assert.ok(m.netToPlatformRwf > 0, 'a normal job must leave the platform ahead');
});

// ── Route factors ────────────────────────────────────────────────────────

const TRUCK = {
    id: 2,
    vehicle_class: 'Medium Truck',
    base_fare_rwf: 18000, per_km_rwf: 900, per_kg_rwf: 6, minimum_fare_rwf: 40000,
    fuel_litres_per_100km: 16, diesel_price_rwf_per_litre: 2927,
    platform_commission_pct: 15, platform_minimum_fee_rwf: 500,
    road_distance_factor: 1.6, per_km_long_rwf: 160, taper_after_km: 25,
    return_leg_beyond_km: 25, terrain_fuel_factor: 1.2,
    detention_free_minutes: 60, detention_per_hour_rwf: 8500,
    return_leg_share_pct: 70,
};

test('a job inside the city is unaffected by any of the route factors', () => {
    // 10km straight is 16km of road, inside the 25km city band, so no taper,
    // no terrain, no empty return.
    const q = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(q.openRoadKm, 0);
    assert.equal(q.returnsEmpty, false);
    assert.equal(q.returnLegRwf, 0);
    assert.equal(q.totalRwf, 57893);
});

test('an upcountry run is charged for coming back empty', () => {
    // Kigali to Rubavu: ~157km of road, so ~98km measured straight.
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.equal(q.returnsEmpty, true);
    assert.ok(q.returnLegRwf > 0, 'the empty leg must be charged');

    // The check that principle and market agree: operators reportedly add
    // 20-40% for one-way upcountry work, and charging the actual return fuel
    // has to land inside that band or the model is wrong about something.
    const oneWayOnly = quote({ ...TRUCK, return_leg_beyond_km: 100000 }, { weightKg: 4000, distanceKm: 98.125 });
    const uplift = (q.totalRwf - oneWayOnly.totalRwf) / oneWayOnly.totalRwf;
    assert.ok(uplift >= 0.20 && uplift <= 0.40, `empty-return uplift was ${(uplift * 100).toFixed(1)}%, outside the 20-40% operators charge`);
    // And the whole leg, uncharged-share aside, is genuinely bigger than that
    // -- which is the gap a matched return load closes.
    const wholeLeg = quote({ ...TRUCK, return_leg_share_pct: 100 }, { weightKg: 4000, distanceKm: 98.125 });
    assert.ok(wholeLeg.returnLegRwf > q.returnLegRwf, 'the driver is still carrying part of the empty leg');
});

test('the driver keeps the return fuel, not the platform', () => {
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    const noReturn = quote({ ...TRUCK, return_leg_beyond_km: 100000 }, { weightKg: 4000, distanceKm: 98.125 });
    // Fuel is outside the commission base, so charging the empty leg must
    // reach the driver whole and leave the fee untouched.
    assert.equal(q.platformFeeRwf, noReturn.platformFeeRwf);
    assert.equal(q.driverNetRwf - noReturn.driverNetRwf, q.returnLegRwf);
});

test('the open road is charged at its own rate, not the city rate', () => {
    const q = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    const noTaper = quote({ ...TRUCK, per_km_long_rwf: null }, { weightKg: 4000, distanceKm: 98.125 });
    // Charging the city rate for 132km of open road is what put this trip
    // 30% above anything anyone in Rwanda pays for it.
    assert.ok(q.totalRwf < noTaper.totalRwf, 'the taper must reduce a long run');
    assert.ok(q.totalRwf <= 260000, `4t to Rubavu priced at ${q.totalRwf}, above the 150,000-250,000 quoted`);
});

test('terrain is charged on the open road only, never on the city stretch', () => {
    const flatCity = quote({ ...TRUCK, terrain_fuel_factor: 1 }, { weightKg: 3000, distanceKm: 10 });
    const hillyCity = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(flatCity.fuelRwf, hillyCity.fuelRwf, 'a run across Kigali must not pay for hills it never climbs');

    const flatLong = quote({ ...TRUCK, terrain_fuel_factor: 1 }, { weightKg: 4000, distanceKm: 98.125 });
    const hillyLong = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.ok(hillyLong.fuelRwf > flatLong.fuelRwf, 'the climb out of Kigali must be charged');
});

test('a rate card predating the route factors prices exactly as it did', () => {
    const legacy = { ...VAN };
    const q = quote(legacy, { weightKg: 200, distanceKm: 10 });
    assert.equal(q.openRoadKm, 0, 'no taper column means no taper');
    assert.equal(q.returnsEmpty, false, 'no return column means no empty leg');
    assert.equal(q.totalRwf, 19083, 'unchanged from before the columns existed');
});

test('detention is free for an hour, then charged by the minute', () => {
    assert.equal(detentionCharge(TRUCK, 45).detentionRwf, 0, 'inside the free hour');
    assert.equal(detentionCharge(TRUCK, 60).detentionRwf, 0, 'exactly the free hour');

    // 8,500 an hour is what a truck driver's time is worth on the road, from
    // 76,500 a day over nine hours.
    assert.equal(detentionCharge(TRUCK, 120).detentionRwf, 8500, 'one chargeable hour');
    assert.equal(detentionCharge(TRUCK, 90).chargeableMinutes, 30);
    assert.equal(detentionCharge(TRUCK, 90).detentionRwf, 4250, 'half an hour, not rounded up to a whole one');
});

test('detention refuses nonsense and costs nothing without a rate', () => {
    assert.throws(() => detentionCharge(TRUCK, -5), PricingError);
    assert.throws(() => detentionCharge(TRUCK, 'ages'), PricingError);
    assert.equal(detentionCharge({}, 300).detentionRwf, 0, 'a card with no detention rate charges none');
});

// ── Corridors ────────────────────────────────────────────────────────────

test('a corridor overrides the card, so the eastern plain pays no mountain fuel', () => {
    // Same trip, same distance, different direction out of Kigali. Rwamagana
    // is 91 degrees onto the Akagera plain; Musanze is 316 and climbs.
    const east = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125, terrainFactor: 1.0 });
    const north = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });

    assert.equal(east.terrainFactor, 1.0);
    assert.equal(north.terrainFactor, 1.2);
    assert.ok(east.fuelRwf < north.fuelRwf, 'a flat run must burn less than a climb');
    assert.ok(east.totalRwf < north.totalRwf, 'and must cost the customer less');

    // The whole difference reaches the driver: fuel sits outside the
    // commission base, so a flatter route does not change what the platform
    // takes -- it just stops overcharging for hills that are not there.
    assert.equal(east.platformFeeRwf, north.platformFeeRwf);
});

test('a corridor cannot make a city job cheaper, because terrain never applied there', () => {
    const flat = quote(TRUCK, { weightKg: 3000, distanceKm: 10, terrainFactor: 1.0 });
    const hilly = quote(TRUCK, { weightKg: 3000, distanceKm: 10 });
    assert.equal(flat.totalRwf, hilly.totalRwf, 'nothing beyond the city means nothing to adjust');
});

test('an unknown corridor climbs, which is the safe default here', () => {
    // corridorFor returns null when nothing matches, and null must mean "use
    // the card" rather than "no terrain" -- most of Rwanda is hills, so
    // guessing flat would undercharge and the driver would absorb it.
    const unknown = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125, terrainFactor: null });
    const carded = quote(TRUCK, { weightKg: 4000, distanceKm: 98.125 });
    assert.equal(unknown.totalRwf, carded.totalRwf);
    assert.equal(unknown.terrainFactor, 1.2);
});

test('a nonsense terrain factor is refused rather than priced', () => {
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: 0 }), PricingError);
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: -1 }), PricingError);
    assert.throws(() => quote(TRUCK, { weightKg: 100, distanceKm: 50, terrainFactor: 'steep' }), PricingError);
});
