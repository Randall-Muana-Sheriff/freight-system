import { describe, it, expect } from 'vitest';
import { describeAssignFailure } from './assignFailure';
import { HttpError } from '../../utils/api';

describe('describeAssignFailure', () => {
    // The bug this guards against is the one that made it necessary: every
    // refusal arrived as a 4xx with a generic heading, so "place the order on
    // the map" and "the driver's insurance has lapsed" were the same screen.
    it('names the fix rather than restating the failure', () => {
        const unplaced = new HttpError('Order #182 has no confirmed pickup and delivery point yet.', 409, 'ORDERS_ASSIGN_UNPLACED');
        expect(describeAssignFailure(unplaced, 'assign').title).toBe('Place these on the map first');

        const unverified = new HttpError('Driver documents have expired.', 409, 'ORDERS_ASSIGN_DRIVER_UNVERIFIED');
        expect(describeAssignFailure(unverified, 'assign').title).toBe('That driver’s paperwork is not in date');
    });

    it('always keeps the server’s own message, which is the half that is specific', () => {
        const err = new HttpError('Orders #182 and #184 have no confirmed pickup point.', 409, 'ORDERS_ASSIGN_UNPLACED');
        // The heading is ours; the list of orders is only the server's.
        expect(describeAssignFailure(err, 'assign').body).toContain('#182');
        expect(describeAssignFailure(err, 'assign').body).toContain('#184');
    });

    it('falls back to a heading that matches the verb the dispatcher used', () => {
        const err = new HttpError('Something broke.', 500, 'ORDERS_ASSIGN_FAILED');
        expect(describeAssignFailure(err, 'assign').title).toBe('Could not assign those loads');
        expect(describeAssignFailure(err, 'offer').title).toBe('Could not offer those loads');
    });

    it('survives an error that is not an HttpError at all', () => {
        // A network failure never reaches the server, so there is no code.
        const result = describeAssignFailure(new TypeError('Failed to fetch'), 'assign');
        expect(result.title).toBe('Could not assign those loads');
        expect(result.body).toBe('Failed to fetch');
    });
});
