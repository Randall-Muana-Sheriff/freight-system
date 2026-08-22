import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderFlow } from './OrderFlow';
import { fetchCargoTypes, submitOrder, fetchQuote } from './publicApi';
import { LanguageProvider } from './i18n';

// These components read their labels from the language context and throw
// without one, so tests supply it exactly as the app does.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

vi.mock('./publicApi', () => ({
    fetchCargoTypes: vi.fn(),
    submitOrder: vi.fn(),
    fetchQuote: vi.fn(),
}));

const mockedFetchCargoTypes = vi.mocked(fetchCargoTypes);
const mockedSubmitOrder = vi.mocked(submitOrder);
const mockedFetchQuote = vi.mocked(fetchQuote);

// The bug this file exists for: "when do you need it" had a constant, a
// row on the review step and a field on the API, but the control itself
// was never rendered — so the answer was unreachable from the form and
// every booking arrived without one. Every check below goes through the
// form the way a customer does, rather than asserting on the payload
// shape, because the shape was already right.
async function fillCargoStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('Gikondo Industrial Zone, gate 3'), 'Gikondo');
    await user.type(screen.getByPlaceholderText('Kimironko Market, shop 14'), 'Kimironko');
    await user.selectOptions(screen.getByRole('combobox'), 'General goods');
    await user.type(screen.getByPlaceholderText('150'), '150');
}

async function fillContactStep(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText('Jean Mutabazi'), 'Jean Mutabazi');
    await user.type(screen.getByPlaceholderText('0788 000 000'), '0788000000');
}

describe('OrderFlow — when do you need it', () => {
    beforeEach(() => {
        sessionStorage.clear();
        window.history.replaceState(null, '', '/order');
        mockedFetchCargoTypes.mockReset().mockResolvedValue(['General goods', 'Perishables']);
        mockedSubmitOrder.mockReset().mockResolvedValue('INZ-ABCD2345');
        mockedFetchQuote.mockReset().mockResolvedValue({
            currency: 'RWF', vehicleClass: 'Light Van', totalAmount: 11000,
            isEstimate: true, distanceKm: null, minimumFareApplied: false,
            freeWaitingMinutes: 60, detentionPerHour: 3800,
        });
    });

    // A customer should know what it costs before handing over a name and a
    // phone number, and should not be shown an estimate as though it were a
    // settled price -- a public booking has no pickup or drop-off point yet,
    // so nothing has been priced against a real distance.
    it('quotes a price from the weight, labelled as an estimate', async () => {
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        await screen.findByPlaceholderText('150');

        await user.type(screen.getByPlaceholderText('150'), '400');

        expect(await screen.findByText('11,000 RWF')).toBeInTheDocument();
        expect(screen.getByText(/Estimated price/i)).toBeInTheDocument();
        expect(screen.getByText(/We confirm it once we have the pickup/i)).toBeInTheDocument();
        expect(mockedFetchQuote).toHaveBeenCalledWith(400);
    });

    // The price is a convenience, not a precondition. If quoting fails the
    // customer must still be able to book -- the order is priced server-side
    // on submit regardless.
    it('a failed quote leaves the form usable and says nothing', async () => {
        mockedFetchQuote.mockRejectedValue(new Error('offline'));
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        await screen.findByPlaceholderText('150');

        await user.type(screen.getByPlaceholderText('150'), '400');

        expect(screen.queryByText(/RWF/)).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('150')).toHaveValue(400);
    });

    it('asks the question on the first step, with every option reachable', async () => {
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        expect(await screen.findByText(/When do you need it/i)).toBeInTheDocument();
        for (const label of ['Today', 'Tomorrow', 'This week', "I’m flexible"]) {
            expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
        }
    });

    it('sends the chosen answer with the booking', async () => {
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        await screen.findByText(/When do you need it/i);

        await fillCargoStep(user);
        await user.click(screen.getByRole('button', { name: 'Today' }));
        expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'Continue' }));
        await fillContactStep(user);
        await user.click(screen.getByRole('button', { name: 'Continue' }));
        await user.click(await screen.findByRole('button', { name: 'Place the order' }));

        expect(mockedSubmitOrder).toHaveBeenCalledWith(expect.objectContaining({ neededBy: 'today' }));
    });

    it('stays optional — unanswered, and clearable once answered', async () => {
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        await screen.findByText(/When do you need it/i);

        await fillCargoStep(user);
        // Tapping the selected option again clears it, so an accidental
        // tap does not force an answer onto an optional question.
        await user.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await user.click(screen.getByRole('button', { name: 'Tomorrow' }));
        expect(screen.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute('aria-pressed', 'false');

        await user.click(screen.getByRole('button', { name: 'Continue' }));
        await fillContactStep(user);
        await user.click(screen.getByRole('button', { name: 'Continue' }));
        await user.click(await screen.findByRole('button', { name: 'Place the order' }));

        expect(mockedSubmitOrder).toHaveBeenCalledWith(expect.objectContaining({ neededBy: undefined }));
    });

    it('does not promise the answer will be honoured', async () => {
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        expect(await screen.findByText(/confirm what.s possible when they call/i)).toBeInTheDocument();
    });
});
