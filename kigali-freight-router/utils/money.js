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

/**
 * What currency to settle a payment in, or a refusal.
 *
 * Extracted from momoClient so it can be tested at all. It lived there as a
 * closure over a module-level constant read from MOMO_CURRENCY at import
 * time, which meant exercising it required a fresh process per case — so it
 * was never exercised, despite being the guard that stops the single most
 * expensive mistake this system can make.
 *
 * That mistake is not hypothetical. MOMO_CURRENCY defaulted to 'EUR' while
 * docker-compose passed an empty string, so a 15,000 RWF fare would have gone
 * to MTN as 15,000 EUR -- roughly 22 million francs, taken from a customer at
 * a gate. The order's own currency is the truth here, because it came from
 * the rate card the price was computed against.
 *
 * Returns a result rather than throwing so it stays free of MomoError and
 * testable without it; momoClient turns a refusal back into one.
 *
 * @param {string|null|undefined} orderCurrency the currency the order is priced in
 * @param {string|null|undefined} override the MOMO_CURRENCY escape hatch
 * @returns {{ok: true, currency: string} | {ok: false, code: string, message: string}}
 */
export function resolveSettlementCurrency(orderCurrency, override) {
    const wanted = String(orderCurrency || '').trim().toUpperCase();
    if (!wanted) {
        return { ok: false, code: 'CURRENCY_MISSING', message: 'No currency on the order to settle in.' };
    }
    const forced = String(override || '').trim().toUpperCase();
    // A disagreement is a misconfiguration worth stopping for, not a conflict
    // to resolve in either direction. Preferring the override would charge the
    // wrong currency; preferring the order would silently ignore a deliberate
    // operator setting.
    if (forced && forced !== wanted) {
        return {
            ok: false,
            code: 'CURRENCY_MISMATCH',
            message: `MOMO_CURRENCY is ${forced} but this order is priced in ${wanted}. `
                + 'Refusing rather than sending an amount in the wrong currency.',
        };
    }
    return { ok: true, currency: forced || wanted };
}
