-- Where a place name is, learned once and reused.
--
-- Eighty of the 131 pending orders have never been placed on the map, and
-- placing them by hand is the single biggest bottleneck in this operation.
-- Nominatim can help, but not the way it first appears: measured against the
-- real backlog it resolves Kigali's sectors and not its landmarks. "Gikondo"
-- resolves; "Gikondo depot gate 3" does not. "Kimironko" resolves; "Kimironko
-- Market, Shop 14" does not.
--
-- That is not precise enough to place a delivery -- a sector centroid can sit
-- most of a kilometre from the actual gate, and offering it as a confirmable
-- pin would be worse than offering nothing, because a dispatcher does not
-- re-check something that already looks done. It is precise enough to open
-- the map on the right neighbourhood, which is where the eighty repetitions
-- of panning from a default view actually go.
--
-- Keyed on the address phrase rather than cached per order, because the
-- backlog's 160 address lines are only 9 distinct phrases. Per-order storage
-- would hold 160 rows, spend 160 throttled requests, and learn nothing the
-- next batch could reuse. Nine rows covers all of it, and every future
-- booking that says "Remera" is free.
--
-- (That 160-to-9 ratio is measured on what is in this database, which is
-- largely seeded. The shape is right at any ratio -- an address phrase is
-- reusable and an order id is not -- but the multiple should not be quoted
-- as though it came from real customer traffic.)
CREATE TABLE IF NOT EXISTS place_hints (
    -- The address phrase, lowercased and whitespace-collapsed. Primary key
    -- because the whole point is one lookup per distinct phrase, ever.
    token TEXT PRIMARY KEY,

    -- NULL when the phrase could not be resolved. A miss is an answer and is
    -- cached like one -- otherwise a name Nominatim will never know gets
    -- retried on every sweep forever.
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,

    -- What actually resolved, which is usually shorter than the token. The
    -- resolver strips trailing words until something matches, so "gikondo
    -- depot gate 3" is stored under its full phrase with resolved_from
    -- "gikondo" -- that is the honest record of how approximate the point is.
    resolved_from TEXT,
    label TEXT,
    source TEXT NOT NULL DEFAULT 'nominatim',

    miss_count INTEGER NOT NULL DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sweeps look for what has never been tried, or what missed a while ago.
CREATE INDEX IF NOT EXISTS idx_place_hints_unresolved
    ON place_hints (updated_at) WHERE lat IS NULL;
