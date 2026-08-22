// Where a place name is, for the map the dispatcher is about to open.
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';
import { lookupHints, resolveToken, unresolvedTokensForBacklog } from '../services/placeHintService.js';

// A sweep is throttled at roughly a second a request, so a single call has to
// be bounded or it becomes a request that never returns. Twenty-five is about
// thirty seconds and covers the whole current backlog in one go.
const MAX_PER_SWEEP = 25;

export const PlaceHintController = {
    // GET /api/place-hints?token=Remera&token=Nyamirambo,+Rugenge+Street
    //
    // One repeated parameter per place, NOT one comma-separated list. Rwandan
    // address lines contain commas -- "Nyamirambo, Rugenge Street" is one
    // place -- so splitting on them tore real addresses into halves that were
    // never stored under either name, and a place that had been resolved read
    // back as never tried.
    //
    // Cache only. Never geocodes, so it is always instant -- a UI must not sit
    // behind a throttled external service, and a hint is a convenience rather
    // than something the screen cannot open without.
    lookup: async (req, res) => {
        try {
            const raw = req.query.token;
            const tokens = (Array.isArray(raw) ? raw : [raw])
                .filter((t) => typeof t === 'string')
                .map((t) => t.trim())
                .filter(Boolean);
            if (tokens.length === 0) return ok(res, { hints: {} });
            if (tokens.length > 100) {
                return fail(res, { status: 400, code: 'PLACE_HINTS_TOO_MANY', message: 'Ask for at most 100 at a time.' });
            }
            return ok(res, { hints: await lookupHints(tokens) });
        } catch (error) {
            logError(req, 'Place hint lookup failed', error);
            return fail(res, { status: 500, code: 'PLACE_HINTS_FAILED', message: 'Could not read the place hints.' });
        }
    },

    // POST /api/place-hints/warm
    //
    // Resolves phrases that have never been tried. Explicit rather than
    // automatic: it spends the geocoder's throttle, and something that slow
    // should happen because somebody asked, not as a side effect of opening a
    // screen.
    warm: async (req, res) => {
        try {
            const pending = await unresolvedTokensForBacklog();
            const batch = pending.slice(0, MAX_PER_SWEEP);
            const resolved = [];
            for (const token of batch) {
                const row = await resolveToken(token);
                if (row) resolved.push({ token: row.token, found: row.lat !== null, resolvedFrom: row.resolved_from });
            }
            return ok(res, {
                attempted: batch.length,
                found: resolved.filter((r) => r.found).length,
                remaining: Math.max(0, pending.length - batch.length),
                resolved,
            });
        } catch (error) {
            logError(req, 'Place hint warm failed', error);
            return fail(res, { status: 500, code: 'PLACE_HINTS_WARM_FAILED', message: 'Could not resolve those places.' });
        }
    },
};
