import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SyncRejectionsCard } from './SyncRejectionsCard';
import type { RejectedDriverAction } from '../lib/offlineQueue';

// The card is isolated from the session on purpose: what is being tested is
// what a driver sees and what their taps call, not how auth.tsx loads it.
const mockRetryRejected = jest.fn<(id: string) => Promise<void>>();
const mockDiscardRejected = jest.fn<(id: string) => Promise<void>>();
let mockRejectedActions: RejectedDriverAction[] = [];

jest.mock('../lib/auth', () => ({
    useAuth: () => ({
        rejectedActions: mockRejectedActions,
        retryRejected: mockRetryRejected,
        discardRejected: mockDiscardRejected,
    }),
}));

const photo: RejectedDriverAction = {
    id: 'rej-photo',
    item: {
        type: 'delivery-photo', orderId: 42,
        localFileUri: 'file:///document/pending-delivery-photos/proof.jpg',
        fileName: 'proof.jpg', mimeType: 'image/jpeg', createdAt: '2026-01-01T00:00:00Z',
    },
    reason: 'AUTH_FORBIDDEN',
    message: 'Access forbidden.',
    rejectedAt: new Date().toISOString(),
};

const duplicateStatus: RejectedDriverAction = {
    id: 'rej-status',
    item: { type: 'status-update', orderId: 7, status: 'AT_PICKUP', createdAt: '2026-01-01T00:00:00Z' },
    reason: 'ORDERS_STATUS_OUT_OF_SEQUENCE',
    message: 'An order cannot go from at pickup to at pickup.',
    rejectedAt: new Date().toISOString(),
};

describe('SyncRejectionsCard', () => {
    beforeEach(() => {
        mockRejectedActions = [];
        mockRetryRejected.mockReset().mockResolvedValue(undefined);
        mockDiscardRejected.mockReset().mockResolvedValue(undefined);
        jest.restoreAllMocks();
    });

    it('shows nothing at all when nothing was refused', async () => {
        await render(<SyncRejectionsCard />);
        expect(screen.queryByText('Did not send')).toBeNull();
    });

    it('names the lost work and why, in the driver\'s terms', async () => {
        mockRejectedActions = [photo];
        await render(<SyncRejectionsCard />);

        expect(screen.getByText('Proof of delivery for trip #42')).toBeTruthy();
        expect(screen.getByText(/not yours to update/i)).toBeTruthy();
        // The header must state the consequence. "3 pending" was the old
        // failure: a number that reads as progress.
        expect(screen.getByText(/will not send on their own/i)).toBeTruthy();
    });

    // The trade this card is built on: the common case must not cry wolf, or
    // the rare one stops being read.
    it('does not raise an alarm over a merely redundant status update', async () => {
        mockRejectedActions = [duplicateStatus];
        await render(<SyncRejectionsCard />);

        expect(screen.getByText('Trip #7 marked arrived at pickup')).toBeTruthy();
        expect(screen.getByText(/Dispatch did not need these/i)).toBeTruthy();
        expect(screen.queryByText(/will not send on their own/i)).toBeNull();
    });

    it('puts an item back on the queue when the driver asks', async () => {
        mockRejectedActions = [photo];
        await render(<SyncRejectionsCard />);

        await fireEvent.press(screen.getByLabelText('Try sending Proof of delivery for trip #42 again'));
        expect(mockRetryRejected).toHaveBeenCalledWith('rej-photo');
    });

    // Nothing that destroys evidence happens on one tap.
    it('will not delete a delivery photo without confirmation', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        mockRejectedActions = [photo];
        await render(<SyncRejectionsCard />);

        await fireEvent.press(screen.getByLabelText('Delete Proof of delivery for trip #42'));

        expect(mockDiscardRejected).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();
        // And it must say what is actually at stake.
        expect(String(alert.mock.calls[0][1])).toMatch(/only copy/i);
    });

    it('deletes the photo once the driver confirms', async () => {
        jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
            const destructive = buttons?.find((b) => b.style === 'destructive');
            destructive?.onPress?.();
        });
        mockRejectedActions = [photo];
        await render(<SyncRejectionsCard />);

        await fireEvent.press(screen.getByLabelText('Delete Proof of delivery for trip #42'));
        expect(mockDiscardRejected).toHaveBeenCalledWith('rej-photo');
    });

    // No confirm where nothing is destroyed — a redundant status update holds
    // no file, and making the driver confirm it twice trains them to tap
    // through the dialog that does matter.
    it('dismisses a harmless notice on a single tap', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        mockRejectedActions = [duplicateStatus];
        await render(<SyncRejectionsCard />);

        await fireEvent.press(screen.getByLabelText('Dismiss Trip #7 marked arrived at pickup'));

        expect(alert).not.toHaveBeenCalled();
        expect(mockDiscardRejected).toHaveBeenCalledWith('rej-status');
    });

    it('lists every refused item, not just the first', async () => {
        mockRejectedActions = [photo, duplicateStatus];
        await render(<SyncRejectionsCard />);

        expect(screen.getByText('Proof of delivery for trip #42')).toBeTruthy();
        expect(screen.getByText('Trip #7 marked arrived at pickup')).toBeTruthy();
    });
});
