import type { Trip, TripStop } from './api';

// What of a run can actually be drawn.
//
// A customer order sits in the queue with free-text addresses and no
// coordinates until a dispatcher places it on the map, so a run can hold
// stops with no position at all. They are skipped rather than guessed at —
// a pin dropped at the hub "for now" is worse than no pin, because it
// looks like information.
//
// Extracted from FleetMap so this decision can be tested without mounting
// Leaflet, for the same reason the router's sequencing maths lives outside
// its controller.

export interface PlacedStop extends TripStop {
    lat: number;
    lng: number;
}

export function placedStops(trip: Trip | null): PlacedStop[] {
    if (!trip) return [];
    return trip.stops.filter((s): s is PlacedStop => s.lat != null && s.lng != null);
}

// Leaflet wants [lat, lng] pairs. The line follows the run's own order,
// which is already the sequence the API returns.
export function tripPolyline(trip: Trip | null): [number, number][] {
    return placedStops(trip).map((s) => [s.lat, s.lng]);
}

export function isStopSettled(stop: TripStop): boolean {
    return stop.status === 'DONE' || stop.status === 'FAILED' || stop.status === 'SKIPPED';
}
