// Who is allowed to hear what.
//
// Every emission in this codebase used to be a bare io.emit(), which fans out
// to every connected socket. Socket auth accepts any valid token, drivers
// included, so a driver received the whole dispatch feed: every other
// driver's live position, the fleet snapshot on connect, customer names and
// phone numbers on order:created, other drivers' speeding alerts, and — once
// payouts run — what every other driver is paid.
//
// The driver app was already filtering the events it did not want, in
// JavaScript, on the device. That is a courtesy to the UI and not a boundary:
// the data still arrived, and anyone can delete a line of their own client or
// simply watch the socket. The filter's own predicate said what the boundary
// should be, so this is that predicate moved to the server, where removing it
// is not the client's decision to make.
//
// Two rooms. Dispatch hears everything about the operation; a driver hears
// only what is about their own work.
import { io } from '../server.js';

export const DISPATCH_ROOM = 'dispatch';

export function driverRoom(username) {
    return `driver:${String(username).toLowerCase()}`;
}

/** Operation-wide. Staff only: fleet positions, the queue, other people's incidents. */
export function toDispatch(event, payload) {
    try {
        io.to(DISPATCH_ROOM).emit(event, payload);
    } catch { /* the socket is a convenience; the database is the record */ }
}

/** One driver, about their own job. */
export function toDriver(username, event, payload) {
    if (!username) return;
    try {
        io.to(driverRoom(username)).emit(event, payload);
    } catch { /* as above */ }
}

/**
 * Both, for the events that are genuinely two people's business — a status
 * change belongs to the board and to the driver holding the job.
 *
 * Sent as two addressed emissions rather than one broadcast, so adding a
 * third kind of listener later cannot quietly widen who receives this.
 */
export function toDispatchAndDriver(username, event, payload) {
    toDispatch(event, payload);
    toDriver(username, event, payload);
}
