// One throttle, shared by everything that talks to Nominatim.
//
// The interval state used to live inside geocodeController, which was fine
// while a dispatcher typing in a search box was the only caller. Place-hint
// resolution is a second caller, and two independent throttles would let the
// two of them together exceed one request a second -- which is the usage
// policy this backend depends on to keep using the free service at all.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

// Loosely centred on Kigali so local place names rank above unrelated
// same-named places elsewhere in the world, without excluding results outside
// the box entirely (bounded=0).
const KIGALI_VIEWBOX = '29.9,-2.05,30.35,-1.8';

export async function geocodeSearch(query, { limit = 5 } = {}) {
    const q = String(query || '').trim();
    if (q.length < 3) return [];

    const waitMs = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();

    const params = new URLSearchParams({
        q, format: 'jsonv2', limit: String(limit), viewbox: KIGALI_VIEWBOX, bounded: '0',
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'InziraDispatch/1.0 (internal dispatch tool)' },
    });
    const data = await response.json();
    return Array.isArray(data)
        ? data.map((item) => ({ label: item.display_name, lat: parseFloat(item.lat), lng: parseFloat(item.lon) }))
        : [];
}
