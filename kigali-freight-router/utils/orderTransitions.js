// What an order is allowed to do next.
//
// There was no such rule before this file. updateOrderStatus checked that the
// TARGET status was a known string and never looked at where the order was
// coming from, so every state could reach every other. Reproduced against a
// real driver session: ASSIGNED -> DELIVERED in one request, with no photo,
// no recipient code, no location check and no confirmation row. The proof
// that confirmDelivery demands was bypassable by calling a different endpoint.
//
// Two rules, and the second one is the important one:
//
//   1. An order moves forward through its journey, or it is cancelled. It
//      does not go back, and it does not leave a terminal state.
//   2. DELIVERED is not reachable here AT ALL, by any role. It is earned by
//      producing evidence -- a photograph, or a code the recipient read out --
//      and confirmDelivery is the only door with that lock on it. A second
//      door that grants the same state for free is not a shortcut, it is the
//      absence of the lock.
//
// Derived from what the system actually does, not from what looked tidy. The
// driver app walks ASSIGNED -> AT_PICKUP -> IN_TRANSIT -> ARRIVED and then
// hands off to the proof flow; it never sends PICKED_UP and never sends
// DELIVERED to this endpoint. PICKED_UP stays legal because older records and
// other clients use it.

export const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];

// Only ever set by confirmDelivery, which is why it appears in no `to` list.
const ALLOWED = {
    PENDING:    ['OFFERED', 'ASSIGNED', 'CANCELLED'],
    // Declining or expiring returns the job to the queue.
    OFFERED:    ['ASSIGNED', 'PENDING', 'CANCELLED'],
    // ASSIGNED -> ASSIGNED is a reassignment to a different driver;
    // ASSIGNED -> PENDING is an unassignment back to the queue.
    // IN_TRANSIT is reachable straight from ASSIGNED: a driver who collects
    // without recording a pickup step is untidy, not dangerous, and it skips
    // nothing that guards money or proof. Tightening beyond what is warranted
    // breaks real flows to buy nothing.
    ASSIGNED:   ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'PENDING', 'CANCELLED'],
    AT_PICKUP:  ['PICKED_UP', 'IN_TRANSIT', 'CANCELLED'],
    PICKED_UP:  ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['ARRIVED', 'CANCELLED'],
    // Not DELIVERED. See rule 2.
    ARRIVED:    ['CANCELLED'],
    DELIVERED:  [],
    CANCELLED:  [],
};

// The one state confirmDelivery may close from. A driver reaches the address
// first and proves the handover second; closing a job that never arrived
// means the arrival was never recorded, which is the thing the customer's
// timeline is built from.
export const DELIVERABLE_FROM = ['ARRIVED'];

export function isTerminal(status) {
    return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from, to) {
    if (from === to && from !== 'ASSIGNED') return false;
    return (ALLOWED[from] || []).includes(to);
}

/**
 * Why a transition was refused, in words a dispatcher can act on.
 *
 * Three different refusals rather than one, because "cannot move that order"
 * sends somebody looking for a fault in the wrong place: a finished job, a
 * step out of order, and a state that has to be earned are three unrelated
 * problems with three different next actions.
 */
export function refusalFor(from, to) {
    if (to === 'DELIVERED') {
        return {
            code: 'ORDERS_STATUS_NEEDS_PROOF',
            message: 'A delivery is closed by taking a photo or entering the recipient\'s code, not by changing its status.',
        };
    }
    if (isTerminal(from)) {
        return {
            code: 'ORDERS_STATUS_TERMINAL',
            message: `This order is already ${from.toLowerCase()} and cannot be moved again.`,
        };
    }
    return {
        code: 'ORDERS_STATUS_OUT_OF_SEQUENCE',
        message: `An order cannot go from ${from.toLowerCase().replace('_', ' ')} to ${to.toLowerCase().replace('_', ' ')}.`,
    };
}
