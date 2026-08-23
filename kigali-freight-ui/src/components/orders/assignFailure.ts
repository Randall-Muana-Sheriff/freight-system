// How a refused assignment is put to a dispatcher.
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
        // Not a fault to retry — the order has never been pinned, so nobody
        // knows where the driver is being sent or what the job is worth.
        ORDERS_ASSIGN_UNPLACED: 'Place these on the map first',
        ORDERS_ASSIGN_DRIVER_UNVERIFIED: 'That driver’s paperwork is not in date',
        ORDERS_ASSIGN_NO_VEHICLE: 'That driver has no vehicle assigned',
        ORDERS_ASSIGN_CAPACITY_EXCEEDED: 'That is more than the vehicle can carry',
    };

    return { title: (code && titles[code]) || fallback, body, tone: 'danger' };
}
