import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    fetchCargoTypes, fetchQuote, searchPlaces, submitOrder, trackShipment, sendContactMessage,
    ApiError, type OrderDraft,
} from './publicApi';
import { getApiBase } from '../utils/runtimeConfig';

vi.mock('../utils/runtimeConfig', () => ({ getApiBase: vi.fn() }));
const mockedApiBase = vi.mocked(getApiBase);

/** A fetch Response as this module actually consumes one: json() and ok. */
const respond = (body: unknown, ok = true) => ({
    ok,
    json: async () => body,
} as Response);

const draft: OrderDraft = {
    pickupAddress: 'Kimironko', deliveryAddress: 'Nyabugogo',
    cargoType: 'General goods', weightKg: 40,
    customerName: 'A', customerPhone: '0788000000',
};

describe('publicApi', () => {
    beforeEach(() => {
        mockedApiBase.mockReturnValue('https://api.example.test');
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

    const fetchMock = () => vi.mocked(globalThis.fetch);

    describe('the error envelope', () => {
        // The reason the code is carried at all. Discarding it and keeping
        // only the English message made every failure untranslatable: a
        // French visitor got a French page and an English explanation of what
        // they had done wrong, at the moment they most needed to read it.
        it('keeps the server\'s error code, not just its sentence', async () => {
            fetchMock().mockResolvedValue(respond(
                { success: false, error: { message: 'That tracking code is not one of ours.', code: 'TRACKING_NOT_FOUND' } },
                false,
            ));

            await expect(trackShipment('ABC')).rejects.toMatchObject({
                code: 'TRACKING_NOT_FOUND',
                message: 'That tracking code is not one of ours.',
            });
        });

        // The subtle one. A 200 carrying success:false is still a failure,
        // and reading only response.ok would hand the caller `undefined` as
        // though it were data.
        it('treats success:false as a failure even on a 200', async () => {
            fetchMock().mockResolvedValue(respond({ success: false, error: { message: 'Nope.', code: 'X' } }, true));
            await expect(trackShipment('ABC')).rejects.toBeInstanceOf(ApiError);
        });

        it('says something a customer can read when the body is not JSON at all', async () => {
            fetchMock().mockResolvedValue({
                ok: false,
                json: async () => { throw new SyntaxError('Unexpected token <'); },
            } as unknown as Response);

            await expect(trackShipment('ABC')).rejects.toMatchObject({ code: 'UNREADABLE' });
        });

        it('falls back to a readable sentence when the server sends no message', async () => {
            fetchMock().mockResolvedValue(respond({ success: false }, false));
            await expect(trackShipment('ABC')).rejects.toMatchObject({
                message: 'Something went wrong. Please try again.',
                code: null,
            });
        });
    });

    // A marketing site whose hero and phone number are worth rendering with
    // no backend at all — so this fails with something a visitor can act on
    // rather than fetching "undefined/api/public".
    it('tells the visitor to call instead when the site has no API configured', async () => {
        mockedApiBase.mockReturnValue('');
        await expect(fetchCargoTypes()).rejects.toThrow(/call us instead/i);
        expect(fetchMock()).not.toHaveBeenCalled();
    });

    describe('address suggestions never take the form down', () => {
        // An address box that cannot suggest is a mild loss; one that throws
        // mid-keystroke takes the booking with it.
        it('returns nothing rather than throwing when the lookup fails', async () => {
            fetchMock().mockRejectedValue(new Error('network down'));
            await expect(searchPlaces('kimi')).resolves.toEqual([]);
        });

        it('returns nothing when the server refuses', async () => {
            fetchMock().mockResolvedValue(respond({ success: false, error: { message: 'no', code: 'X' } }, false));
            await expect(searchPlaces('kimi')).resolves.toEqual([]);
        });

        it('returns nothing when the payload has no results at all', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: {} }));
            await expect(searchPlaces('kimi')).resolves.toEqual([]);
        });

        it('passes the abort signal through, so a superseded keystroke is dropped', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: { results: [] } }));
            const controller = new AbortController();
            await searchPlaces('kimi', controller.signal);
            expect(fetchMock().mock.calls[0][1]).toMatchObject({ signal: controller.signal });
        });

        it('escapes what the customer typed instead of pasting it into the URL', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: { results: [] } }));
            await searchPlaces('a&b=c d');
            expect(String(fetchMock().mock.calls[0][0])).toContain('q=a%26b%3Dc%20d');
        });
    });

    describe('quoting', () => {
        const quote = { success: true, data: { currency: 'RWF', totalAmount: 11000, isEstimate: true } };

        it('asks for a weight-only price when the customer has pinned nothing', async () => {
            fetchMock().mockResolvedValue(respond(quote));
            await fetchQuote(40);
            const url = String(fetchMock().mock.calls[0][0]);
            expect(url).toContain('weightKg=40');
            expect(url).not.toContain('pickupLat');
        });

        it('sends the four coordinates once both ends are pinned', async () => {
            fetchMock().mockResolvedValue(respond(quote));
            await fetchQuote(40, { pickupLat: -1.94, pickupLng: 30.12, deliveryLat: -1.98, deliveryLng: 30.04 });
            const url = String(fetchMock().mock.calls[0][0]);
            for (const part of ['pickupLat=-1.94', 'pickupLng=30.12', 'deliveryLat=-1.98', 'deliveryLng=30.04']) {
                expect(url).toContain(part);
            }
        });

        // The security property, not a tidiness one. This endpoint used to
        // accept a distanceKm the caller worked out, so anyone could ask for
        // a cross-city job with distanceKm=0.1 and be quoted the minimum
        // fare. A public endpoint must not let the client set the input that
        // decides the price.
        it('never sends a distance the client worked out for itself', async () => {
            fetchMock().mockResolvedValue(respond(quote));
            await fetchQuote(40, { pickupLat: -1.94, pickupLng: 30.12, deliveryLat: -1.98, deliveryLng: 30.04 });
            expect(String(fetchMock().mock.calls[0][0])).not.toContain('distanceKm');
        });
    });

    describe('booking and tracking', () => {
        it('hands back the tracking token and nothing else', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: { trackingToken: 'INZ-ABCD2345' } }));
            await expect(submitOrder(draft)).resolves.toBe('INZ-ABCD2345');

            const [, init] = fetchMock().mock.calls[0];
            expect(init).toMatchObject({ method: 'POST' });
            expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ cargoType: 'General goods' });
        });

        // A customer pastes a token with a stray space, or one containing a
        // slash, and neither should build a different URL than intended.
        it('trims and escapes the tracking code before putting it in the path', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: {} }));
            await trackShipment('  INZ-AB/CD  ');
            expect(String(fetchMock().mock.calls[0][0])).toMatch(/\/track\/INZ-AB%2FCD$/);
        });

        it('resolves quietly when a contact message is accepted', async () => {
            fetchMock().mockResolvedValue(respond({ success: true, data: { received: true } }));
            await expect(sendContactMessage({ name: 'A', phone: '07', message: 'hi' })).resolves.toBeUndefined();
        });

        it('surfaces a refused contact message rather than pretending it sent', async () => {
            fetchMock().mockResolvedValue(respond(
                { success: false, error: { message: 'That phone number does not look right.', code: 'CONTACT_BAD_PHONE' } },
                false,
            ));
            await expect(sendContactMessage({ name: 'A', phone: 'x', message: 'hi' }))
                .rejects.toMatchObject({ code: 'CONTACT_BAD_PHONE' });
        });
    });
});
