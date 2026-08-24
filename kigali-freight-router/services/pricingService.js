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
// the weight they did give. The top band stays open-ended on purpose: a
// dispatcher entering a 20-tonne job that was quoted by hand still needs the
// Heavy Hauler card to price it against, and refusing the class here would
// only move the problem.
export const WEIGHT_CLASS_BANDS = [
    { maxKg: 1000, vehicleClass: 'Light Van' },
    { maxKg: 8000, vehicleClass: 'Medium Truck' },
    { maxKg: Infinity, vehicleClass: 'Heavy Hauler' },
];

// The heaviest load the site is allowed to price on its own.
//
// The bands above will happily class a 30-tonne load as a Heavy Hauler and
// return a confident figure for it. The heaviest vehicle actually on the
// fleet carries 12 tonnes, so that figure was a promise nothing could keep
// -- quoted instantly, accepted, and then discovered to be undeliverable by
// whichever dispatcher opened it. Above this line the public site stops
// guessing and asks the customer to talk to us, which is what the published
// rate card already tells them happens.
//
// This is a fleet fact, not a pricing one. If a larger vehicle is bought,
// raise it; `npm run check:fleet-capacity` fails while it claims more than
// the fleet can carry. Deliberately NOT read from the vehicles table at
// request time: quotes that change because a lorry went in for repair are
// worse than a number that is occasionally conservative.
export const MAX_SELF_SERVICE_KG = 12000;

/** Whether a load is beyond what the site may price without a person.
 *  Non-numeric and out-of-range weights are somebody else's error to
 *  report, so they are not claimed here. */
export function needsManualQuote(weightKg) {
    const n = Number(weightKg);
    return Number.isFinite(n) && n > MAX_SELF_SERVICE_KG;
}

export function classForWeight(weightKg) {
    const n = Number(weightKg);
    if (!Number.isFinite(n) || n <= 0) {
        throw new PricingError(`Cannot choose a vehicle class for weight ${JSON.stringify(weightKg)}.`);
    }
    return WEIGHT_CLASS_BANDS.find((band) => n <= band.maxKg).vehicleClass;
}

