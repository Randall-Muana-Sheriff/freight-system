// The one definition of "these two address lines are the same place".
//
// Pure and dependency-free on purpose: the SQL in placeHintService's backlog
// query normalises the same way, and the two must agree exactly or the sweep
// resolves one spelling while the UI asks for another and the cache never
// hits. Keeping this out of the service module lets both the service and a
// database-free test import it.
//
// Lowercase, punctuation to spaces, collapse whitespace. Digits are kept:
// "Kacyiru House 22" and "Kacyiru House 23" are different addresses.
export function normalizeToken(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Every phrase worth trying for one address line, longest first.
 *
 * Contiguous windows, not just prefixes. An address line carries noise at both
 * ends -- "e2e gikondo industrial zone" has a test prefix and a generic suffix
 * wrapped around the only real place name in it -- and a walk that only trims
 * one end can never reach a word in the middle. Trimming tails alone sent
 * production to "e2e"; trimming both ends sent it to "industrial zone", which
 * Nominatim answered with a point in Israel. Neither could see "gikondo".
 *
 * Longest first, because a longer phrase is more specific and a match on it is
 * worth more than a match on a fragment. Left to right within a length, since
 * the front of an address line is more often the place than the back.
 *
 * This is quadratic in words, which is affordable only because the stop-list
 * below discards most of the short windows and resolveToken caps how many are
 * ever tried. Each one costs a second of a shared throttle.
 */
export function candidatePhrases(token) {
    const words = token.split(' ').filter(Boolean);
    const out = [];
    for (let len = words.length; len > 0; len -= 1) {
        for (let start = 0; start + len <= words.length; start += 1) {
            out.push(words.slice(start, start + len).join(' '));
        }
    }
    return [...new Set(out)]
        // Two characters is not a place name, it is an abbreviation the
        // geocoder will match to something arbitrary. Counted without spaces,
        // or "a b" reads as three characters and survives. Kigali road names
        // like "KK 31" are four and correctly do not.
        .filter((p) => p.replace(/\s/g, '').length >= 3)
        .filter(namesSomewhere);
}

// The words that make a phrase an address rather than a place.
//
// Measured, not guessed. Walking "e2e gikondo industrial zone" down its
// fragments reached "industrial zone" and then "zone", and Nominatim answered
// "zone" with Kigali's Free Trade Zone -- a real place, arrived at by luck,
// standing in for an address it has nothing to do with. Every fragment that
// went wrong was made only of words like these.
//
// Filtering the geocoder's *results* instead does not work: its top hit for
// "gikondo" is a hospital and for "nyabugogo" a river, so a filter on result
// category rejects the good matches and keeps the bad ones. The signal is in
// the query, not the answer.
const GENERIC_ADDRESS_WORDS = new Set([
    'depot', 'gate', 'zone', 'industrial', 'market', 'street', 'st', 'road', 'rd',
    'avenue', 'ave', 'house', 'shop', 'centre', 'center', 'block', 'plot', 'building',
    'warehouse', 'park', 'yard', 'store', 'office', 'floor', 'unit', 'no', 'near',
    'opposite', 'behind', 'next', 'to', 'the', 'at', 'by',
]);

// True when a phrase contains at least one word that could name a place --
// something that is neither a generic address word nor a bare number.
function namesSomewhere(phrase) {
    return phrase.split(' ').some(
        (w) => w && !GENERIC_ADDRESS_WORDS.has(w) && !/^\d+$/.test(w)
    );
}
