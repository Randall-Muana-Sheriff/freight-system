// Whether a proof-of-delivery was confirmed where it should have been.
//
// Three states, and the third is the point. `location_flagged` used to be a
// plain boolean, so a confirmation nobody could check — no delivery point on
// the order, or a driver whose phone never reported — was stored as FALSE and
// drawn exactly like a confirmation that was checked and passed. Fourteen
// rows in the local database asserted a check that never ran.
//
// The column is nullable now and those rows are NULL. This is the other half:
// a screen that still renders it with `flagged ? hazard : fine` reproduces the
// original bug in the UI, because null takes the same branch as false.
//
// Deliberately NOT a second alarm colour. An unchecked delivery is an absence
// of evidence, not evidence of a problem — treating it as a hazard would
// train dispatchers to ignore the real one.
export type ProofLocation = 'flagged' | 'confirmed' | 'unchecked';

export function proofLocation(proof: { location_flagged?: boolean | null }): ProofLocation {
    if (proof.location_flagged === true) return 'flagged';
    if (proof.location_flagged === false) return 'confirmed';
    return 'unchecked';
}

/** What to tell a dispatcher hovering the marker. */
export function proofLocationTitle(proof: {
    location_flagged?: boolean | null;
    distance_from_target_m?: number | null;
}): string {
    switch (proofLocation(proof)) {
        case 'flagged':
            return `Confirmed ${Math.round(proof.distance_from_target_m || 0)}m from the delivery point`;
        case 'confirmed':
            return 'Confirmed at the delivery point';
        case 'unchecked':
            // Says which of the two causes it was not, so nobody reads it as
            // a fault with the driver.
            return 'Location not checked. This order had no delivery point on the map, or the driver’s phone never reported one';
    }
}
