import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ExceptionsHome from './ExceptionsHome';
import { useSocket } from '../context/SocketContext';
import { fetchExceptions, type ExceptionGroup } from '../utils/api';

vi.mock('../context/SocketContext', () => ({ useSocket: vi.fn() }));
vi.mock('../utils/api', () => ({ fetchExceptions: vi.fn() }));

const mockedUseSocket = vi.mocked(useSocket);
const mockedFetch = vi.mocked(fetchExceptions);

// Shaped like the real payload and no more. Empty groups are dropped from it
// entirely, so a test that always supplies every key would be testing a
// payload the board never receives; `items` is capped at five regardless of
// count, which is why nothing below asserts on membership of it.
const group = (over: Partial<ExceptionGroup> & Pick<ExceptionGroup, 'key'>): ExceptionGroup => ({
    label: over.key,
    severity: 'act',
    count: 1,
    items: [],
    ...over,
});

const reportOf = (...groups: ExceptionGroup[]) => ({
    generatedAt: '2026-08-24T09:00:00Z',
    groups,
});

const renderBoard = () => render(<ExceptionsHome onGoToDispatch={() => {}} />);

describe('ExceptionsHome', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseSocket.mockReturnValue({
            jwtToken: 'tok', userRole: 'dispatcher',
        } as unknown as ReturnType<typeof useSocket>);
    });

    it('shows nothing at all to a role that is not running the board', () => {
        mockedUseSocket.mockReturnValue({
            jwtToken: 'tok', userRole: 'driver',
        } as unknown as ReturnType<typeof useSocket>);
        mockedFetch.mockResolvedValue(reportOf(group({ key: 'assigned_driver_dark' })));

        const { container } = renderBoard();

        expect(container).toBeEmptyDOMElement();
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    // The whole point of the backlog split. A big historical number must not
    // be dressed as an alarm, or the alarm beside it stops being read.
    describe('a backlog is not an alarm', () => {
        it('gives a large historical count a plain line, not a ranked card', async () => {
            mockedFetch.mockResolvedValue(reportOf(
                group({ key: 'delivered_unpriced', label: 'Delivered, and never priced', severity: 'watch', count: 108 }),
            ));

            renderBoard();

            await screen.findByText('108');
            expect(screen.getByText(/backlog to settle, not a fault today/i)).toBeTruthy();
            // Not promoted into the urgent section.
            expect(screen.queryByText('Needs someone now')).toBeNull();
        });

        // The specific misread this guards: 108 shouting over a 1 that needs
        // somebody in the next ten minutes.
        it('keeps the urgent heading for the small operational alert beside it', async () => {
            mockedFetch.mockResolvedValue(reportOf(
                group({ key: 'delivered_unpriced', label: 'Delivered, and never priced', severity: 'watch', count: 108 }),
                group({ key: 'assigned_driver_dark', label: 'Driver has gone dark', severity: 'act', count: 1 }),
            ));

            renderBoard();

            expect(await screen.findByText('Needs someone now')).toBeTruthy();
            expect(screen.getByText('Driver has gone dark')).toBeTruthy();
            // The backlog is still not in that section — it kept its own line.
            expect(screen.getByText(/backlog to settle/i)).toBeTruthy();
        });

        it('offers a way in to the unplaced queue, and only to that one', async () => {
            mockedFetch.mockResolvedValue(reportOf(
                group({ key: 'unplaced_orders', label: 'Unplaced', count: 61 }),
                group({ key: 'delivered_unpriced', label: 'Delivered, and never priced', severity: 'watch', count: 108 }),
            ));

            renderBoard();

            expect(await screen.findByRole('button', { name: /place them/i })).toBeTruthy();
            expect(screen.queryAllByRole('button', { name: /place them/i })).toHaveLength(1);
        });
    });

    // Empty groups are dropped from the payload, so every key is optional and
    // the board must not assume one it was built around is present.
    describe('missing keys are the normal case, not an error', () => {
        it('renders a report with no backlog keys at all', async () => {
            mockedFetch.mockResolvedValue(reportOf(
                group({ key: 'stalled_at_pickup', label: 'Stalled at pickup', severity: 'watch', count: 3 }),
            ));

            renderBoard();

            expect(await screen.findByText('Worth watching')).toBeTruthy();
            expect(screen.queryByText(/bookings still need placing/i)).toBeNull();
        });

        it('survives a completely empty report and says so', async () => {
            mockedFetch.mockResolvedValue(reportOf());

            renderBoard();

            expect(await screen.findByText('Nothing is going wrong that the system can see.')).toBeTruthy();
        });

        it('handles a key it has never been taught', async () => {
            mockedFetch.mockResolvedValue(reportOf(
                group({ key: 'some_future_group', label: 'Something new', severity: 'act', count: 2 }),
            ));

            renderBoard();

            expect(await screen.findByText('Something new')).toBeTruthy();
        });
    });

    // A backlog is not a fault, so the board must not contradict itself by
    // printing "nothing is going wrong" directly beneath a visible one.
    it('does not claim nothing is wrong while a backlog is on screen', async () => {
        mockedFetch.mockResolvedValue(reportOf(
            group({ key: 'delivered_unpriced', label: 'Delivered, and never priced', severity: 'watch', count: 108 }),
        ));

        renderBoard();

        expect(await screen.findByText('Nothing needs anyone right now.')).toBeTruthy();
        expect(screen.queryByText('Nothing is going wrong that the system can see.')).toBeNull();
    });

    // The half of the split that must NOT be a backlog. payment_outstanding
    // means delivered, priced, and the money is not in — somebody rings
    // someone today. It was on the backlog list while the server used one
    // group for both, and leaving it there after they were split would have
    // taken the urgent half and dressed it as history.
    it('treats an unpaid priced delivery as urgent, not as backlog', async () => {
        mockedFetch.mockResolvedValue(reportOf(
            group({ key: 'payment_outstanding', label: 'Delivered, and nobody has paid', severity: 'act', count: 2 }),
        ));

        renderBoard();

        expect(await screen.findByText('Needs someone now')).toBeTruthy();
        expect(screen.getByText('Delivered, and nobody has paid')).toBeTruthy();
        expect(screen.queryByText(/backlog to settle/i)).toBeNull();
    });

    it('keeps them apart when both arrive together', async () => {
        mockedFetch.mockResolvedValue(reportOf(
            group({ key: 'payment_outstanding', label: 'Delivered, and nobody has paid', severity: 'act', count: 2 }),
            group({ key: 'delivered_unpriced', label: 'Delivered, and never priced', severity: 'watch', count: 108 }),
        ));

        renderBoard();

        // The 2 that needs a phone call is ranked; the 108 that needs a
        // pricing decision is a line. Sizes reversed, urgency not.
        expect(await screen.findByText('Needs someone now')).toBeTruthy();
        expect(screen.getByText('Delivered, and nobody has paid')).toBeTruthy();
        expect(screen.getByText(/backlog to settle/i)).toBeTruthy();
        expect(screen.queryByText('Worth watching')).toBeNull();
    });

    it('shows the failure rather than an empty board that looks healthy', async () => {
        mockedFetch.mockRejectedValue(new Error('Exceptions unavailable'));

        renderBoard();

        expect(await screen.findByText('Exceptions unavailable')).toBeTruthy();
        expect(screen.queryByText(/Nothing is going wrong/)).toBeNull();
    });

    it('counts what the server counted, not what it could fit in items', async () => {
        // items is capped at five however large count is. Rendering
        // items.length as the total would under-report every real backlog.
        mockedFetch.mockResolvedValue(reportOf(
            group({
                key: 'unanswered_offers', label: 'Unanswered offers', severity: 'act', count: 40,
                items: [1, 2, 3, 4, 5].map((id) => ({
                    id, title: `Order ${id}`, subtitle: null, since: '2026-08-24T08:00:00Z',
                })),
            }),
        ));

        renderBoard();

        expect(await screen.findByText('40')).toBeTruthy();
        await waitFor(() => expect(screen.getByText('+35 more, worst first')).toBeTruthy());
    });
});
