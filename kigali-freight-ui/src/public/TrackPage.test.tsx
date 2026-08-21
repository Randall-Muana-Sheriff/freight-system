import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackPage } from './TrackPage';
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
    priceRwf: 16803,
    priceIsEstimate: false,
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
