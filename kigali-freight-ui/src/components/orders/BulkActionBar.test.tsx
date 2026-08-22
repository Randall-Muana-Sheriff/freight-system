import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkActionBar from './BulkActionBar';
import { useDialog } from '../DialogProvider';
import { assignOrders, offerOrders } from '../../utils/api';
import type { StaffUser } from '../../types';

vi.mock('../DialogProvider', () => ({ useDialog: vi.fn() }));
vi.mock('../../utils/api', () => ({ assignOrders: vi.fn(), offerOrders: vi.fn() }));

const mockedUseDialog = vi.mocked(useDialog);
const mockedAssign = vi.mocked(assignOrders);
const mockedOffer = vi.mocked(offerOrders);

const drivers = [
    { id: 1, username: '+250788000001', fullName: 'Jean Kamara' },
    { id: 2, username: '+250788000002', fullName: 'Eric Habimana' },
] as unknown as StaffUser[];

const setup = (props: Partial<Parameters<typeof BulkActionBar>[0]> = {}) =>
    render(
        <BulkActionBar
            selectedIds={[1, 2, 3]}
            drivers={drivers}
            jwtToken="tok"
            placeableCount={0}
            onPlace={() => {}}
            onDone={() => {}}
            onClear={() => {}}
            {...props}
        />,
    );

describe('BulkActionBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseDialog.mockReturnValue({
            confirm: vi.fn().mockResolvedValue(true),
            alert: vi.fn(),
            prompt: vi.fn(),
        } as unknown as ReturnType<typeof useDialog>);
        mockedAssign.mockResolvedValue(undefined as never);
        mockedOffer.mockResolvedValue(undefined as never);
    });

    it('stays hidden until something is selected', () => {
        const { container } = setup({ selectedIds: [] });
        expect(container).toBeEmptyDOMElement();
    });

    it('assigns every selected load in one call', async () => {
        const onDone = vi.fn();
        setup({ onDone });

        await userEvent.selectOptions(screen.getByLabelText(/driver for the selected loads/i), '+250788000001');
        await userEvent.click(screen.getByRole('button', { name: /assign/i }));

        await waitFor(() => expect(mockedAssign).toHaveBeenCalledWith([1, 2, 3], '+250788000001', 'tok'));
        expect(onDone).toHaveBeenCalled();
    });

    // A bulk misclick is expensive in a way a single-row one is not: twenty
    // loads on the wrong driver is twenty interactions to undo. Declining the
    // confirmation must leave the queue untouched.
    it('sends nothing when the confirmation is declined', async () => {
        mockedUseDialog.mockReturnValue({
            confirm: vi.fn().mockResolvedValue(false),
            alert: vi.fn(), prompt: vi.fn(),
        } as unknown as ReturnType<typeof useDialog>);
        setup();

        await userEvent.selectOptions(screen.getByLabelText(/driver for the selected loads/i), '+250788000001');
        await userEvent.click(screen.getByRole('button', { name: /assign/i }));

        await waitFor(() => expect(mockedAssign).not.toHaveBeenCalled());
    });

    it('will not act without a driver chosen', () => {
        setup();
        expect(screen.getByRole('button', { name: /assign/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /offer/i })).toBeDisabled();
    });

    // Placing is offered only when the selection contains bookings that have
    // no coordinates. Walking a dispatcher through re-pinning orders already
    // on the map is worse than not offering it.
    it('offers placing only when something in the selection needs it', () => {
        const { rerender } = setup({ placeableCount: 0 });
        expect(screen.queryByRole('button', { name: /place .* on the map/i })).toBeNull();

        rerender(
            <BulkActionBar
                selectedIds={[1, 2, 3]} drivers={drivers} jwtToken="tok"
                placeableCount={2} onPlace={() => {}} onDone={() => {}} onClear={() => {}}
            />,
        );
        expect(screen.getByRole('button', { name: /place 2 on the map/i })).toBeTruthy();
    });
});
