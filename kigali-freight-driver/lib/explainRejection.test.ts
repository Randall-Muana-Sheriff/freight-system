import { describe, it, expect } from '@jest/globals';
import { explainRejection } from './explainRejection';
import type { RejectedDriverAction } from './offlineQueue';

const entry = (over: Partial<RejectedDriverAction> & Pick<RejectedDriverAction, 'item'>): RejectedDriverAction => ({
    id: 'r1',
    reason: 'UNKNOWN',
    message: 'Dispatch said no.',
    rejectedAt: '2026-01-01T00:00:00Z',
    ...over,
});

const photo = { type: 'delivery-photo', orderId: 42, localFileUri: 'file:///p.jpg', fileName: 'p.jpg', mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00Z' } as const;
const statusUpdate = { type: 'status-update', orderId: 7, status: 'PICKED_UP', createdAt: '2026-01-01T00:00:00Z' } as const;

describe('explainRejection', () => {
    it('names the work in the driver\'s terms, not the queue\'s', () => {
        expect(explainRejection(entry({ item: photo })).headline).toBe('Proof of delivery for trip #42');
        expect(explainRejection(entry({ item: statusUpdate })).headline).toBe('Trip #7 marked picked up');
        expect(explainRejection(entry({
            item: { type: 'incident-report', payload: { title: 'Flat tyre' }, createdAt: '2026-01-01T00:00:00Z' },
        })).headline).toBe('Incident report: Flat tyre');
    });

    // The common case, and the one that must NOT read as an alarm: a replayed
    // duplicate status. Nothing was lost and there is nothing for the driver
    // to do, so saying so plainly is the whole job.
    it('calls a redundant status update harmless', () => {
        const result = explainRejection(entry({ item: statusUpdate, reason: 'ORDERS_STATUS_OUT_OF_SEQUENCE' }));
        expect(result.severity).toBe('benign');
        expect(result.explanation).toContain('nothing was lost');
    });

    // The point of the whole feature. A photo that did not arrive always wants
    // a person, whatever the server called it — a delivery nobody can prove is
    // not something to resolve automatically.
    it('never writes off a proof-of-delivery photo, even under a benign code', () => {
        expect(explainRejection(entry({ item: photo, reason: 'ORDERS_STATUS_OUT_OF_SEQUENCE' })).severity).toBe('attention');
        expect(explainRejection(entry({ item: photo, reason: 'ORDERS_STATUS_TERMINAL' })).severity).toBe('attention');
    });

    it('falls back to what the server said for a code it does not know', () => {
        const result = explainRejection(entry({ item: statusUpdate, reason: 'SOME_NEW_CODE', message: 'Vehicle is off the road.' }));
        expect(result.explanation).toBe('Vehicle is off the road.');
        // Unknown means unassessed, and unassessed is not the same as fine.
        expect(result.severity).toBe('attention');
    });

    it('treats an expired session as worth retrying and says so', () => {
        expect(explainRejection(entry({ item: statusUpdate, reason: 'AUTH_INVALID_TOKEN' })).explanation).toContain('Trying again');
    });
});
