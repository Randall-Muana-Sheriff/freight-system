import { describe, it, expect } from '@jest/globals';
import { explainPayout, currencyForTotals, hasMixedCurrencies } from './earnings';

const row = (over: Partial<Parameters<typeof explainPayout>[0]> = {}) => ({
    status: 'QUEUED', release_at: null, failure_reason: null, ...over,
});

describe('explainPayout', () => {
    // The distinction the whole screen turns on. A payout row exists from the
    // moment the customer pays; the transfer follows minutes later. Calling
    // anything but SUCCESSFUL "paid" sends a driver to check a wallet with
    // nothing new in it.
    describe('only money that has landed is called paid', () => {
        it('says paid when it is actually in the wallet', () => {
            const m = explainPayout(row({ status: 'SUCCESSFUL' }));
            expect(m.tone).toBe('good');
            expect(m.detail).toMatch(/in your mobile money wallet/i);
        });

        it('does not say paid while the transfer is still in flight', () => {
            const m = explainPayout(row({ status: 'SENDING' }));
            expect(m.tone).toBe('pending');
            expect(m.label).not.toMatch(/^paid$/i);
            expect(m.detail).toMatch(/should land shortly/i);
        });

        it('does not say paid on money that has not been sent yet', () => {
            const m = explainPayout(row({ status: 'QUEUED' }));
            expect(m.tone).toBe('pending');
            expect(m.detail).toMatch(/^Earned\./);
        });
    });

    describe('a queued payout says when, when it knows', () => {
        it('counts the wait in minutes', () => {
            const at = new Date(Date.now() + 12 * 60000).toISOString();
            expect(explainPayout(row({ release_at: at })).detail).toMatch(/about 12 minutes/);
        });

        it('counts it in hours once it is further out', () => {
            const at = new Date(Date.now() + 3 * 3600_000).toISOString();
            expect(explainPayout(row({ release_at: at })).detail).toMatch(/about 3 hours/);
        });

        it('says it is due rather than showing a negative wait', () => {
            const at = new Date(Date.now() - 60000).toISOString();
            expect(explainPayout(row({ release_at: at })).detail).toMatch(/any moment/i);
        });

        it('still says something useful with no release time at all', () => {
            expect(explainPayout(row({ release_at: null })).detail).toMatch(/waiting to be sent/i);
            expect(explainPayout(row({ release_at: 'not a date' })).detail).toMatch(/waiting to be sent/i);
        });
    });

    // Five attempts are exhausted by the time a row reads FAILED, so telling
    // a driver to wait would be telling them to wait for ever.
    describe('a failed transfer sends the driver to a person', () => {
        it('says it will not retry, and keeps the reason', () => {
            const m = explainPayout(row({ status: 'FAILED', failure_reason: 'Wallet not registered.' }));
            expect(m.tone).toBe('bad');
            expect(m.needsAction).toBe(true);
            expect(m.detail).toContain('Wallet not registered.');
            expect(m.detail).toMatch(/will not retry on its own/i);
        });

        it('still says what to do when no reason came back', () => {
            const m = explainPayout(row({ status: 'FAILED', failure_reason: null }));
            expect(m.detail).toMatch(/contact dispatch/i);
        });
    });

    describe('statuses this app was not taught', () => {
        // HELD is not produced by any code path today. Rendering it is the
        // requirement; crashing on it is the thing to avoid.
        it('renders HELD rather than falling over', () => {
            const m = explainPayout(row({ status: 'HELD' }));
            expect(m.label).toBe('Held');
            expect(m.needsAction).toBe(true);
        });

        it('renders something entirely new without calling it paid', () => {
            const m = explainPayout(row({ status: 'REVERSED' }));
            expect(m.label).toBe('REVERSED');
            expect(m.tone).not.toBe('good');
            expect(m.needsAction).toBe(true);
        });

        it('survives a missing status', () => {
            expect(explainPayout(row({ status: '' })).label).toBe('Unknown');
        });

        it('does not care about case', () => {
            expect(explainPayout(row({ status: 'successful' })).tone).toBe('good');
        });
    });
});

// The server's paidOut and onTheWay are bare sums with no currency on them,
// while each payout carries its own. Fine while they all match; a lie the
// moment they do not.
describe('labelling a total', () => {
    it('uses the one currency when every row agrees', () => {
        expect(currencyForTotals([{ currency: 'RWF' }, { currency: 'RWF' }])).toBe('RWF');
        expect(hasMixedCurrencies([{ currency: 'RWF' }, { currency: 'RWF' }])).toBe(false);
    });

    it('refuses to label a total that adds two currencies together', () => {
        expect(currencyForTotals([{ currency: 'RWF' }, { currency: 'USD' }])).toBeNull();
        expect(hasMixedCurrencies([{ currency: 'RWF' }, { currency: 'USD' }])).toBe(true);
    });

    it('ignores rows with no currency rather than treating null as its own', () => {
        expect(currencyForTotals([{ currency: 'RWF' }, { currency: null }])).toBe('RWF');
        expect(hasMixedCurrencies([{ currency: 'RWF' }, { currency: null }])).toBe(false);
    });

    it('has no unit to offer when nothing carries one', () => {
        expect(currencyForTotals([{ currency: null }, { currency: '' }])).toBeNull();
        expect(currencyForTotals([])).toBeNull();
    });
});

// Two spellings of one currency are one currency. Without the fold, a driver
// with a 'rwf' payout beside a 'RWF' one saw both totals lose their unit and a
// warning that their jobs were in more than one currency. momoClient
// uppercases before charging and the totals are grouped by UPPER(TRIM(...)),
// so every other layer had already agreed they were the same.
describe('currency case', () => {
    const row = (currency: string | null) => ({ currency });

    it('does not split one currency into two on case alone', () => {
        expect(currencyForTotals([row('rwf'), row('RWF')])).toBe('RWF');
        expect(hasMixedCurrencies([row('rwf'), row('RWF')])).toBe(false);
    });

    it('returns the chargeable uppercase form', () => {
        expect(currencyForTotals([row('rwf')])).toBe('RWF');
    });

    it('still reports a genuinely mixed set', () => {
        expect(currencyForTotals([row('rwf'), row('usd')])).toBeNull();
        expect(hasMixedCurrencies([row('rwf'), row('usd')])).toBe(true);
    });

    it('ignores blanks and nulls rather than counting them', () => {
        expect(currencyForTotals([row('RWF'), row(null), row('  ')])).toBe('RWF');
        expect(hasMixedCurrencies([row('RWF'), row(null)])).toBe(false);
    });
});
