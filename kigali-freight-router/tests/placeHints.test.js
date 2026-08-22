import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatePhrases, normalizeToken } from '../utils/placeToken.js';

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

// Production caught this one. "e2e gikondo industrial zone" missed as a whole
// phrase, and a walk that only drops trailing words arrives at "e2e" -- which
// Nominatim, biased to a Kigali viewbox, answered with a confident arbitrary
// point. The real place name has to be reachable by dropping the noise at the
// FRONT too.
test('the real place is reachable when the noise is at the front', () => {
    const tried = candidatePhrases('e2e gikondo industrial zone');
    const place = tried.indexOf('gikondo industrial zone');
    const noise = tried.indexOf('e2e');
    assert.ok(place > -1, 'never tries the phrase without its leading noise');
    assert.ok(place < noise, `tries the noise '${tried[noise]}' before the place '${tried[place]}'`);
    assert.ok(tried.includes('gikondo'), 'a place name in the middle must be reachable');
});

test('and when the noise is at the back', () => {
    const tried = candidatePhrases('gikondo depot gate 3');
    assert.ok(tried.indexOf('gikondo') > -1);
    assert.equal(tried[0], 'gikondo depot gate 3', 'the whole phrase is always tried first');
});

// Longer phrases are more specific, so a match on one is worth more than a
// match on a fragment. Trying a fragment first would take the vaguer answer.
test('candidates run longest to shortest', () => {
    const lengths = candidatePhrases('a bb ccc dddd eeee').map((p) => p.split(' ').length);
    assert.deepEqual(lengths, [...lengths].sort((x, y) => y - x), `out of order: ${lengths}`);
});

// Every attempt costs a second of a shared throttle, so a phrase must not
// generate an unbounded pile of them, and never the same one twice.
test('candidates are deduplicated and never absurdly short', () => {
    const tried = candidatePhrases('remera');
    assert.deepEqual(tried, ['remera'], 'a single word is one candidate, not two');
    assert.deepEqual(candidatePhrases('a b'), [], 'two-letter fragments are not place names');
    const many = candidatePhrases('one two three four five six');
    assert.equal(new Set(many).size, many.length, 'a phrase was queued twice');
});

// The fragments that actually went wrong in production were all made of
// nothing but address furniture. A phrase has to name something.
test('fragments made only of address words are never tried', () => {
    const tried = candidatePhrases('e2e gikondo industrial zone');
    for (const junk of ['zone', 'industrial zone', 'gate 3', 'the depot']) {
        assert.ok(!tried.includes(junk), `would have geocoded '${junk}'`);
    }
    assert.ok(tried.includes('gikondo'), 'the one real place name must survive');
});

test('an address word attached to a real name is still tried', () => {
    const tried = candidatePhrases('kimironko market shop 14');
    assert.ok(tried.includes('kimironko market'), 'a named market is a place');
    assert.ok(!tried.includes('market shop 14'), 'the furniture alone is not');
});
