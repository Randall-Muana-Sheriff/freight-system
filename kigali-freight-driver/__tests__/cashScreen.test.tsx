import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CashScreen from '../app/(app)/cash';
import type { DriverCashSummary } from '../lib/api';

// Lives outside app/ deliberately, for the same reason earningsScreen.test.tsx
// does: Expo Router's require.context regex matches every .tsx under the app
// root and does not exclude test files, so a colocated cash.test.tsx would be
// bundled as a route at /cash.test with no default export.

const mockFetchCash = jest.fn<() => Promise<unknown>>();
const mockSettle = jest.fn<(amount?: number) => Promise<unknown>>();
const mockStatus = jest.fn<() => Promise<unknown>>();

jest.mock('expo-router', () => ({
    useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, [cb]); },
}));
jest.mock('../lib/auth', () => ({ useAuth: () => ({ token: 'tok' }) }));
jest.mock('../lib/navigation', () => ({ useUpNavigation: () => () => {} }));
jest.mock('../lib/crashReporting', () => ({ captureException: () => {} }));
jest.mock('../lib/api', () => ({
    ApiError: class ApiError extends Error {},
    fetchDriverCash: () => mockFetchCash(),
    requestOwnCashSettlement: (_t: string, amount?: number) => mockSettle(amount),
    fetchCashSettlementStatus: () => mockStatus(),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderScreen = () =>
    render(<SafeAreaProvider initialMetrics={METRICS}><CashScreen /></SafeAreaProvider>);

const summary = (over: Partial<DriverCashSummary> = {}): DriverCashSummary => ({
    collected: 40000,
    commissionOwed: 6000,
    commissionSettled: 0,
    commissionOwedUnknownJobs: 0,
    currency: 'RWF',
    byCurrency: [{
        currency: 'RWF', collected: 40000, commissionOwed: 6000,
        commissionSettled: 0, commissionOwedUnknownJobs: 0,
    }],
    jobs: [{
        orderId: 42, amount: 40000, platformFee: 6000, currency: 'RWF',
        collectedAt: '2026-08-24T08:00:00Z', settledAt: null,
    }],
    ...over,
});

describe('CashScreen', () => {
    beforeEach(() => {
        mockFetchCash.mockReset().mockResolvedValue(summary());
        mockSettle.mockReset().mockResolvedValue({ reference: 'ref-1', amount: 6000 });
        mockStatus.mockReset().mockResolvedValue({
            reference: 'ref-1', amount: 6000, currency: 'RWF', status: 'PENDING',
            failure_reason: null, created_at: '2026-08-24T09:00:00Z', stillOwed: 6000,
        });
    });

    // The whole point of the screen: the debt is the headline, not the takings.
    // A driver reading one number must read the one that is not theirs.
    it('leads with what is owed, not with what was collected', async () => {
        renderScreen();
        await waitFor(() => expect(screen.getByText('Commission you owe')).toBeTruthy());
        expect(screen.getByText('6,000 RWF')).toBeTruthy();
    });

    it('offers to pay the whole debt by mobile money', async () => {
        renderScreen();
        await waitFor(() => expect(screen.getByText(/Pay 6,000 RWF by mobile money/)).toBeTruthy());

        fireEvent.press(screen.getByLabelText('Pay the whole commission by mobile money'));
        // Undefined amount means "settle everything", which is what the server
        // defaults to. Passing a number here would silently cap it.
        await waitFor(() => expect(mockSettle).toHaveBeenCalledWith(undefined));
    });

    it('waits for the PIN rather than claiming the commission is paid', async () => {
        renderScreen();
        await waitFor(() => expect(screen.getByText(/Pay 6,000 RWF by mobile money/)).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Pay the whole commission by mobile money'));

        await waitFor(() => expect(screen.getByText('Waiting for your PIN')).toBeTruthy());
        expect(screen.queryByText(/Pay 6,000 RWF by mobile money/)).toBeNull();
    });

    // The trap this screen exists to avoid: zero-because-unknown reading as
    // zero-because-clear. A driver told they are square will spend the money.
    it('does not tell a driver with unworked-out fees that they owe nothing', async () => {
        mockFetchCash.mockResolvedValue(summary({
            commissionOwed: 0,
            commissionOwedUnknownJobs: 2,
            byCurrency: [{
                currency: 'RWF', collected: 40000, commissionOwed: 0,
                commissionSettled: 0, commissionOwedUnknownJobs: 2,
            }],
            jobs: [{
                orderId: 42, amount: 40000, platformFee: null, currency: 'RWF',
                collectedAt: '2026-08-24T08:00:00Z', settledAt: null,
            }],
        }));
        renderScreen();

        await waitFor(() => expect(screen.getByText(/has not been worked out/i)).toBeTruthy());
        expect(screen.queryByText(/nothing outstanding/i)).toBeNull();
        // And the job row says so too, rather than showing a 0 commission.
        expect(screen.getByText('Commission not worked out yet')).toBeTruthy();
    });

    // 6,000 RWF + 15 USD is not 6,015 of anything, and one prompt cannot pay
    // both. The server refuses this; the screen must not offer it first.
    it('refuses to offer one prompt for a debt in two currencies', async () => {
        mockFetchCash.mockResolvedValue(summary({
            commissionOwed: null,
            currency: null,
            byCurrency: [
                { currency: 'RWF', collected: 40000, commissionOwed: 6000, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
                { currency: 'USD', collected: 100, commissionOwed: 15, commissionSettled: 0, commissionOwedUnknownJobs: 0 },
            ],
        }));
        renderScreen();

        await waitFor(() => expect(screen.getByText(/cannot be added up/i)).toBeTruthy());
        expect(screen.getByText(/Hand it to dispatch/i)).toBeTruthy();
        expect(screen.queryByText(/by mobile money/)).toBeNull();
        expect(mockSettle).not.toHaveBeenCalled();
    });

    it('sends a partial amount when the driver only has part of it', async () => {
        renderScreen();
        await waitFor(() => expect(screen.getByLabelText('Pay part of the commission instead')).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Pay part of the commission instead'));

        const input = await screen.findByLabelText('Amount to pay now');
        fireEvent.changeText(input, '2 000');
        // Wait for the re-render before querying the button. Send's onPress
        // closes over the amount from the render it was queried in, so
        // pressing a handle taken before the text landed submits an empty
        // field — which is a test artefact, not a bug in the screen.
        await waitFor(() => expect(screen.getByDisplayValue('2 000')).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Send this amount'));

        await waitFor(() => expect(mockSettle).toHaveBeenCalledWith(2000));
    });

    it('refuses a partial larger than the debt without asking the server', async () => {
        renderScreen();
        await waitFor(() => expect(screen.getByLabelText('Pay part of the commission instead')).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Pay part of the commission instead'));

        const input = await screen.findByLabelText('Amount to pay now');
        fireEvent.changeText(input, '9000');
        await waitFor(() => expect(screen.getByDisplayValue('9000')).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Send this amount'));

        await waitFor(() => expect(screen.getByText(/cannot pay more than that/i)).toBeTruthy());
        expect(mockSettle).not.toHaveBeenCalled();
    });

    it('shows the server\'s own refusal rather than a vaguer one', async () => {
        // The wrong-network message names the fix. Replacing it with "could
        // not start that payment" would strand the driver.
        mockSettle.mockRejectedValue(new Error(
            'Your number is not an MTN line, so it cannot receive a MoMo prompt. '
            + 'Hand the commission to dispatch instead.'
        ));
        renderScreen();
        await waitFor(() => expect(screen.getByText(/Pay 6,000 RWF by mobile money/)).toBeTruthy());
        fireEvent.press(screen.getByLabelText('Pay the whole commission by mobile money'));

        await waitFor(() => expect(screen.getByText(/not an MTN line/i)).toBeTruthy());
    });

    it('says so plainly when nothing is outstanding', async () => {
        mockFetchCash.mockResolvedValue(summary({
            commissionOwed: 0,
            byCurrency: [{
                currency: 'RWF', collected: 40000, commissionOwed: 0,
                commissionSettled: 6000, commissionOwedUnknownJobs: 0,
            }],
            jobs: [{
                orderId: 42, amount: 40000, platformFee: 6000, currency: 'RWF',
                collectedAt: '2026-08-24T08:00:00Z', settledAt: '2026-08-24T10:00:00Z',
            }],
        }));
        renderScreen();

        await waitFor(() => expect(screen.getByText(/Nothing outstanding/i)).toBeTruthy());
        expect(screen.getByText('Commission paid')).toBeTruthy();
        // Said once, not twice — see the 'nothing-owed' branch in cash.tsx.
        expect(screen.queryAllByText(/nothing outstanding/i)).toHaveLength(1);
    });
});
