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
