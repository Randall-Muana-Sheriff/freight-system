import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderFlow, CARGO_FALLBACK } from './OrderFlow';
import { fetchCargoTypes, submitOrder, fetchQuote, searchPlaces } from './publicApi';
import { LanguageProvider } from './i18n';

// These components read their labels from the language context and throw
// without one, so tests supply it exactly as the app does.
const inProvider = (ui: React.ReactElement) => <LanguageProvider>{ui}</LanguageProvider>;

vi.mock('./publicApi', () => ({
    fetchCargoTypes: vi.fn(),
    submitOrder: vi.fn(),
    fetchQuote: vi.fn(),
    searchPlaces: vi.fn(),
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
    // Cargo type is a chip row now, matching the "when do you need it"
    // row below it, so this is a press rather than a select.
    await user.click(screen.getByRole('button', { name: 'General goods', pressed: false }));
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
        // No distance, because neither address has been pinned. This is the
        // case that produces the minimum fare, and it is why an unpinned
        // booking is quoted 15-48% under what the job actually costs.
        expect(mockedFetchQuote).toHaveBeenCalledWith(400, undefined);
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
        await user.click(await screen.findByRole('button', { name: 'Place the booking' }));

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
        await user.click(await screen.findByRole('button', { name: 'Place the booking' }));

        expect(mockedSubmitOrder).toHaveBeenCalledWith(expect.objectContaining({ neededBy: undefined }));
    });

    it('does not promise the answer will be honoured', async () => {
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        expect(await screen.findByText(/confirm what.s possible when they call/i)).toBeInTheDocument();
    });
});

describe('cargo type as a chip row', () => {
    // It was a <select> that opened on "Choose…", sitting directly above a
    // row of chips asking the same kind of question. One screen, two patterns,
    // and the select was the worse one: the first tap bought the customer
    // nothing.
    it('lets a mis-tap be undone, the way the row below it does', async () => {
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));

        const chip = await screen.findByRole('button', { name: 'General goods' });
        await user.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'true');

        // Pressing the chosen one again clears it. The select could not do
        // this at all once a real option had been picked.
        await user.click(chip);
        expect(chip).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps one choice at a time', async () => {
        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));

        const goods = await screen.findByRole('button', { name: 'General goods' });
        const perishables = await screen.findByRole('button', { name: 'Perishables' });

        await user.click(goods);
        await user.click(perishables);

        expect(perishables).toHaveAttribute('aria-pressed', 'true');
        expect(goods, 'two cargo types cannot both be chosen').toHaveAttribute('aria-pressed', 'false');
    });
});

describe('the cargo list when the server cannot be reached', () => {
    // The fallback exists because an empty list stopped being visible. As a
    // <select> it still rendered "Choose…"; as chips it renders nothing, and
    // a cargo type is required — so a failed fetch left a customer with a
    // Continue button that never enabled and no field to blame.
    it('matches the dictionary, which is the list a translator edits', async () => {
        const { en } = await import('./i18n/en');
        // t.cargo is keyed by identifier, which is the whole reason those keys
        // are English strings. If the two drift, the fallback would offer a
        // type the server rejects, or a chip with no label.
        expect([...CARGO_FALLBACK].sort()).toEqual(Object.keys(en.cargo).sort());
    });

    it('still offers every type when the request fails outright', async () => {
        mockedFetchCargoTypes.mockReset().mockRejectedValue(new Error('offline'));
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));

        for (const type of CARGO_FALLBACK) {
            expect(await screen.findByRole('button', { name: type })).toBeTruthy();
        }
    });

    it('does not render an empty chip row when the server answers with nothing', async () => {
        // A 200 with an empty array is the same dead end as a failure, and it
        // is the likelier of the two after a bad migration.
        mockedFetchCargoTypes.mockReset().mockResolvedValue([]);
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));

        expect(await screen.findByRole('button', { name: 'General goods' })).toBeTruthy();
    });
});

describe('pinning both addresses is what makes the price real', () => {
    // The whole reason the address fields changed. Without coordinates the
    // server has no distance, every quote falls to the minimum fare, and the
    // form shows 15,000 RWF for a 50kg parcel and an 800kg pallet alike.
    const KIMIRONKO = { label: 'Kimironko Market', lat: -1.944800, lng: 30.125600, source: 'hint' as const };
    const NYABUGOGO = { label: 'Nyabugogo', lat: -1.939800, lng: 30.043500, source: 'hint' as const };

    it('sends a distance once both ends are pinned, and none before', async () => {
        const mockedSearch = vi.mocked(searchPlaces);
        mockedSearch.mockReset()
            .mockImplementation(async (q: string) =>
                /nyabu/i.test(q) ? [NYABUGOGO] : [KIMIRONKO]);

        const user = userEvent.setup();
        render(inProvider(<OrderFlow onNavigate={vi.fn()} />));
        await screen.findByPlaceholderText('150');
        await user.type(screen.getByPlaceholderText('150'), '400');

        // Weight alone: no distance to send.
        await waitFor(() => expect(mockedFetchQuote).toHaveBeenCalledWith(400, undefined));

        await user.type(screen.getByPlaceholderText('Gikondo Industrial Zone, gate 3'), 'nyabugogo');
        await user.click(await screen.findByRole('option', { name: 'Nyabugogo' }));

        // One end pinned is still no distance — it takes two points.
        expect(mockedFetchQuote).not.toHaveBeenCalledWith(400, expect.any(Number));

        await user.type(screen.getByPlaceholderText('Kimironko Market, shop 14'), 'kimironko');
        await user.click(await screen.findByRole('option', { name: 'Kimironko Market' }));

        await waitFor(() => {
            const [, distance] = mockedFetchQuote.mock.calls.at(-1)!;
            // PostGIS puts these two hubs 9.151km apart in a straight line.
            // Not the road distance — the server applies its own factor.
            expect(distance).toBeCloseTo(9.151, 1);
        });
    });
});
