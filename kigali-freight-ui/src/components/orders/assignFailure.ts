// How a refused action is put to a dispatcher.
//
// The server sends a code and a message. The message is already the specific
// half — it names the orders or the driver — so it is always shown. The code
// decides the heading, because "Could not assign those loads" tells a
// dispatcher nothing about what to do next, and these four failures each
// want something completely different: place the order, fix the driver's
// paperwork, give them a vehicle, or split the load. All of them arrive as a
// 4xx with the same shape, so before the code was carried through HttpError
// there was no way for this screen to tell them apart.
import { HttpError } from '../../utils/api';

export interface AssignFailure {
    title: string;
    body: string;
    tone: 'danger';
}

export function describeAssignFailure(err: unknown, kind: 'assign' | 'offer'): AssignFailure {
    const code = err instanceof HttpError ? err.code : null;
    const body = (err as Error)?.message || 'Please try again.';
    const fallback = kind === 'assign' ? 'Could not assign those loads' : 'Could not offer those loads';

    const titles: Record<string, string> = {
        // ── assignment ──────────────────────────────────────────────
        // Not a fault to retry — the order has never been pinned, so nobody
        // knows where the driver is being sent or what the job is worth.
        ORDERS_ASSIGN_UNPLACED: 'Place these on the map first',
        ORDERS_ASSIGN_DRIVER_UNVERIFIED: 'That driver’s paperwork is not in date',
        ORDERS_ASSIGN_NO_VEHICLE: 'That driver has no vehicle assigned',
        ORDERS_ASSIGN_CAPACITY_EXCEEDED: 'That is more than the vehicle can carry',

        // ── the state machine ───────────────────────────────────────
        // Three separate refusals rather than one, because a finished job, a
        // step taken out of order, and a state that has to be earned each
        // need a different next move from the dispatcher. Collapsing them
        // into "could not update" is what makes a person retry the same
        // thing twice and then ring somebody.
        ORDERS_STATUS_NEEDS_PROOF: 'A delivery has to be confirmed, not set',
        ORDERS_STATUS_TERMINAL: 'That job is already finished',
        ORDERS_STATUS_OUT_OF_SEQUENCE: 'That step comes later',
        ORDERS_DELIVERY_NOT_ARRIVED: 'The driver has not arrived yet',
        ORDERS_CANCEL_ALREADY_PAID: 'That job has been paid for',
        ORDERS_FORCE_REASON_REQUIRED: 'Say why you are forcing this',
        ORDERS_FORCE_NO_CHANGE: 'It is already in that state',
    };

    return { title: (code && titles[code]) || fallback, body, tone: 'danger' };
}
