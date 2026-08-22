import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToken } from '../utils/placeToken.js';

// Normalisation is the whole economy of this cache. The backlog carried 160
// address lines that were only 9 distinct places; if two spellings of one
// place normalise differently, that saving disappears and each spelling
// spends its own throttled lookup.
test('the same place written differently is one token', () => {
    const spellings = [
        'Kimironko Market, Shop 14',
        'kimironko market shop 14',
        '  KIMIRONKO   MARKET  SHOP 14  ',
        'Kimironko Market -- Shop 14',
    ];
    const tokens = new Set(spellings.map(normalizeToken));
    assert.equal(tokens.size, 1, `expected one token, got ${[...tokens].join(' | ')}`);
    assert.equal([...tokens][0], 'kimironko market shop 14');
});

test('two different places stay two tokens', () => {
    assert.notEqual(normalizeToken('Gikondo'), normalizeToken('Kicukiro'));
});

// House and gate numbers are part of the name, not noise. "Kacyiru House 22"
// and "Kacyiru House 23" are different addresses and must not collapse into
// one cached point.
test('digits survive normalisation', () => {
    assert.equal(normalizeToken('Kacyiru House 22'), 'kacyiru house 22');
    assert.notEqual(normalizeToken('Kacyiru House 22'), normalizeToken('Kacyiru House 23'));
});

test('nothing in, nothing out', () => {
    for (const empty of ['', '   ', null, undefined, ',,,', '---']) {
        assert.equal(normalizeToken(empty), '', `expected '' for ${JSON.stringify(empty)}`);
    }
});
