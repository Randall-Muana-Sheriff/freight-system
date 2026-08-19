// What to tell a customer, and when. No database, no SMS gateway, no
// config — deliberately, so the rule can be tested on its own the way
// routeSequencing.js can. The first version of this lived inside the
// service next to the pool import, which meant asserting "does ARRIVED
// earn a text?" required a working DB_USER.

// Only the moments a customer can act on, or would worry about not
// hearing. Deliberately not every transition:
//
//   ASSIGNED    — true, but nothing they can do with it; a driver's name
//                 is not news until the cargo actually moves.
//   IN_TRANSIT  — the same journey as PICKED_UP from outside the cab.
//   ARRIVED     — the driver is at the door; the knock is the notification.
//
// Each message costs real money to send, so the bar is "would they be glad
// this arrived", not "did something change".
const MESSAGES = {
    PICKED_UP: (code) =>
        `Inzira: your consignment has been collected and is on its way.${code ? ` Track it with code ${code}.` : ''}`,
    DELIVERED: (code) =>
        `Inzira: your consignment has been delivered.${code ? ` See the handover photo with code ${code}.` : ''}`,
    CANCELLED: (code) =>
        `Inzira: your order has been cancelled. Please contact us if that is unexpected.${code ? ` Code ${code}.` : ''}`,
};

export const NOTIFIED_STATUSES = Object.keys(MESSAGES);

// Whether this transition should produce a text at all.
export function shouldNotify(previousStatus, newStatus) {
    if (!newStatus || previousStatus === newStatus) return false;
    return Object.hasOwn(MESSAGES, newStatus);
}

// The text itself. Returns null for a status nobody is told about, so a
// caller cannot accidentally send an empty message.
export function noticeFor(newStatus, trackingToken) {
    const build = MESSAGES[newStatus];
    return build ? build(trackingToken) : null;
}
