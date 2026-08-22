import { ok, fail, errorMessage } from '../utils/httpResponse.js';
import { geocodeSearch } from '../services/geocodeService.js';

// The throttle and the Nominatim call now live in services/geocodeService.js,
// shared with place-hint resolution. Two callers with two independent
// throttles would together exceed the one-request-a-second the free service
// allows, which is the sort of thing that gets an application blocked rather
// than warned.

export const GeocodeController = {
    // GET /api/geocode/search?q=...
    search: async (req, res) => {
        const query = (req.query.q || '').trim();
        if (query.length < 3) return ok(res, { results: [] });

        try {
            return ok(res, { results: await geocodeSearch(query) });
        } catch (err) {
            return fail(res, {
                status: 500,
                code: 'GEOCODE_SEARCH_FAILED',
                message: errorMessage(err, 'Failed to search for that address.'),
            });
        }
    },
};
