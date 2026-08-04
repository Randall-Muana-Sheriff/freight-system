import { ok, fail, errorMessage } from '../utils/httpResponse.js';

// Nominatim's usage policy caps free/anonymous use at ~1 request/second and
// requires a descriptive User-Agent identifying the calling application.
// This single-process throttle plus the header below keep this backend a
// good citizen of that free service rather than needing a paid geocoder.
const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

// Loosely centered on Kigali so local place names rank above unrelated
// same-named places elsewhere in the world, without excluding results
// outside the box entirely (bounded=0).
const KIGALI_VIEWBOX = '29.9,-2.05,30.35,-1.8';

export const GeocodeController = {
    // GET /api/geocode/search?q=...
    search: async (req, res) => {
        const query = (req.query.q || '').trim();
        if (query.length < 3) return ok(res, { results: [] });

        const waitMs = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastRequestAt = Date.now();

        try {
            const params = new URLSearchParams({
                q: query,
                format: 'jsonv2',
                limit: '5',
                viewbox: KIGALI_VIEWBOX,
                bounded: '0',
            });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                headers: { 'User-Agent': 'InziraDispatch/1.0 (internal dispatch tool)' },
            });
            const data = await response.json();
            const results = Array.isArray(data)
                ? data.map((item) => ({
                      label: item.display_name,
                      lat: parseFloat(item.lat),
                      lng: parseFloat(item.lon),
                  }))
                : [];
            return ok(res, { results });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'GEOCODE_SEARCH_FAILED',
                message: errorMessage(err, 'Failed to search for that address.'),
            });
        }
    },
};
