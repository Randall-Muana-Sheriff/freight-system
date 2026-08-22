// The time a dispatcher is actually looking at a clock and seeing.
//
// Containers run in UTC, which is right for storage and wrong for anything a
// person reads. `new Date().toLocaleTimeString()` with no zone takes the
// server's, so every Telegram alert this system sends has been stamped two
// hours behind Kigali -- a safety incident reported at 04:48 arriving in
// dispatch labelled 2:48 AM. Timestamps that are quietly wrong are worse than
// absent ones, because nobody thinks to doubt them.
//
// Configurable rather than fixed to Kigali. Hardcoding the right answer for
// Rwanda would be the same mistake one country later, and this is the kind of
// value that has to be settable per deployment rather than per release.
const ZONE = process.env.MARKET_TIMEZONE || 'Africa/Kigali';

// 24-hour, because "2:48" without an AM/PM read at a glance in an alert is
// ambiguous exactly when it matters.
export function marketTime(value = new Date()) {
    return new Date(value).toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
}

export function marketDateTime(value = new Date()) {
    return new Date(value).toLocaleString('en-GB', {
        timeZone: ZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

export const MARKET_TIMEZONE = ZONE;
