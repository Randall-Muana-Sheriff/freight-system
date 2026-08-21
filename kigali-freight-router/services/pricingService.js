// Turns a rate card row plus the facts of a job into money.
//
// Deliberately pure: no database, no clock, no config lookups. Everything it
// needs arrives as arguments, so the arithmetic can be tested exhaustively
// and a quote can be recomputed from a stored pricing_rate_id at any time to
// explain a charge to a customer or a driver.
//
// The shape of the calculation, and why:
//
//   fuel    = distance x consumption x the RURA diesel price
//   service = base + (distance x per_km) + (weight x per_kg)
//   total   = max(fuel + service, minimum_fare)
//   fee     = max(service x commission_pct, platform_minimum_fee)
//   driver  = total - fee
//
// Fuel is separated from service and excluded from the commission base. That
// is the whole point of the split. Rwandan diesel is set nationally and rose
// 66% in the year to August 2026; commissioning it would have handed the
// platform an automatic 66% raise while the driver absorbed every franc of
// the increase. Keeping fuel as a pass-through means a fuel shock moves the
// customer's price and the driver's reimbursement together, and leaves the
// platform's cut where it was.
//
// The fee has a floor as well as a rate, because a percentage of a small job
// does not cover what a job costs to run: an SMS to the customer, the MoMo
// collection fee, storage for the proof-of-delivery photo, a share of
// hosting. Without the floor the platform loses money per job on precisely
// the short local runs it most wants.

export class PricingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PricingError';
    }
}

const round = (value) => Math.round(value);

// Which rate card a job falls under. Neither the public booking form nor the
// dispatcher's order form asks for a vehicle class -- a customer knows what
// they are shipping, not what it needs to travel in -- so it is derived from
// the weight they did give. The top band is open-ended because
// isValidWeightKg caps an order at 50 tonnes, and everything from 8t to that
// cap is a Heavy Hauler job.
export const WEIGHT_CLASS_BANDS = [
    { maxKg: 1000, vehicleClass: 'Light Van' },
    { maxKg: 8000, vehicleClass: 'Medium Truck' },
    { maxKg: Infinity, vehicleClass: 'Heavy Hauler' },
];

export function classForWeight(weightKg) {
    const n = Number(weightKg);
    if (!Number.isFinite(n) || n <= 0) {
        throw new PricingError(`Cannot choose a vehicle class for weight ${JSON.stringify(weightKg)}.`);
    }
    return WEIGHT_CLASS_BANDS.find((band) => n <= band.maxKg).vehicleClass;
}

function requireFiniteNumber(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new PricingError(`${label} must be a finite number, got ${JSON.stringify(value)}`);
    return n;
}

/**
 * @param {object} rate  a pricing_rates row
 * @param {object} job   { weightKg, distanceKm }  distanceKm null => estimate
 * @returns {object} a full breakdown, every figure in whole RWF
 */
export function quote(rate, { weightKg, distanceKm = null }) {
    if (!rate) throw new PricingError('No rate card supplied.');

    const baseFare = requireFiniteNumber(rate.base_fare_rwf, 'base_fare_rwf');
    const perKm = requireFiniteNumber(rate.per_km_rwf, 'per_km_rwf');
    const perKg = requireFiniteNumber(rate.per_kg_rwf, 'per_kg_rwf');
    const minimumFare = requireFiniteNumber(rate.minimum_fare_rwf, 'minimum_fare_rwf');
    const litresPer100 = requireFiniteNumber(rate.fuel_litres_per_100km, 'fuel_litres_per_100km');
    const dieselPrice = requireFiniteNumber(rate.diesel_price_rwf_per_litre, 'diesel_price_rwf_per_litre');
    const commissionPct = requireFiniteNumber(rate.platform_commission_pct, 'platform_commission_pct');
    const minimumFee = requireFiniteNumber(rate.platform_minimum_fee_rwf, 'platform_minimum_fee_rwf');

    const weight = requireFiniteNumber(weightKg, 'weightKg');
    if (weight < 0) throw new PricingError('weightKg cannot be negative.');

    // A public booking has only free-text addresses, so there is no distance
    // until a dispatcher places the order. Pricing on zero distance would
    // quote a customer a number no journey can be done for, so an estimate
    // charges the distance-independent parts only and is flagged as such.
    const isEstimate = distanceKm === null || distanceKm === undefined;
    const distance = isEstimate ? 0 : requireFiniteNumber(distanceKm, 'distanceKm');
    if (distance < 0) throw new PricingError('distanceKm cannot be negative.');

    const fuel = (distance / 100) * litresPer100 * dieselPrice;
    const service = baseFare + distance * perKm + weight * perKg;

    const subtotal = fuel + service;
    const total = Math.max(subtotal, minimumFare);

    // The floor applies to the fee, not to the fare, so a job lifted to the
    // minimum fare does not also inflate the platform's cut.
    const fee = Math.max(service * (commissionPct / 100), minimumFee);

    // A fee can never exceed the fare: on a minimum-fare job with a tiny
    // service component the floor could otherwise leave the driver owing
    // money. The driver's side is what gives way last.
    const cappedFee = Math.min(fee, total);

    return {
        currency: 'RWF',
        vehicleClass: rate.vehicle_class,
        pricingRateId: rate.id ?? null,
        isEstimate,
        distanceKm: isEstimate ? null : Number(distance.toFixed(3)),
        weightKg: weight,
        fuelRwf: round(fuel),
        serviceRwf: round(service),
        totalRwf: round(total),
        platformFeeRwf: round(cappedFee),
        driverNetRwf: round(total - cappedFee),
        minimumFareApplied: subtotal < minimumFare,
        minimumFeeApplied: service * (commissionPct / 100) < minimumFee,
    };
}

/**
 * What the platform actually keeps once the cost of running the job is out.
 * Separated from quote() because it answers a different question — quote()
 * is what the customer and driver are told, this is whether the job was
 * worth doing.
 */
export function platformMargin(quoted, { smsCount = 2, smsCostRwf = 14, momoFeePct = 1.0 }) {
    const sms = smsCount * smsCostRwf;
    const momo = quoted.totalRwf * (momoFeePct / 100);
    return {
        platformFeeRwf: quoted.platformFeeRwf,
        smsCostRwf: round(sms),
        momoFeeRwf: round(momo),
        netToPlatformRwf: round(quoted.platformFeeRwf - sms - momo),
    };
}
