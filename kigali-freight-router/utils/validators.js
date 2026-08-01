// Small, shared numeric-field checks. Several "create a thing with a
// location" endpoints (orders, stops) previously only checked that
// lat/lng/weight fields were present (`!== undefined`), not that they
// were actually valid numbers in a sane range — a non-numeric or
// wildly-out-of-range value would sail through the controller and only
// get rejected (or silently accepted) at the database column-type level,
// producing a confusing raw DB error instead of a clear 400.

export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isValidLat(value) {
    return isFiniteNumber(value) && value >= -90 && value <= 90;
}

export function isValidLng(value) {
    return isFiniteNumber(value) && value >= -180 && value <= 180;
}

// Positive, finite, and below a generous sanity ceiling — this app deals
// in road-freight parcels/pallets, not shipping containers, so a request
// for a multi-million-kg "delivery" is a client bug, not a real order.
export function isValidWeightKg(value, maxKg = 50000) {
    return isFiniteNumber(value) && value > 0 && value <= maxKg;
}

export function isValidDemand(value, maxDemand = 100000) {
    return isFiniteNumber(value) && value > 0 && value <= maxDemand;
}
