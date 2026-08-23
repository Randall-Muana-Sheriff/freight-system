// Address suggestions for the booking form.
//
// This exists because of a pricing bug with an address cause. A customer
// types "Gikondo Industrial Zone, gate 3" as free text, nobody turns it into
// coordinates until a dispatcher does it hours later, and in the meantime
// the quote has no distance to price on — so it falls to the minimum fare,
// which measured 15 to 48 per cent below the real figure. The one person who
// knows where they mean is the one we were not asking.
//
// Two sources, in order of what they cost:
//   hint      already resolved, answered from Postgres, instant
//   geocoder  Nominatim, throttled to one request a second across the whole
//             process and shared with the dispatcher's own search
//
// Cached hints go first for the obvious reason and one less obvious one: a
// public autocomplete is a much bigger tap on Nominatim than a dispatcher
// typing occasionally, and the politeness policy this service depends on is
// not something to spend on somebody's held-down backspace key.
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import { searchHints } from '../services/placeHintService.js';
import { geocodeSearch } from '../services/geocodeService.js';

const MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 6;

export const PublicGeocodeController = {
    // GET /api/public/geocode?q=kimironko
    suggest: async (req, res) => {
        try {
            const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            // Below three characters every query matches half of Kigali, so
            // the answer is noise and the lookup is wasted.
            if (q.length < MIN_QUERY_LENGTH) return ok(res, { results: [] });

            const hints = await searchHints(q, { limit: MAX_RESULTS });
            if (hints.length >= 3) return ok(res, { results: hints });

            // Only what the cache could not answer reaches the geocoder.
            let geocoded = [];
            try {
                geocoded = await geocodeSearch(q, { limit: MAX_RESULTS - hints.length });
            } catch (error) {
                // A geocoder that is down or throttled must not break the
                // booking form. Whatever the cache knew is still useful, and
                // an empty list degrades to exactly the old behaviour: the
                // customer types free text and a dispatcher places it later.
                logError(req, 'Public geocode fell back to hints only', error);
            }

            const seen = new Set(hints.map((h) => h.label));
            const results = [
                ...hints,
                ...geocoded
                    .filter((g) => !seen.has(g.label))
                    .map((g) => ({ label: g.label, lat: g.lat, lng: g.lng, source: 'geocoder' })),
            ].slice(0, MAX_RESULTS);

            return ok(res, { results });
        } catch (error) {
            logError(req, 'Public geocode failed', error);
            // Still a 200 with nothing in it. A booking must never be blocked
            // by an address suggestion failing — the form falls back to plain
            // text, which is what it did before this endpoint existed.
            return ok(res, { results: [] });
        }
    },
};
