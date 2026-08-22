// One throttle, shared by everything that talks to Nominatim.
//
// The interval state used to live inside geocodeController, which was fine
// while a dispatcher typing in a search box was the only caller. Place-hint
// resolution is a second caller, and two independent throttles would let the
// two of them together exceed one request a second -- which is the usage
// policy this backend depends on to keep using the free service at all.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

// The market's box, and a hard limit rather than a ranking hint.
//
// This used to pass bounded=0 -- bias the ranking towards Kigali but allow
// results from anywhere -- and the reasoning did not survive contact with a
// vague query. Resolving the phrase "industrial zone" returned a confident
// point in Ramat HaSharon, Israel, because nothing in Rwanda matched and
// Nominatim was free to answer from the rest of the planet. For a dispatch
// board whose every pickup and delivery is in one country, a result outside
// it is not a worse answer, it is a wrong one.
//
// So the country is constrained too. countrycodes is the strong filter;
// the bounded viewbox narrows further to the operating area within it.
const MARKET_COUNTRY_CODE = (process.env.MARKET_COUNTRY_CODE || 'RW').toLowerCase();
// west,north,east,south -- Kigali and its approaches by default.
const MARKET_VIEWBOX = process.env.MARKET_VIEWBOX || '29.9,-2.05,30.35,-1.8';

// Nominatim honours bounded=1, but a result landing outside the box would be
// silently wrong rather than loudly broken, so it is checked here as well.
const [west, north, east, south] = MARKET_VIEWBOX.split(',').map(Number);
function insideMarket(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= Math.min(north, south) && lat <= Math.max(north, south)
        && lng >= Math.min(west, east) && lng <= Math.max(west, east);
}

export async function geocodeSearch(query, { limit = 5 } = {}) {
    const q = String(query || '').trim();
    if (q.length < 3) return [];

    const waitMs = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();

    const params = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: String(limit),
        viewbox: MARKET_VIEWBOX,
        bounded: '1',
        countrycodes: MARKET_COUNTRY_CODE,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'InziraDispatch/1.0 (internal dispatch tool)' },
    });
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data
        .map((item) => ({ label: item.display_name, lat: parseFloat(item.lat), lng: parseFloat(item.lon) }))
        .filter((hit) => insideMarket(hit.lat, hit.lng));
}
