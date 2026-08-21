import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, platformMargin, PricingError } from '../services/pricingService.js';

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
