import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RateCardPanel from './RateCardPanel';
import { useSocket } from '../context/SocketContext';
import { fetchRateCards, saveRateCard } from '../utils/api';

vi.mock('../context/SocketContext', () => ({ useSocket: vi.fn() }));
vi.mock('../utils/api', () => ({ fetchRateCards: vi.fn(), saveRateCard: vi.fn() }));

const mockedUseSocket = vi.mocked(useSocket);
const mockedFetch = vi.mocked(fetchRateCards);
const mockedSave = vi.mocked(saveRateCard);

const card = {
    id: 4, vehicle_class: 'Light Van',
    base_fare: '8000.00', per_km: '700.00', per_km_long: '80.00',
    per_kg: '8.0000', minimum_fare: '15000.00',
    fuel_litres_per_100km: '10.00', fuel_price_per_litre: '2927.00',
    road_distance_factor: '1.600', taper_after_km: '25.00',
    return_leg_beyond_km: '25.00', return_leg_share_pct: '70.00',
    terrain_fuel_factor: '1.200', platform_commission_pct: '15.00',
    platform_minimum_fee: '500.00', detention_free_minutes: 60,
    detention_per_hour: '3800.00',
    effective_from: '2026-08-21T00:00:00Z', note: 'Calibrated Aug 2026',
};

describe('RateCardPanel', () => {
    beforeEach(() => {
        mockedUseSocket.mockReturnValue({ jwtToken: 'tok' } as unknown as ReturnType<typeof useSocket>);
        mockedFetch.mockReset().mockResolvedValue({ rates: [card] });
        mockedSave.mockReset().mockResolvedValue({ rate: card });
    });

    it('shows the diesel price as an editable figure, not a string from pg', async () => {
        render(<RateCardPanel />);
        // NUMERIC comes back from pg as "2927.00"; an input showing that is
        // both ugly and awkward to edit.
        expect(await screen.findByDisplayValue('2927')).toBeInTheDocument();
    });

    it('will not supersede a card when nothing has been changed', async () => {
        render(<RateCardPanel />);
        const button = await screen.findByRole('button', { name: /change a figure/i });
        expect(button).toBeDisabled();
    });

    it('sends only what actually changed', async () => {
        const user = userEvent.setup();
        render(<RateCardPanel />);
        const diesel = await screen.findByDisplayValue('2927');

        await user.clear(diesel);
        await user.type(diesel, '3200');
        await user.click(screen.getByRole('button', { name: /supersede/i }));

        await waitFor(() => expect(mockedSave).toHaveBeenCalled());
        const [vehicleClass, changes] = mockedSave.mock.calls[0];
        expect(vehicleClass).toBe('Light Van');
        // Only diesel: sending the whole form would write a new card on every
        // save even when nothing moved.
        expect(changes).toEqual({ fuel_price_per_litre: 3200 });
    });

    it('says plainly that superseding does not touch jobs already quoted', async () => {
        const user = userEvent.setup();
        render(<RateCardPanel />);
        const diesel = await screen.findByDisplayValue('2927');
        await user.clear(diesel);
        await user.type(diesel, '3200');
        await user.click(screen.getByRole('button', { name: /supersede/i }));

        expect(await screen.findByText(/keep the card they were quoted on/i)).toBeInTheDocument();
    });
});
