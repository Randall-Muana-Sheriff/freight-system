import { describe, it, expect } from '@jest/globals';
import { paymentPolicy, formatAmount, type PaymentFacts } from './paymentPolicy';

const order = (over: Partial<PaymentFacts> = {}): PaymentFacts => ({
    status: 'ARRIVED',
    payment_status: 'UNPAID',
    price_total: 12000,
    currency: 'RWF',
    price_is_estimate: false,
    ...over,
});

describe('formatAmount', () => {
    // The trap, and it was hit for real: eight orders in this database carry a
    // price with no currency, and the first run of the payment path printed
    // "1496 null" at a driver about to ask a customer for it.
    it('never prints the word null where a currency should be', () => {
        expect(formatAmount(1496, null)).toBe('1,496');
        expect(formatAmount(1496, '')).toBe('1,496');
        expect(formatAmount(1496, '  ')).toBe('1,496');
        expect(formatAmount(1496, 'RWF')).toBe('1,496 RWF');
    });

    it('has no amount to show when there is no price', () => {
        expect(formatAmount(null, 'RWF')).toBeNull();
        expect(formatAmount(undefined, 'RWF')).toBeNull();
    });

    // Postgres numerics arrive as strings over JSON.
    it('accepts a numeric that arrived as a string', () => {
        expect(formatAmount('12000.00', 'RWF')).toBe('12,000 RWF');
    });
});

describe('paymentPolicy', () => {
    it('offers both ways to collect at the door', () => {
        const p = paymentPolicy(order());
        expect(p.show).toBe(true);
        expect(p.amount).toBe('12,000 RWF');
        expect(p.momo.allowed).toBe(true);
        expect(p.cash.allowed).toBe(true);
        expect(p.note).toBeNull();
    });

    it('collects on the road too, not only once arrived', () => {
        expect(paymentPolicy(order({ status: 'IN_TRANSIT' })).momo.allowed).toBe(true);
    });

    // The null-currency case, and the reason it is not a blanket block: cash
    // is the fallback for exactly the jobs where something else is missing.
    it('blocks mobile money without a currency but still allows cash', () => {
        const p = paymentPolicy(order({ currency: null }));
        expect(p.currencyMissing).toBe(true);
        expect(p.momo.allowed).toBe(false);
        expect(p.momo.reason).toMatch(/cash can still be recorded/i);
        expect(p.cash.allowed).toBe(true);
        expect(p.amount).toBe('12,000');
    });

    it('refuses to collect against an estimate, and says it is one', () => {
        const p = paymentPolicy(order({ price_is_estimate: true }));
        expect(p.momo.allowed).toBe(false);
        expect(p.cash.allowed).toBe(false);
        expect(p.note).toMatch(/estimate, not a final price/i);
    });

    it('says so when dispatch has never priced the job', () => {
        const p = paymentPolicy(order({ price_total: null }));
        expect(p.show).toBe(true);
        expect(p.amount).toBeNull();
        expect(p.note).toMatch(/not put a price on this job/i);
        expect(p.cash.allowed).toBe(false);
    });

    describe('once it is paid there is nothing to ask for', () => {
        it('names the method it was paid by', () => {
            expect(paymentPolicy(order({ payment_status: 'PAID', payment_method: 'CASH' })).paidLabel)
                .toBe('Paid in cash');
            expect(paymentPolicy(order({ payment_status: 'PAID', payment_method: 'MOMO' })).paidLabel)
                .toBe('Paid by mobile money');
        });

        it('still says paid when the method is not recorded', () => {
            expect(paymentPolicy(order({ payment_status: 'PAID', payment_method: null })).paidLabel).toBe('Paid');
        });

        it('offers no way to charge again', () => {
            const p = paymentPolicy(order({ payment_status: 'PAID', payment_method: 'MOMO' }));
            expect(p.momo.allowed).toBe(false);
            expect(p.cash.allowed).toBe(false);
        });
    });

    // The gap worth warning a driver about rather than letting them discover:
    // the server takes payment from IN_TRANSIT and ARRIVED only, so closing
    // the job first makes the fare unrecordable.
    it('warns rather than offering a button once the job is closed unpaid', () => {
        const p = paymentPolicy(order({ status: 'DELIVERED' }));
        expect(p.momo.allowed).toBe(false);
        expect(p.cash.allowed).toBe(false);
        expect(p.note).toMatch(/closed before the fare was recorded/i);
        // The amount stays visible — dispatch will need to know what is owed.
        expect(p.amount).toBe('12,000 RWF');
    });

    it('says the fare comes later while the load is still being collected', () => {
        for (const status of ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP']) {
            const p = paymentPolicy(order({ status }));
            expect(p.cash.allowed).toBe(false);
            expect(p.note).toMatch(/once you are on the road/i);
        }
    });

    describe('money has no place on these at all', () => {
        it('shows nothing on a job the driver has not accepted', () => {
            expect(paymentPolicy(order({ status: 'OFFERED' })).show).toBe(false);
        });

        it('shows nothing on a cancelled job', () => {
            expect(paymentPolicy(order({ status: 'CANCELLED' })).show).toBe(false);
        });

        it('shows nothing when there is no order yet', () => {
            expect(paymentPolicy(null).show).toBe(false);
            expect(paymentPolicy(undefined).show).toBe(false);
        });
    });
});
