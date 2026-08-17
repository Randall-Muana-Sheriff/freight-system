import { describe, it, expect } from 'vitest';
import { placedStops, tripPolyline, isStopSettled } from './tripMapLayer';
import type { Trip, TripStop } from './api';

function stop(partial: Partial<TripStop>): TripStop {
    return {
        id: 1, order_id: 1, kind: 'DROP', sequence: 1, lat: -1.95, lng: 30.06,
        address_text: null, status: 'PENDING', failure_reason: null,
        cargo_description: 'Cargo', weight_kg: 10, order_status: 'ASSIGNED',
        customer_name: null, customer_phone: null, recipient_name: null,
        recipient_phone: null, special_instructions: null, tracking_token: null,
        priority: 'normal',
        ...partial,
    };
}

function trip(stops: TripStop[]): Trip {
    return {
        id: 1, driver_username: null, driver_full_name: null, vehicle_id: null,
        status: 'PLANNED', planned_distance_m: 1000, created_at: '', started_at: null,
        completed_at: null, stops, stopCount: stops.length,
        completedStopCount: 0, currentStop: stops[0] ?? null,
    };
}

describe('placedStops', () => {
    it('skips stops with no coordinates rather than plotting them somewhere', () => {
        // A customer order has free-text addresses and no position until a
        // dispatcher places it. Drawing it at a default would be a pin that
        // looks like information and is not.
        const t = trip([
            stop({ id: 1, sequence: 1, lat: null, lng: null }),
            stop({ id: 2, sequence: 2, lat: -1.95, lng: 30.06 }),
        ]);
        expect(placedStops(t).map((s) => s.id)).toEqual([2]);
    });

    it('treats a half-placed stop as unplaced', () => {
        const t = trip([stop({ id: 1, lat: -1.95, lng: null })]);
        expect(placedStops(t)).toEqual([]);
    });

    it('is empty for no run at all, so the map simply draws nothing', () => {
        expect(placedStops(null)).toEqual([]);
        expect(tripPolyline(null)).toEqual([]);
    });
});

describe('tripPolyline', () => {
    it('follows the run order and returns Leaflet [lat, lng] pairs', () => {
        // The API already returns stops in sequence; the line must not
        // re-sort them, or it would draw a route the driver is not doing.
        const t = trip([
            stop({ id: 1, sequence: 1, lat: -1.90, lng: 30.01 }),
            stop({ id: 2, sequence: 2, lat: -1.99, lng: 30.09 }),
            stop({ id: 3, sequence: 3, lat: -1.95, lng: 30.05 }),
        ]);
        expect(tripPolyline(t)).toEqual([
            [-1.90, 30.01],
            [-1.99, 30.09],
            [-1.95, 30.05],
        ]);
    });

    it('bridges a gap left by an unplaced stop instead of breaking the line', () => {
        const t = trip([
            stop({ id: 1, sequence: 1, lat: -1.90, lng: 30.01 }),
            stop({ id: 2, sequence: 2, lat: null, lng: null }),
            stop({ id: 3, sequence: 3, lat: -1.95, lng: 30.05 }),
        ]);
        expect(tripPolyline(t)).toEqual([[-1.90, 30.01], [-1.95, 30.05]]);
    });
});

describe('isStopSettled', () => {
    it('counts every way a stop can be finished, not just success', () => {
        // A failed stop is behind the driver too — drawing it as upcoming
        // would tell a dispatcher they are still going there.
        expect(isStopSettled(stop({ status: 'DONE' }))).toBe(true);
        expect(isStopSettled(stop({ status: 'FAILED' }))).toBe(true);
        expect(isStopSettled(stop({ status: 'SKIPPED' }))).toBe(true);
        expect(isStopSettled(stop({ status: 'PENDING' }))).toBe(false);
        // ARRIVED is where the driver is right now, not somewhere they have left.
        expect(isStopSettled(stop({ status: 'ARRIVED' }))).toBe(false);
    });
});
