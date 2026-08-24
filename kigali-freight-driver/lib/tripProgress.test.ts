import { describe, it, expect } from '@jest/globals';
import {
    stepIndexForStatus,
    nextActionForStatus,
    isCancelled,
    isOffer,
    isTerminal,
    STATUS_ORDER,
} from './tripProgress';

describe('tripProgress', () => {
    // The bug. A cancelled order fell through both functions' "unknown status"
    // default and came out as a brand new job: first dot lit, and a live
    // "I'm at the pickup" button on work that had been called off. A driver
    // tapping it sends a status update the server will refuse — which is how
    // it then turned up in the rejected queue as well.
    describe('a cancelled job is not a fresh one', () => {
        it('offers no action at all', () => {
            expect(nextActionForStatus('CANCELLED')).toBeUndefined();
        });

        it('lights no step on the timeline, rather than the first one', () => {
            expect(stepIndexForStatus('CANCELLED')).toBe(-1);
        });

        it('is recognised whatever case it arrives in', () => {
            expect(isCancelled('cancelled')).toBe(true);
            expect(nextActionForStatus('cancelled')).toBeUndefined();
        });
    });

    // -1 has to be safe in the render, not just honest. The timeline compares
    // with < and ===, so nothing should match.
    it('lights nothing for a cancelled job when the dots are walked', () => {
        const active = stepIndexForStatus('CANCELLED');
        const lit = [0, 1, 2, 3].filter((i) => i < active || i === active);
        expect(lit).toEqual([]);
    });

    describe('the ordinary forward journey still works', () => {
        it('offers the one step ahead, never one already passed', () => {
            expect(nextActionForStatus('ASSIGNED')).toBe('AT_PICKUP');
            expect(nextActionForStatus('AT_PICKUP')).toBe('IN_TRANSIT');
            expect(nextActionForStatus('PICKED_UP')).toBe('IN_TRANSIT');
            expect(nextActionForStatus('IN_TRANSIT')).toBe('ARRIVED');
            expect(nextActionForStatus('ARRIVED')).toBe('DELIVERED');
        });

        it('lights the right dot along the way', () => {
            expect(stepIndexForStatus('ASSIGNED')).toBe(0);
            expect(stepIndexForStatus('AT_PICKUP')).toBe(0);
            expect(stepIndexForStatus('PICKED_UP')).toBe(1);
            expect(stepIndexForStatus('IN_TRANSIT')).toBe(2);
            expect(stepIndexForStatus('ARRIVED')).toBe(2);
            expect(stepIndexForStatus('DELIVERED')).toBe(3);
        });

        // The other terminal state, which was already safe only because
        // DELIVERED happens to sit last on STATUS_ORDER. Now it is explicit.
        it('offers nothing once delivered', () => {
            expect(nextActionForStatus('DELIVERED')).toBeUndefined();
            expect(isTerminal('DELIVERED')).toBe(true);
        });

        it('offers nothing on a job the driver has not accepted', () => {
            expect(isOffer('OFFERED')).toBe(true);
            expect(nextActionForStatus('OFFERED')).toBeUndefined();
        });
    });

    // Guards the reason PICKED_UP is missing from the action list: the app has
    // never sent it, and this documents that it is a choice, not an omission.
    it('never offers PICKED_UP as an action, though it is a real status', () => {
        expect(STATUS_ORDER).toContain('PICKED_UP');
        const offered = STATUS_ORDER.map((s) => nextActionForStatus(s));
        expect(offered).not.toContain('PICKED_UP');
    });

    it('treats a status it has never heard of as the start of the journey', () => {
        // Long-standing behaviour, kept deliberately: an unknown status is not
        // a reason to strand a driver with no controls. Only terminal states
        // get nothing, and those are now named rather than inferred.
        expect(nextActionForStatus('SOMETHING_NEW')).toBe('AT_PICKUP');
        expect(stepIndexForStatus('SOMETHING_NEW')).toBe(0);
    });
});
