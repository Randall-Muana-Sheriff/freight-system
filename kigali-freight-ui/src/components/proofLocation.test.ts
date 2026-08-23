import { describe, it, expect } from 'vitest';
import { proofLocation, proofLocationTitle } from './proofLocation';

describe('proofLocation', () => {
    // The bug in one line: `flagged ? hazard : fine` sends null down the
    // same branch as false, so "nobody checked" was drawn exactly like
    // "checked and fine". TypeScript cannot catch it — null is simply
    // falsy — so it has to be a test.
    it('does not let an unchecked delivery pass as a confirmed one', () => {
        expect(proofLocation({ location_flagged: null })).toBe('unchecked');
        expect(proofLocation({ location_flagged: false })).toBe('confirmed');
        expect(proofLocation({ location_flagged: null }))
            .not.toBe(proofLocation({ location_flagged: false }));
    });

    it('treats a missing field as unchecked, never as confirmed', () => {
        // An older row, or a response that predates the column.
        expect(proofLocation({})).toBe('unchecked');
        expect(proofLocation({ location_flagged: undefined })).toBe('unchecked');
    });

    it('still flags the deliveries that were genuinely off-target', () => {
        expect(proofLocation({ location_flagged: true })).toBe('flagged');
    });
});

describe('proofLocationTitle', () => {
    it('gives the distance when there was one to measure', () => {
        expect(proofLocationTitle({ location_flagged: true, distance_from_target_m: 412.6 }))
            .toBe('Confirmed 413m from the delivery point');
    });

    it('explains an absent check rather than implying the driver did something', () => {
        const title = proofLocationTitle({ location_flagged: null, distance_from_target_m: null });
        expect(title).toContain('not checked');
        // Names the two causes, so it cannot be read as a fault.
        expect(title).toContain('no delivery point');
        expect(title).toContain('never reported');
    });

    it('says so plainly when the check ran and passed', () => {
        expect(proofLocationTitle({ location_flagged: false })).toBe('Confirmed at the delivery point');
    });
});
