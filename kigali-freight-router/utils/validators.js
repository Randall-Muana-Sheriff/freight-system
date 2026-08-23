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

// The market's own bounding box, for coordinates that arrive from the public
// internet rather than from a dispatcher's map click.
//
// isValidLat/isValidLng only say "this is a number on Earth", which is the
// right check for a trusted caller and far too generous for an untrusted
// one: a booking form could otherwise pin a Kigali delivery to the middle of
// the Pacific and the system would carry the number all the way through to a
// distance, a price and a driver's map.
//
// Read from MARKET_VIEWBOX so it moves with the market rather than being a
// second, drifting definition of where this business operates. Same
// west,north,east,south order the geocoder uses, and padded a little: the
// geocoder's box is tuned for search relevance around Kigali, while a real
// delivery may legitimately sit outside it and still be in Rwanda.
const MARKET_BOX = (process.env.MARKET_VIEWBOX || '29.9,-2.05,30.35,-1.8')
    .split(',').map(Number);
const BOX_PADDING_DEGREES = Number(process.env.MARKET_BOX_PADDING || 1.5);

export function isWithinMarket(lat, lng) {
    if (!isValidLat(lat) || !isValidLng(lng)) return false;
    const [west, north, east, south] = MARKET_BOX;
    if (![west, north, east, south].every(Number.isFinite)) return true;
    const minLat = Math.min(north, south) - BOX_PADDING_DEGREES;
    const maxLat = Math.max(north, south) + BOX_PADDING_DEGREES;
    const minLng = Math.min(west, east) - BOX_PADDING_DEGREES;
    const maxLng = Math.max(west, east) + BOX_PADDING_DEGREES;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}
