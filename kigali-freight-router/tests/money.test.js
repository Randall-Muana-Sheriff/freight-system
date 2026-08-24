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

// Called with junk rather than an array — a query that failed and returned
// undefined must not take the whole settlement path down with it.
test('a missing or malformed row set is survivable', () => {
    assert.deepEqual(distinctCurrencies(null), []);
    assert.deepEqual(distinctCurrencies(undefined), []);
    assert.deepEqual(distinctCurrencies([null, undefined]), []);
});