// A column an older rate row predates. Missing means "no adjustment", never
// zero -- a rate card written before terrain existed must price exactly as it
// always did rather than silently multiplying its fuel by nothing.
function optionalNumber(value, label, fallback) {
    if (value === undefined || value === null) return fallback;
    return requireFiniteNumber(value, label);
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
export function quote(rate, { weightKg, distanceKm = null, terrainFactor = null }) {
    if (!rate) throw new PricingError('No rate card supplied.');

    const baseFare = requireFiniteNumber(rate.base_fare, 'base_fare');
    const perKm = requireFiniteNumber(rate.per_km, 'per_km');
    const perKg = requireFiniteNumber(rate.per_kg, 'per_kg');
    const minimumFare = requireFiniteNumber(rate.minimum_fare, 'minimum_fare');
    const litresPer100 = requireFiniteNumber(rate.fuel_litres_per_100km, 'fuel_litres_per_100km');
    const dieselPrice = requireFiniteNumber(rate.fuel_price_per_litre, 'fuel_price_per_litre');
    const commissionPct = requireFiniteNumber(rate.platform_commission_pct, 'platform_commission_pct');
    const minimumFee = requireFiniteNumber(rate.platform_minimum_fee, 'platform_minimum_fee');

    const weight = requireFiniteNumber(weightKg, 'weightKg');
    if (weight < 0) throw new PricingError('weightKg cannot be negative.');

    // A public booking has only free-text addresses, so there is no distance
    // until a dispatcher places the order. Pricing on zero distance would
    // quote a customer a number no journey can be done for, so an estimate
    // charges the distance-independent parts only and is flagged as such.
    const isEstimate = distanceKm === null || distanceKm === undefined;
    const measured = isEstimate ? 0 : requireFiniteNumber(distanceKm, 'distanceKm');
    if (measured < 0) throw new PricingError('distanceKm cannot be negative.');

    // What arrives here is straight-line distance -- ST_DistanceSphere between
    // two points -- and no vehicle travels in a straight line. Kigali's hills
    // and one-ways made one measured route 1.67x its crow's flight, so pricing
    // on the raw figure charged for about 40% less road than the driver
    // actually covers, in the per-km line and in the fuel alike. Both are
    // charged on the corrected distance because the driver drives all of it.
    const roadFactor = rate.road_distance_factor === undefined || rate.road_distance_factor === null
        ? 1
        : requireFiniteNumber(rate.road_distance_factor, 'road_distance_factor');
    if (roadFactor <= 0) throw new PricingError('road_distance_factor must be positive.');
    const distance = measured * roadFactor;

    // The city stretch and the stretch beyond it are different jobs and cost
    // different amounts, so they are charged separately rather than averaged.
    const taperAfter = optionalNumber(rate.taper_after_km, 'taper_after_km', Infinity);
    const perKmLong = rate.per_km_long == null
        ? perKm
        : requireFiniteNumber(rate.per_km_long, 'per_km_long');
    const cityKm = Math.min(distance, taperAfter);
    const openRoadKm = Math.max(0, distance - taperAfter);

    // Fuel on the open road carries the terrain penalty; the flat run across
    // Kigali should not be charged for hills it never climbs.
    // The corridor wins over the rate card when one is known. The card assumes
    // any run leaving Kigali is climbing, which is true of most of Rwanda and
    // wrong for the eastern plain -- charging those runs a mountain penalty
    // overcharges the customer for hills that are not there.
    const effectiveTerrain = terrainFactor == null
        ? optionalNumber(rate.terrain_fuel_factor, 'terrain_fuel_factor', 1)
        : requireFiniteNumber(terrainFactor, 'terrainFactor');
    if (effectiveTerrain <= 0) throw new PricingError('terrainFactor must be positive.');
    const litrePerKm = litresPer100 / 100;
    const fuelOut = (cityKm * litrePerKm * dieselPrice)
        + (openRoadKm * litrePerKm * dieselPrice * effectiveTerrain);

    // Past the city the driver comes back with nothing to carry, and that
    // fuel is as real as the fuel going out. Inside it they pick up the next
    // job where they finished, so there is nothing to charge for.
    const returnBeyond = optionalNumber(rate.return_leg_beyond_km, 'return_leg_beyond_km', Infinity);
    // Where the share reaches its full value. Defaults to the start point,
    // which reproduces the old switch exactly — so a card that predates this
    // column prices identically rather than silently changing under a
    // customer who was already quoted.
    const returnFull = optionalNumber(rate.return_leg_full_km, 'return_leg_full_km', returnBeyond);
    const returnsEmpty = distance > returnBeyond;
    // Not the whole leg. The full cost works out at a ~50% uplift and the
    // market only carries 20-40%, so charging all of it would price above
    // every operator in Rwanda. What is left over is what a matched return
    // load covers -- and finding that load is the point of the platform.
    const returnShare = optionalNumber(rate.return_leg_share_pct, 'return_leg_share_pct', 100) / 100;

    // Ramped in, not switched on.
    //
    // This used to be all-or-nothing at returnBeyond, which made two
    // deliveries ten metres apart differ by over five thousand francs. The
    // switch was modelling the wrong thing: whether a driver returns empty is
    // not a fact that changes at a line on the map, it is a likelihood that
    // falls away with distance from the market they load in.
    //
    // Between the two anchors the share grows linearly, so the charge grows
    // twice over — the leg is longer AND the odds of filling it are worse —
    // which is the shape the underlying cost actually has.
    //
    // The band collapses to the old behaviour when returnFull equals
    // returnBeyond, which is what an un-migrated card does.
    const band = returnFull - returnBeyond;
    const rampedShare = band > 0
        ? returnShare * Math.min(1, Math.max(0, (distance - returnBeyond) / band))
        : returnShare;
    const fuelReturn = returnsEmpty ? fuelOut * rampedShare : 0;

    const fuel = fuelOut + fuelReturn;
    const service = baseFare + cityKm * perKm + openRoadKm * perKmLong + weight * perKg;

    const subtotal = fuel + service;
    const total = Math.max(subtotal, minimumFare);

    // The floor applies to the fee, not to the fare, so a job lifted to the
    // minimum fare does not also inflate the platform's cut.
    const fee = Math.max(service * (commissionPct / 100), minimumFee);

    // A fee can never exceed the fare: on a minimum-fare job with a tiny
    // service component the floor could otherwise leave the driver owing
    // money. The driver's side is what gives way last.
    const cappedFee = Math.min(fee, total);

    // Rounded to whatever the currency actually has. RWF has no minor unit, so
    // whole francs is right; cedis have pesewas and shillings have cents, and
    // rounding those to whole units quietly overcharges the customer or
    // underpays the driver on every job.
    //
    // Rounded once, then the driver's share is what is left. Rounding total
    // and fee separately and deriving the net from the unrounded pair let the
    // three disagree by a unit -- money that does not add up, which is the one
    // thing a price breakdown may never do.
    const minorUnits = optionalNumber(rate.currency_minor_units, 'currency_minor_units', 0);
    const step = 10 ** minorUnits;
    const toMoney = (value) => Math.round(value * step) / step;

    const totalRounded = toMoney(total);
    const feeRounded = toMoney(cappedFee);

    return {
        // From the card, not a constant. A market's rates and the currency
        // they are in are the same fact, and hardcoding one of them here is
        // how a Ghanaian total ends up labelled in francs.
        currency: rate.currency || 'RWF',
        vehicleClass: rate.vehicle_class,
        pricingRateId: rate.id ?? null,
        isEstimate,
        // The corrected distance, because that is what was charged for. The
        // straight-line figure it came from is not kept: it is an artefact of
        // how the two points were measured, not a fact about the journey.
        distanceKm: isEstimate ? null : Number(distance.toFixed(3)),
        weightKg: weight,
        fuelAmount: toMoney(fuel),
        // Broken out so a driver asking why an upcountry job costs what it
        // does can be told, and so dispatch can see the empty leg rather than
        // wondering why the same distance priced differently.
        returnLegAmount: toMoney(fuelReturn),
        returnsEmpty,
        openRoadKm: Number(openRoadKm.toFixed(3)),
        terrainFactor: effectiveTerrain,
        serviceAmount: toMoney(service),
        totalAmount: totalRounded,
        platformFee: feeRounded,
        driverNet: totalRounded - feeRounded,
        minimumFareApplied: subtotal < minimumFare,
        minimumFeeApplied: service * (commissionPct / 100) < minimumFee,
        // Not charged here -- detention is worked out at delivery, once the
        // wait is known. Carried on the quote so a customer can be told the
        // terms before they book rather than discovering them on the bill.
        freeWaitingMinutes: optionalNumber(rate.detention_free_minutes, 'detention_free_minutes', 60),
        detentionPerHour: toMoney(optionalNumber(rate.detention_per_hour, 'detention_per_hour', 0)),
    };
}

/**
 * What the platform actually keeps once the cost of running the job is out.
 * Separated from quote() because it answers a different question — quote()
 * is what the customer and driver are told, this is whether the job was
 * worth doing.
 */
export function platformMargin(quoted, { smsCount = 2, smsCost = 14, momoFeePct = 1.0 }) {
    const sms = smsCount * smsCost;
    const momo = quoted.totalAmount * (momoFeePct / 100);
    return {
        platformFee: quoted.platformFee,
        smsCost: round(sms),
        momoFee: round(momo),
        netToPlatform: round(quoted.platformFee - sms - momo),
    };
}

/**
 * What a driver is owed for being kept waiting.
 *
 * A job priced by distance pays nothing for the hour spent at a warehouse
 * gate, which is why drivers charge for it themselves past roughly an hour.
 * The hourly figure on the rate card is derived from what a driver of that
 * class reports clearing in a day over a nine-hour working day, so this is
 * the same money their time is worth on the road.
 *
 * Charged in whole minutes past the free period rather than in blocks: a
 * driver held for 61 minutes and one held for 89 have not waited the same
 * amount, and rounding both up to an hour invites an argument at the gate.
 */
export function detentionCharge(rate, waitedMinutes) {
    const waited = requireFiniteNumber(waitedMinutes, 'waitedMinutes');
    if (waited < 0) throw new PricingError('waitedMinutes cannot be negative.');

    const freeMinutes = optionalNumber(rate?.detention_free_minutes, 'detention_free_minutes', 60);
    const perHour = optionalNumber(rate?.detention_per_hour, 'detention_per_hour', 0);

    const chargeable = Math.max(0, waited - freeMinutes);
    return {
        waitedMinutes: waited,
        freeMinutes,
        chargeableMinutes: chargeable,
        detentionAmount: round((chargeable / 60) * perHour),
    };
}
