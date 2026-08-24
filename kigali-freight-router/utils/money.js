/**
 * Which currencies a set of amounts is actually in.
 *
 * Its own function because "the currency of these rows" is a question that
 * has three answers, not two, and the third one is the expensive one:
 *
 *   none    -- nothing priced, so there is no unit to charge in
 *   one     -- the ordinary case, safe to label and safe to total
 *   several -- a sum across them is a number with no honest unit
 *
 * The third had a real bug behind it. cashOwedBy summed a driver's
 * outstanding commission with a plain reduce and reported it against
 * rows[0].currency, so a debt of 2,000 RWF and 15 USD came back as "2015 RWF"
 * -- one prompt that overcharges in francs, undercharges in dollars, and
 * marks both jobs settled. Unreachable while every rate card is in francs,
 * which is exactly why nobody would have found it.
 *
 * Blank and null currencies are dropped rather than counted as a distinct
 * unit: a row with no currency recorded is a row we know nothing about, not a
 * row in some fourth currency.
 *
 * Case is folded, and returned uppercase, because momoClient's
 * resolveCurrency already uppercases before it charges anything. Without the
 * fold, 'rwf' and 'RWF' count as two currencies here and refuse a settlement
 * that the charge path would have handled identically -- the guard
 * disagreeing with the thing it guards. Uppercase is also what ISO 4217 and
 * MTN both expect, so this is the form to charge in as well as compare in.
 *
 * pricing_rates.currency is plain text with no CHECK constraint, so lowercase
 * is a hand-written row or a future admin form away.
 *
 * @param {Array<{ currency?: string | null }>} rows
 * @returns {string[]} distinct, non-blank, uppercased currencies, in first-seen order
 */
export function distinctCurrencies(rows) {
    return [...new Set((rows || []).map((r) => (r?.currency || '').trim().toUpperCase()).filter(Boolean))];
}

/**
 * The single currency of a set of rows, or null when there isn't one.
 *
 * Null means "do not put a unit on this figure" -- the same rule the driver
 * app's formatAmount and the fare card already follow. It deliberately does
 * not fall back to the first row: that fallback is the bug above.
 *
 * @param {Array<{ currency?: string | null }>} rows
 * @returns {string | null}
 */
export function soleCurrency(rows) {
    const found = distinctCurrencies(rows);
    return found.length === 1 ? found[0] : null;
}
