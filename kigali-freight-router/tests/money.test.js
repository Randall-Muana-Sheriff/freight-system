import test from 'node:test';
import assert from 'node:assert/strict';
import { distinctCurrencies, soleCurrency } from '../utils/money.js';

// The bug this exists to stop: a driver's outstanding commission was summed
// with a plain reduce and reported against rows[0].currency, so 2,000 RWF plus
// 15 USD came back as "2015 RWF". One MoMo prompt would have taken 2,015
// francs and marked the dollar job settled too.
test('a sum across currencies has no single currency to label it with', () => {
    const rows = [{ currency: 'RWF' }, { currency: 'USD' }];
    assert.deepEqual(distinctCurrencies(rows), ['RWF', 'USD']);
    assert.equal(soleCurrency(rows), null, 'must not fall back to the first row');
});

test('the ordinary single-currency case is unchanged', () => {
    const rows = [{ currency: 'RWF' }, { currency: 'RWF' }, { currency: 'RWF' }];
    assert.deepEqual(distinctCurrencies(rows), ['RWF']);
    assert.equal(soleCurrency(rows), 'RWF');
});

// A row with no currency recorded is a row we know nothing about, not a row in
// a fourth currency. Counting it as one would refuse settlements that are
// perfectly payable.
test('blank and missing currencies are ignored, not counted as their own', () => {
    assert.deepEqual(distinctCurrencies([{ currency: 'RWF' }, { currency: null }, { currency: '  ' }]), ['RWF']);
    assert.equal(soleCurrency([{ currency: 'RWF' }, { currency: null }]), 'RWF');
});

test('nothing priced at all yields no currency rather than a wrong one', () => {
    assert.deepEqual(distinctCurrencies([]), []);
    assert.equal(soleCurrency([]), null);
    assert.equal(soleCurrency([{ currency: null }, { currency: '' }]), null);
});

test('whitespace around a currency does not create a second one', () => {
    assert.equal(soleCurrency([{ currency: 'RWF' }, { currency: ' RWF ' }]), 'RWF');
});

// momoClient's resolveCurrency uppercases before charging, so 'rwf' and 'RWF'
// reach MTN as the same currency. Counting them as two here would refuse a
// settlement the charge path handles identically -- the guard disagreeing with
// the thing it guards. Found by muana-26 exercising the helper rather than
// reading it.
test('case does not create a second currency, and the answer is chargeable', () => {
    assert.deepEqual(distinctCurrencies([{ currency: 'rwf' }, { currency: 'RWF' }]), ['RWF']);
    assert.equal(soleCurrency([{ currency: 'rwf' }, { currency: 'RWF' }]), 'RWF');
    // Uppercase out even when every input was lowercase: ISO 4217 and MTN both
    // want it that way, so this is the form to charge in.
    assert.equal(soleCurrency([{ currency: 'rwf' }]), 'RWF');
});

test('folding case does not hide a genuinely mixed debt', () => {
    assert.deepEqual(distinctCurrencies([{ currency: 'rwf' }, { currency: 'usd' }]), ['RWF', 'USD']);
    assert.equal(soleCurrency([{ currency: 'rwf' }, { currency: 'usd' }]), null);
});

// Called with junk rather than an array — a query that failed and returned
// undefined must not take the whole settlement path down with it.
test('a missing or malformed row set is survivable', () => {
    assert.deepEqual(distinctCurrencies(null), []);
    assert.deepEqual(distinctCurrencies(undefined), []);
    assert.deepEqual(distinctCurrencies([null, undefined]), []);
});
