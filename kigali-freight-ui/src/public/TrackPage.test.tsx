import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackPage, REACHED_BY } from './TrackPage';
import { trackShipment } from './publicApi';
import { LanguageProvider } from './i18n';

// These components read their labels from the language context and throw
// without one, so tests supply it exactly as the app does.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

vi.mock('./publicApi', () => ({ trackShipment: vi.fn() }));
const mockedTrack = vi.mocked(trackShipment);

const base = {
    trackingToken: 'INZ-TEST1234',
    cargo: '40 sacks of maize flour',
    status: 'DELIVERED',
    pickup: 'Nyabugogo Hub',
    delivery: 'Kimironko Market',
    driverFirstName: 'Emmanuel',
    placedAt: '2026-08-03T08:00:00.000Z',
    priceAmount: 16803,
    priceIsEstimate: false,
    detentionAmount: null,
    updatedAt: '2026-08-03T11:02:12.000Z',
    timeline: [],
    proofOfDelivery: {
        photoUrl: 'https://storage.example/pod.jpg?X-Amz-Expires=900',
        notes: 'Received by the site manager at the gate.',
        confirmedAt: '2026-08-03T11:02:12.000Z',
    },
};

beforeEach(() => mockedTrack.mockReset());
afterEach(() => vi.restoreAllMocks());

async function lookUp() {
    render(inProvider(<TrackPage initialCode="" onNavigate={vi.fn()} />));
    await userEvent.type(screen.getByLabelText('Tracking code'), 'INZ-TEST1234');
    await userEvent.click(screen.getByRole('button', { name: /track/i }));
}

describe('TrackPage proof of delivery', () => {
    it('shows the handover photograph once delivered', async () => {
        mockedTrack.mockResolvedValue(base);
        await lookUp();

        const photo = await screen.findByAltText(/Photograph taken at handover/);
        expect(photo).toHaveAttribute('src', base.proofOfDelivery.photoUrl);
        expect(screen.getByText('Proof of delivery')).toBeInTheDocument();
    });

    it("shows the driver's note about where it was left", async () => {
        mockedTrack.mockResolvedValue(base);
        await lookUp();
        expect(await screen.findByText(/Received by the site manager/)).toBeInTheDocument();
    });

    it('shows nothing at all while the consignment is still moving', async () => {
        // The server withholds it before DELIVERED; this pins that the page
        // does not invent a section when it is absent.
        mockedTrack.mockResolvedValue({ ...base, status: 'IN_TRANSIT', proofOfDelivery: null });
        await lookUp();

        await waitFor(() => expect(screen.getByText('In progress')).toBeInTheDocument());
        expect(screen.queryByText('Proof of delivery')).not.toBeInTheDocument();
    });

    it('still renders when a delivery has a photo but no note', async () => {
        mockedTrack.mockResolvedValue({
            ...base,
            proofOfDelivery: { ...base.proofOfDelivery, notes: null },
        });
        await lookUp();
        expect(await screen.findByText('Proof of delivery')).toBeInTheDocument();
    });

    it('survives a photo the storage layer could not sign', async () => {
        // toSignedUrl returns null when object storage is unreachable —
        // the delivery still happened, so the section should not vanish.
        mockedTrack.mockResolvedValue({
            ...base,
            proofOfDelivery: { ...base.proofOfDelivery, photoUrl: null },
        });
        await lookUp();

        expect(await screen.findByText('Proof of delivery')).toBeInTheDocument();
        expect(screen.queryByAltText(/Photograph taken at handover/)).not.toBeInTheDocument();
    });
});

describe('the milestone a status lands on', () => {
    // Written out rather than imported from the router — the point is to
    // catch a status the backend gains and this file does not hear about.
    // Sourced from ALLOWED_ORDER_STATUSES in
    // kigali-freight-router/controllers/orderController.js.
    const BACKEND_STATUSES = ['PENDING', 'OFFERED', 'ASSIGNED', 'AT_PICKUP',
                              'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

    it('maps every status the backend can emit, with nothing left to the fallback', () => {
        // AT_PICKUP was missing and took the `?? 0` fallback, so a customer
        // whose driver was standing at their gate was shown "Order received".
        // A fallback that under-reports progress is worse than a crash: the
        // screen looks perfectly fine while telling somebody the wrong thing.
        for (const status of BACKEND_STATUSES) {
            expect(REACHED_BY[status], `${status} falls through to the default`).toBeDefined();
        }
    });

    it('never goes backwards as a shipment progresses', () => {
        const steps = BACKEND_STATUSES.map((s) => REACHED_BY[s]);
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i], `${BACKEND_STATUSES[i]} regresses`).toBeGreaterThanOrEqual(steps[i - 1]);
        }
    });

    it('does not show a driver as assigned before one has accepted', () => {
        // OFFERED means the job has gone to one named driver who has not
        // agreed yet. Showing "Driver assigned" is a promise the next
        // refresh may take back.
        expect(REACHED_BY.OFFERED).toBe(REACHED_BY.PENDING);
        expect(REACHED_BY.ASSIGNED).toBeGreaterThan(REACHED_BY.OFFERED);
    });

    // CANCELLED is handled on its own path rather than as a milestone.
    it('leaves cancellation out of the timeline', () => {
        expect(REACHED_BY.CANCELLED).toBeUndefined();
    });
});
