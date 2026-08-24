import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import EarningsScreen from '../app/(app)/earnings';
import type { PayoutRow } from '../lib/earnings';

// Lives outside app/ deliberately. Expo Router's require.context regex
// matches every .tsx under the app root and does NOT exclude test files, so
// a colocated earnings.test.tsx would be bundled as a route at /earnings.test
// — one with no default export.

const mockFetchEarnings = jest.fn<() => Promise<unknown>>();

jest.mock('expo-router', () => ({
    useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, [cb]); },
}));
jest.mock('../lib/auth', () => ({ useAuth: () => ({ token: 'tok' }) }));
jest.mock('../lib/navigation', () => ({ useUpNavigation: () => () => {} }));
jest.mock('../lib/crashReporting', () => ({ captureException: () => {} }));
jest.mock('../lib/api', () => ({ fetchDriverEarnings: () => mockFetchEarnings() }));

// ScreenShell reads safe-area insets, so the real provider is supplied with
// fixed metrics rather than mocked away — the shell is part of what renders.
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderScreen = () =>
    render(<SafeAreaProvider initialMetrics={METRICS}><EarningsScreen /></SafeAreaProvider>);

const payout = (over: Partial<PayoutRow> = {}): PayoutRow => ({
    id: 1, order_id: 42, amount: 8000, currency: 'RWF', status: 'SUCCESSFUL',
    release_at: null, sent_at: '2026-08-24T09:00:00Z', created_at: '2026-08-24T08:00:00Z',
    failure_reason: null, ...over,
});

describe('EarningsScreen', () => {
    beforeEach(() => {
        mockFetchEarnings.mockReset().mockResolvedValue({ paidOut: 8000, onTheWay: 0, payouts: [payout()] });
    });

    // The model this screen has to be honest about: a payout row exists from
    // the moment the customer pays, and the transfer follows minutes later.
    it('keeps landed money and pending money as two separate figures', async () => {
        // Totals that are genuine sums of the rows, so each figure asserted
        // below belongs to a total and could not be a single job's amount.
        mockFetchEarnings.mockResolvedValue({
            paidOut: 12500, onTheWay: 4200,
            payouts: [
                payout({ id: 1, order_id: 42, amount: 8000, status: 'SUCCESSFUL' }),
                payout({ id: 2, order_id: 43, amount: 4500, status: 'SUCCESSFUL' }),
                payout({ id: 3, order_id: 44, amount: 3200, status: 'QUEUED', sent_at: null }),
                payout({ id: 4, order_id: 45, amount: 1000, status: 'QUEUED', sent_at: null }),
            ],
        });
        await renderScreen();

        expect(await screen.findByText('In your wallet')).toBeTruthy();
        expect(screen.getByText('12,500 RWF')).toBeTruthy();
        // "On the way" is deliberately the same phrase on the total and on
        // each queued row — the same fact about the same money — so this
        // allows more than one rather than forcing the wording apart.
        expect(screen.getAllByText('On the way').length).toBeGreaterThan(0);
        expect(screen.getByText('4,200 RWF')).toBeTruthy();
        // The distinction stated on the screen, not just implied by a heading.
        expect(screen.getByText('Sent and landed.')).toBeTruthy();
        expect(screen.getByText('Earned, not sent yet.')).toBeTruthy();
    });

    // The gap that would otherwise read as "I have earned nothing". Cash jobs
    // produce no payout row at all, so a driver who worked all week in cash
    // sees an empty list — and must not read that as an empty week.
    describe('cash work is missing from this screen, so it says so', () => {
        it('explains the omission even when there is money to show', async () => {
            await renderScreen();
            expect(await screen.findByText(/Fares you took in cash are not here/i)).toBeTruthy();
        });

        it('never tells a driver with no payouts that they have earned nothing', async () => {
            mockFetchEarnings.mockResolvedValue({ paidOut: 0, onTheWay: 0, payouts: [] });
            await renderScreen();

            expect(await screen.findByText(/Nothing has been sent to you by mobile money yet/i)).toBeTruthy();
            expect(screen.getByText(/you already hold that money/i)).toBeTruthy();
            expect(screen.queryByText(/earned nothing|no earnings/i)).toBeNull();
        });
    });

    it('tells a driver to chase a failed transfer rather than wait for it', async () => {
        mockFetchEarnings.mockResolvedValue({
            paidOut: 0, onTheWay: 0,
            payouts: [payout({ status: 'FAILED', failure_reason: 'Wallet not registered.' })],
        });
        await renderScreen();

        expect(await screen.findByText(/Wallet not registered\./)).toBeTruthy();
        expect(screen.getByText(/will not retry on its own/i)).toBeTruthy();
    });

    // The currency trap, applied to a sum. paidOut and onTheWay arrive as bare
    // numbers; labelling a mixed-currency total "RWF" would be a lie.
    it('drops the unit and says why when the jobs are not all one currency', async () => {
        mockFetchEarnings.mockResolvedValue({
            paidOut: 9000, onTheWay: 0,
            payouts: [payout(), payout({ id: 2, currency: 'USD', amount: 1000 })],
        });
        await renderScreen();

        expect(await screen.findByText('9,000')).toBeTruthy();
        expect(screen.getByText(/not all in one currency/i)).toBeTruthy();
    });

    it('never prints a currency that is not there', async () => {
        mockFetchEarnings.mockResolvedValue({
            paidOut: 1496, onTheWay: 0, payouts: [payout({ currency: null, amount: 1496 })],
        });
        await renderScreen();

        expect(await screen.findByText('In your wallet')).toBeTruthy();
        expect(screen.queryByText(/null/i)).toBeNull();
    });

    it('shows the failure rather than an empty screen that looks like no work', async () => {
        mockFetchEarnings.mockRejectedValue(new Error('Could not load your earnings.'));
        await renderScreen();

        expect(await screen.findByText('Could not load your earnings.')).toBeTruthy();
    });
});
