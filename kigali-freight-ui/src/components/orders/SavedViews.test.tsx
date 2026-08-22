import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SavedViews from './SavedViews';
import { useSocket } from '../../context/SocketContext';
import { useDialog } from '../DialogProvider';
import { fetchSavedViews, saveSavedView, deleteSavedView } from '../../utils/api';

vi.mock('../../context/SocketContext', () => ({ useSocket: vi.fn() }));
vi.mock('../DialogProvider', () => ({ useDialog: vi.fn() }));
vi.mock('../../utils/api', () => ({
    fetchSavedViews: vi.fn(), saveSavedView: vi.fn(), deleteSavedView: vi.fn(),
}));

const mockedUseSocket = vi.mocked(useSocket);
const mockedUseDialog = vi.mocked(useDialog);
const mockedFetch = vi.mocked(fetchSavedViews);
const mockedSave = vi.mocked(saveSavedView);
const mockedDelete = vi.mocked(deleteSavedView);

const view = (id: number, name: string, q: string) => ({ id, name, filter: { q } });

describe('SavedViews', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseSocket.mockReturnValue({ jwtToken: 'tok' } as unknown as ReturnType<typeof useSocket>);
        mockedUseDialog.mockReturnValue({
            prompt: vi.fn().mockResolvedValue('Remera run'),
            alert: vi.fn(),
            confirm: vi.fn(),
        } as unknown as ReturnType<typeof useDialog>);
        mockedFetch.mockResolvedValue([]);
    });

    it('stays out of the way when there is nothing saved and nothing to save', async () => {
        const { container } = render(<SavedViews filter="" onApply={() => {}} />);
        await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });

    it('applies a saved view by handing its filter text back', async () => {
        mockedFetch.mockResolvedValue([view(1, 'Remera run', 'remera')]);
        const onApply = vi.fn();
        render(<SavedViews filter="" onApply={onApply} />);

        await userEvent.click(await screen.findByRole('button', { name: 'Remera run' }));
        expect(onApply).toHaveBeenCalledWith('remera');
    });

    // The branch most likely to rot quietly. Saving over an existing name is an
    // upsert that returns the SAME id, so appending the response would show one
    // view twice under one label — a bug that reads as bad data rather than as
    // the code change that caused it. Refetching is what keeps the list honest,
    // and this pins it.
    it('does not duplicate a view when an existing name is saved over', async () => {
        mockedFetch
            .mockResolvedValueOnce([view(1, 'Remera run', 'remera')])
            .mockResolvedValueOnce([view(1, 'Remera run', 'kimironko')]);
        mockedSave.mockResolvedValue(view(1, 'Remera run', 'kimironko'));

        render(<SavedViews filter="kimironko" onApply={() => {}} />);
        await screen.findByRole('button', { name: 'Remera run' });

        await userEvent.click(screen.getByRole('button', { name: /save this view/i }));

        await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
        expect(await screen.findAllByRole('button', { name: 'Remera run' })).toHaveLength(1);
    });

    it('only offers to save when there is a filter to capture', async () => {
        mockedFetch.mockResolvedValue([view(1, 'Remera run', 'remera')]);
        const { rerender } = render(<SavedViews filter="" onApply={() => {}} />);
        await screen.findByRole('button', { name: 'Remera run' });
        expect(screen.queryByRole('button', { name: /save this view/i })).toBeNull();

        rerender(<SavedViews filter="kimironko" onApply={() => {}} />);
        expect(await screen.findByRole('button', { name: /save this view/i })).toBeTruthy();
    });

    // A view that is not yours answers 404, deliberately indistinguishable from
    // one that never existed. The UI must not try to tell them apart — it drops
    // the row and refetches, and the refetch is the thing that settles it.
    it('refetches rather than reporting when a delete is refused', async () => {
        mockedFetch
            .mockResolvedValueOnce([view(1, 'Remera run', 'remera')])
            .mockResolvedValueOnce([]);
        mockedDelete.mockRejectedValue(new Error('Not found'));

        render(<SavedViews filter="" onApply={() => {}} />);
        await screen.findByRole('button', { name: 'Remera run' });

        await userEvent.click(screen.getByRole('button', { name: /forget remera run/i }));

        await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole('button', { name: 'Remera run' })).toBeNull();
    });
});
