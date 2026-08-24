import { describe, it, expect } from '@jest/globals';
import { isRetryableFailure } from './retryable';

describe('isRetryableFailure', () => {
    // The bug this decides. The server grew a state machine, so a replayed
    // status update returns 409 — and the offline queue treated that like a
    // dropped connection: re-queue the item, re-queue everything behind it,
    // break. A 409 never becomes a 200, so the queue head-of-line blocked for
    // ever, in front of the delivery photos, and told the driver nothing.
    it('does not retry a refusal, however many times it is offered', () => {
        expect(isRetryableFailure({ status: 409, code: 'ORDERS_STATUS_OUT_OF_SEQUENCE' })).toBe(false);
        expect(isRetryableFailure({ status: 400 })).toBe(false);
        expect(isRetryableFailure({ status: 403 })).toBe(false);
        expect(isRetryableFailure({ status: 422 })).toBe(false);
    });

    it('retries the server having a bad moment', () => {
        // Asserted as a map rather than a loop: jest's expect takes no
        // message, so a bare loop failure would not say which status broke.
        const verdicts = [500, 502, 503, 504].map((status) => [status, isRetryableFailure({ status })]);
        expect(verdicts).toEqual([[500, true], [502, true], [503, true], [504, true]]);
    });

    it('treats "not now" differently from "not ever"', () => {
        // A timeout and a rate limit both mean try later. Discarding a
        // delivery confirmation because the driver was briefly throttled
        // would be the worst possible reading of a 429.
        expect(isRetryableFailure({ status: 408 })).toBe(true);
        expect(isRetryableFailure({ status: 429 })).toBe(true);
    });

    it('retries anything it cannot classify, rather than discarding it', () => {
        // The safe direction. Re-queueing something we do not understand is
        // recoverable; throwing away proof of delivery is not.
        expect(isRetryableFailure(new TypeError('undefined is not a function'))).toBe(true);
        expect(isRetryableFailure(new Error('Network request failed'))).toBe(true);
        expect(isRetryableFailure(null)).toBe(true);
        expect(isRetryableFailure(undefined)).toBe(true);
        expect(isRetryableFailure('a string')).toBe(true);
        expect(isRetryableFailure({ status: 'weird' })).toBe(true);
        expect(isRetryableFailure({ status: 0 })).toBe(true);
    });

    it('works on a plain object, not just an instance', () => {
        // Duck-typed on purpose: Metro can hand a module out twice and a Jest
        // mock replaces a class outright, so `instanceof` fails for reasons
        // unrelated to the error. This is the property that made the queue's
        // own tests pass while the policy was undefined inside them.
        expect(isRetryableFailure({ status: 409 })).toBe(false);
        expect(isRetryableFailure(Object.assign(new Error('x'), { status: 409 }))).toBe(false);
    });
});
