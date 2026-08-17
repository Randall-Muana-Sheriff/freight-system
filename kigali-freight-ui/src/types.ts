// src/types.ts — shared domain shapes for the dispatch dashboard.
//
// Modeled from actual frontend usage (what components destructure and
// render), not an exhaustive audit of every backend query — this app has
// no runtime response validation (no zod/io-ts), so these describe the
// contract the frontend already relies on today, not a guarantee the
// backend can never violate it. Fields the frontend never reads are
// intentionally omitted rather than guessed.

export type UserRole = 'admin' | 'dispatcher' | 'driver';

export interface StaffUser {
    id: number;
    username?: string;
    email?: string;
    fullName?: string;
    role: UserRole;
    status?: string;
    staffId?: string;
    phoneNumber?: string;
    // Only meaningful for role: 'driver' — null for staff accounts. Backed
    // by the same "all 5 required documents approved" / "has a current
    // fleet vehicle" checks the backend enforces at assignment time (see
    // isDriverVerified in the router), so a driver missing either never
    // appears as assignable in the dispatcher's driver pickers.
    verified?: boolean | null;
    hasVehicle?: boolean | null;
    // Today's pre-departure checks. Deliberately not part of
    // isAssignableDriver below: a missed tick should prompt a conversation,
    // not strand a driver mid-shift. Null for non-driver accounts.
    safetyChecksDone?: number | null;
    safetyChecksTotal?: number | null;
    safetyChecksAt?: string | null;
}

// Single definition of "assignable" reused by every driver picker used for
// order assignment/reassignment — keeps them from drifting apart if this
// definition ever changes.
export function isAssignableDriver(d: StaffUser): boolean {
    // status matters as much as the documents: a suspended driver is
    // blocked at login, and offering them in a picker would only produce
    // an assignment nobody can act on.
    return d.status !== 'suspended' && Boolean(d.verified) && Boolean(d.hasVehicle);
}

// Short, scannable summary of today's pre-departure checks, for the
// driver pickers. Kept next to isAssignableDriver so the two stay
// obviously separate: this informs the choice, it does not restrict it.
export function describeDriverChecks(d: StaffUser): string {
    if (d.role !== 'driver' || d.safetyChecksTotal == null) return '';
    const done = d.safetyChecksDone ?? 0;
    if (done === 0) return 'no checks today';
    if (done < d.safetyChecksTotal) return `checks ${done}/${d.safetyChecksTotal}`;
    return 'checks done';
}

export interface Hub {
    id: number;
    name: string;
    code: string;
    lat: number;
    lng: number;
}

export interface VehicleType {
    id: number;
    name: string;
}

export interface Vehicle {
    id: number;
    plateNumber?: string;
    name?: string;
    vehicleType?: string;
    type?: string;
    currentDriverId?: number | null;
    maxWeightKg?: number;
}

export interface Order {
    id: number;
    cargo_description: string;
    weight_kg: number;
    origin_hub_name?: string;
    status: string;
    assigned_to?: string | null;
    delivery_lat?: number;
    delivery_lng?: number;
    // Null on a customer-placed order until a dispatcher pins it — which is
    // what the "Place on map" control in OrderRow exists to do.
    pickup_lat?: number | null;
    pickup_lng?: number | null;
    updated_at?: string;
    priority?: 'high' | 'normal' | 'low';
    // Present on orders submitted through the public site. A 'public' order
    // has no coordinates and no hub until a dispatcher places it, so these
    // are the only location and contact information available for it.
    source?: 'dispatch' | 'public';
    tracking_token?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    pickup_address_text?: string | null;
    delivery_address_text?: string | null;
    special_instructions?: string | null;
}

export interface OrderActivityEvent {
    orderId: number;
    cargo_description?: string;
    status: string;
    timestamp: string;
    driverName?: string;
    photoUrl?: string;
    locationFlagged?: boolean;
    distanceFromTargetM?: number;
}

export interface RecentDelivery {
    id: string | number;
    order_id: number;
    driver_name: string;
    photo_url: string;
    cargo_description?: string;
    confirmed_at: string;
    location_flagged?: boolean;
    distance_from_target_m?: number;
}

export interface DriverSuggestion {
    driverName: string;
    distanceFromPickupKm: number;
}

export interface OrderBatch {
    batch_id: string;
    origin_cluster: string;
    total_weight_kg: number;
    shipments: Order[];
}

export interface OrderHistoryEntry {
    previous_status?: string;
    new_status: string;
    changed_by: string;
    changed_at: string;
}

export interface Geofence {
    id: number;
    name: string;
    speedLimitKmh: number;
    geojson: { coordinates: [number, number][][] };
}

export interface GeofenceViolation {
    id?: number | string;
    driverName: string;
    type?: string;
    enteredAt?: string;
    description?: string;
    [key: string]: unknown;
}

export interface TrackedAsset {
    driverName: string;
    lat: number;
    lng: number;
    vehicleType?: string;
    velocityKmh?: number;
    lastSeen?: string;
}

export interface SavedRoute {
    id: number | string;
    geojsonSimplified?: unknown;
    geojson_simplified?: unknown;
    geojsonPath?: unknown;
    geojson_path?: unknown;
    geojson?: unknown;
    label?: string;
    vehicleId?: number | string;
    vehicle_id?: number | string;
    driverName?: string;
    driver_name?: string;
    aggregateDistanceKm?: number;
    aggregate_distance_km?: number;
    distanceKm?: number;
}

export interface PlaybackRoute {
    id: string | number;
    label?: string;
}

export interface OptimizedRouteNode {
    lat: number;
    lng: number;
    name?: string;
    demand?: number;
}

export interface OptimizedRouteGroup {
    sequence: OptimizedRouteNode[];
    roadGeometry?: [number, number][];
}

export interface Incident {
    id: number;
    description?: string;
    status: string;
    driver_name?: string;
    created_at?: string;
    resolved_at?: string | null;
    photo_url?: string | null;
    lat?: number | null;
    lng?: number | null;
    severity?: 'low' | 'medium' | 'high' | null;
    aiAnalysis?: { suspectedInjury?: boolean; vehicleDriveable?: boolean; summary?: string } | null;
    orderCargoDescription?: string | null;
    orderStatus?: string | null;
    [key: string]: unknown;
}

export interface KioskDevice {
    id: number;
    label: string;
    createdAt: string;
    revokedAt?: string | null;
    lastSeenAt?: string | null;
}

export type LatLng = [number, number];
