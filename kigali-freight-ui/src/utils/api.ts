// src/utils/api.ts
import { getApiBase } from './runtimeConfig';
import type {
    Hub,
    VehicleType,
    Vehicle,
    Order,
    OrderBatch,
    OrderHistoryEntry,
    DriverSuggestion,
    Incident,
    RecentDelivery,
    StaffUser,
    SavedRoute,
    Geofence,
    KioskDevice,
    ReturnLoadCandidate,
    RateCard,
} from '../types';

export const API_BASE = getApiBase();

if (!API_BASE) {
    throw new Error(
        'Missing API base URL. For local dev, create a .env file from .env.example and set VITE_API_BASE_URL. ' +
        'In a deployed container, set the API_BASE_URL env var (see docker-entrypoint.sh).'
    );
}

export class HttpError extends Error {
    status: number;
    /** The server's machine-readable error code, where it sent one.
     *
     *  Carried because a status alone cannot tell two refusals apart: an
     *  assignment blocked because the order has never been placed on the map
     *  and one blocked because the driver's insurance has lapsed are both
     *  409s needing completely different things from the dispatcher. The
     *  server's own message is good enough to display; the code is what lets
     *  the screen offer the fix rather than only describe the problem. */
    code: string | null;
    constructor(message: string, status: number, code: string | null = null) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Registered by SocketContext so any expired/invalid token clears the
// session in one place, instead of every caller having to check the status.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
    unauthorizedHandler = handler;
}

async function parseResponse(res: Response): Promise<unknown> {
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : null;
    const acceptedResponse = res.status === 202;

    if (!res.ok && !acceptedResponse) {
        const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${res.status}`;
        if (res.status === 401 || res.status === 403) {
            unauthorizedHandler?.();
        }
        throw new HttpError(message, res.status, payload?.error?.code ?? payload?.code ?? null);
    }

    if (acceptedResponse && payload == null) {
        return { accepted: true };
    }

    if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
        return (payload as { data: unknown }).data;
    }

    return payload;
}

interface ApiFetchOptions {
    method?: string;
    token?: string | null;
    body?: unknown;
}

// Wraps fetch with the API base URL and JSON handling.
// Pass a token to automatically attach the Authorization header.
export async function apiFetch(path: string, { method = 'GET', token, body }: ApiFetchOptions = {}): Promise<unknown> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    return parseResponse(res);
}

// Fetch all committed or active routes
export async function fetchRoutes(token: string): Promise<SavedRoute[]> {
    return apiFetch('/api/routes', { method: 'GET', token }) as Promise<SavedRoute[]>;
}

export async function fetchGeofences(token: string): Promise<Geofence[]> {
    return apiFetch('/api/geofences', { method: 'GET', token }) as Promise<Geofence[]>;
}

export interface GeocodeResult {
    label: string;
    lat: number;
    lng: number;
}

// Address/place search, proxied through our backend to Nominatim (keeps
// its 1 req/sec usage policy + User-Agent requirement server-side instead
// of exposing that host directly to the browser).
export async function geocodeSearch(query: string, token: string): Promise<GeocodeResult[]> {
    const result = await apiFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, { method: 'GET', token }) as { results?: GeocodeResult[] } | null;
    return result?.results ?? [];
}

export interface OptimizeStop {
    lat: number;
    lng: number;
    demand?: number;
    [key: string]: unknown;
}





// Dispatch hubs, used to pre-fill pickup coordinates on the order form and
// managed directly from the Fleet tab.
export async function fetchHubs(token: string): Promise<Hub[]> {
    return apiFetch('/api/hubs', { method: 'GET', token }) as Promise<Hub[]>;
}

export async function createHub(hub: { name: string; code: string; lat: number; lng: number }, token: string) {
    return apiFetch('/api/hubs', { method: 'POST', token, body: hub });
}

export async function updateHub(id: number, hub: { name: string; code: string; lat: number; lng: number }, token: string) {
    return apiFetch(`/api/hubs/${id}`, { method: 'PATCH', token, body: hub });
}

export async function deleteHub(id: number, token: string) {
    return apiFetch(`/api/hubs/${id}`, { method: 'DELETE', token });
}

// Vehicle types populate the fleet registration form's "type" dropdown and
// are managed directly from the Fleet tab.
export async function fetchVehicleTypes(token: string): Promise<VehicleType[]> {
    return apiFetch('/api/vehicle-types', { method: 'GET', token }) as Promise<VehicleType[]>;
}

export async function createVehicleType(name: string, token: string) {
    return apiFetch('/api/vehicle-types', { method: 'POST', token, body: { name } });
}

export async function updateVehicleType(id: number, name: string, token: string) {
    return apiFetch(`/api/vehicle-types/${id}`, { method: 'PATCH', token, body: { name } });
}

export async function deleteVehicleType(id: number, token: string) {
    return apiFetch(`/api/vehicle-types/${id}`, { method: 'DELETE', token });
}

export async function fetchDispatchContact(token: string) {
    return apiFetch('/api/settings/dispatch-contact', { method: 'GET', token }) as Promise<{ phoneNumber: string | null }>;
}

export async function updateDispatchContact(phoneNumber: string, token: string) {
    return apiFetch('/api/settings/dispatch-contact', { method: 'PATCH', token, body: { phoneNumber } }) as Promise<{ phoneNumber: string | null }>;
}

export async function fetchActiveOrders(token: string): Promise<Order[]> {
    return apiFetch('/api/orders/active', { method: 'GET', token }) as Promise<Order[]>;
}

export interface CreateOrderPayload {
    cargo_description: string;
    weight_kg: number;
    origin_hub_id: number | string;
    delivery_lng: number;
    delivery_lat: number;
    recipient_name: string | null;
    recipient_phone: string | null;
    priority?: 'high' | 'normal' | 'low';
}

export async function createOrder(orderData: CreateOrderPayload, token: string) {
    const result = await apiFetch('/api/orders', { method: 'POST', token, body: orderData }) as { order?: unknown };
    return result?.order ?? result;
}

export async function assignOrders(orderIds: number[], driverName: string, token: string) {
    return apiFetch('/api/orders/assign', { method: 'POST', token, body: { orderIds, driverName } });
}

// Pins a customer-placed order to real coordinates so it appears on the
// fleet map and its ETA and route progress can be computed.
export async function placeOrderOnMap(
    orderId: number,
    coords: { pickupLat: number; pickupLng: number; deliveryLat: number; deliveryLng: number; originHubId?: number },
    token: string
) {
    return apiFetch(`/api/orders/${orderId}/place`, { method: 'PATCH', token, body: coords });
}

// Placing many bookings in one call.
//
// Every public booking arrives as free text with no coordinates, so placing is
// on the critical path of every customer order rather than a rare chore. The
// endpoint deliberately runs WITHOUT a transaction: a bad row must not throw
// away the good pins beside it, so failures come back as data with a 200
// rather than as an error. Treat partial success as the normal case.
//
// Placing is also the moment an estimated price becomes a real one, so the
// rows this returns supersede whatever the caller was holding.
export interface PlacementInput {
    orderId: number;
    pickupLat: number;
    pickupLng: number;
    deliveryLat: number;
    deliveryLng: number;
    originHubId?: number;
}

export interface PlaceBatchResult {
    placed: Order[];
    failed: { orderId: number; code: string; message: string }[];
    placedCount: number;
    failedCount: number;
}

export async function placeOrdersBatch(placements: PlacementInput[], token: string) {
    return apiFetch('/api/orders/place-batch', {
        method: 'PATCH', token, body: { placements },
    }) as Promise<PlaceBatchResult>;
}

// The dispatch queue sorts by priority, but until now nothing could change
// it after an order was created.
export async function setOrderPriority(orderId: number, priority: 'high' | 'normal' | 'low', token: string) {
    return apiFetch(`/api/orders/${orderId}/priority`, { method: 'PATCH', token, body: { priority } });
}

export async function fetchNearestDrivers(orderId: number, token: string): Promise<{ recommendedDrivers?: DriverSuggestion[] }> {
    return apiFetch(`/api/orders/${orderId}/nearest-drivers`, { method: 'GET', token }) as Promise<{ recommendedDrivers?: DriverSuggestion[] }>;
}

// What could ride home on this order. Only meaningful for a delivery outside
// Kigali: those are the ones charged for driving back empty, and the ones
// where pairing takes that charge off both bills.
// The partner path, beside assignOrders rather than instead of it. A fleet
// driver is given work; an independent one with their own truck is asked, and
// can say no. Both models run side by side.
export async function offerOrders(orderIds: number[], driverName: string, token: string, expiresInMinutes = 30) {
    return apiFetch('/api/orders/offer', {
        method: 'POST', token, body: { orderIds, driverName, expiresInMinutes },
    });
}

export async function fetchReturnLoads(orderId: number, token: string): Promise<{ candidates: ReturnLoadCandidate[] }> {
    return apiFetch(`/api/orders/${orderId}/return-loads`, { method: 'GET', token }) as Promise<{ candidates: ReturnLoadCandidate[] }>;
}

export async function fetchRateCards(token: string): Promise<{ rates: RateCard[] }> {
    return apiFetch('/api/pricing/rates', { method: 'GET', token }) as Promise<{ rates: RateCard[] }>;
}

// Supersedes rather than edits: the server writes a new row, so a quote
// already given stays explainable and a commission already taken is never
// silently restated. Only the fields actually changed need sending.
export async function saveRateCard(
    vehicleClass: string,
    changes: Record<string, number>,
    note: string,
    token: string,
): Promise<{ rate: RateCard }> {
    return apiFetch('/api/pricing/rates', {
        method: 'POST', token, body: { vehicleClass, note, ...changes },
    }) as Promise<{ rate: RateCard }>;
}

export async function fetchIncidents(token: string): Promise<Incident[]> {
    return apiFetch('/api/incidents', { method: 'GET', token }) as Promise<Incident[]>;
}

export async function fetchRecentDeliveries(token: string): Promise<RecentDelivery[]> {
    return apiFetch('/api/orders/deliveries/recent', { method: 'GET', token }) as Promise<RecentDelivery[]>;
}

export async function fetchInFlightOrders(token: string): Promise<Order[]> {
    return apiFetch('/api/orders/in-flight', { method: 'GET', token }) as Promise<Order[]>;
}

// Pass driverName to reassign to a different driver, or omit/null it to send
// the order back to the dispatch queue unassigned.
export async function reassignOrder(orderId: number, driverName: string | null, token: string) {
    return apiFetch(`/api/orders/${orderId}/reassign`, { method: 'PATCH', token, body: { driverName: driverName || null } });
}

export async function updateIncidentStatus(incidentId: number, status: string, token: string) {
    return apiFetch(`/api/incidents/${incidentId}/status`, { method: 'PATCH', token, body: { status } });
}

// Users with role 'driver' — used by both the order-assignment and
// vehicle-assignment flows.
export async function fetchDrivers(token: string): Promise<StaffUser[]> {
    const users = await apiFetch('/api/users', { method: 'GET', token }) as StaffUser[];
    return users.filter((u) => String(u.role).toLowerCase() === 'driver');
}

export async function fetchAdminStats(token: string) {
    return apiFetch('/api/stats', { method: 'GET', token });
}

// Spatial clustering of PENDING orders into batches a driver could pick up
// in one loop — read-only suggestions, dispatch still assigns manually.
export async function fetchBatchedOrders(token: string): Promise<OrderBatch[]> {
    return apiFetch('/api/orders/pooling', { method: 'GET', token }) as Promise<OrderBatch[]>;
}

export async function fetchOrderHistory(orderId: number, token: string): Promise<OrderHistoryEntry[]> {
    return apiFetch(`/api/orders/${orderId}/history`, { method: 'GET', token }) as Promise<OrderHistoryEntry[]>;
}

export async function fetchLiveFleetStatus(token: string) {
    return apiFetch('/api/fleet/telemetry-sheet', { method: 'GET', token });
}

// Compliance documents that have lapsed or are close to it. A lapsed one
// un-verifies its driver immediately, so this is the difference between a
// dispatcher renewing something on Monday and a driver vanishing from the
// assignable list on Tuesday with no explanation.
export interface ComplianceIssue {
    holderKind: 'driver' | 'vehicle';
    holder: string | null;
    plateNumber: string | null;
    documentType: string;
    expiresAt: string;
    expired: boolean;
}

export interface ComplianceReport {
    warningDays: number;
    expired: ComplianceIssue[];
    expiringSoon: ComplianceIssue[];
}

// The exception feed behind the Monitor workspace. Eight sources the backend
// already computed but nothing surfaced: unplaced bookings, unanswered offers,
// deliveries arrived but never closed, lapsed and expiring documents, stale
// GPS, open vehicle defects, and orders still carrying an estimated price.
//
// Two severities on purpose. `act` means a person has to do something now;
// `watch` is degrading but not yet blocking. If everything is an exception,
// nothing is. Counts are exact; items are the worst five of each.
export interface ExceptionItem {
    id: string | number;
    title: string;
    subtitle?: string | null;
    since?: string | null;
    orderId?: number | null;
    driver?: string | null;
}

export interface ExceptionGroup {
    key: string;
    label: string;
    severity: 'act' | 'watch';
    count: number;
    items: ExceptionItem[];
}

export interface ExceptionReport {
    generatedAt: string;
    groups: ExceptionGroup[];
}

// A dispatcher's own named filters. Persisted per user rather than in
// localStorage on purpose: a shared dispatch desk means one person's views
// would otherwise appear under whoever signs in next, which reads as the board
// changing by itself.
//
// POST is an upsert on the name — saving "Overdue north" twice replaces it and
// returns the same id, because a dispatcher reusing a name means the second
// one, not two rows wearing the same label. DELETE answers 404 for a view that
// is not yours, deliberately indistinguishable from one that never existed.
export interface SavedView {
    id: number;
    name: string;
    filter: Record<string, unknown>;
    updated_at?: string;
}

export async function fetchSavedViews(token: string) {
    return apiFetch('/api/saved-views', { method: 'GET', token }) as Promise<SavedView[]>;
}

export async function saveSavedView(name: string, filter: Record<string, unknown>, token: string) {
    return apiFetch('/api/saved-views', { method: 'POST', token, body: { name, filter } }) as Promise<SavedView>;
}

export async function deleteSavedView(id: number, token: string) {
    return apiFetch(`/api/saved-views/${id}`, { method: 'DELETE', token });
}

export async function fetchExceptions(token: string) {
    return apiFetch('/api/exceptions', { method: 'GET', token }) as Promise<ExceptionReport>;
}

export async function fetchComplianceIssues(token: string) {
    return apiFetch('/api/fleet/compliance', { method: 'GET', token }) as Promise<ComplianceReport>;
}

export interface BreadcrumbsResult {
    trail: [number, number][];
    survivingPointsCount: number;
}

// hours: lookback window for the trail (backend default 4). tolerance:
// RDP simplification in degrees (backend default 0.0001, ~11m).
export async function fetchDriverBreadcrumbs(
    driverName: string,
    token: string,
    { hours, tolerance }: { hours?: number; tolerance?: number } = {}
): Promise<BreadcrumbsResult> {
    const params = new URLSearchParams();
    if (hours != null) params.set('hours', String(hours));
    if (tolerance != null) params.set('tolerance', String(tolerance));
    const qs = params.toString();
    return apiFetch(`/api/fleet/history/${encodeURIComponent(driverName)}${qs ? `?${qs}` : ''}`, { method: 'GET', token }) as Promise<BreadcrumbsResult>;
}

export async function fetchFleetPerformanceReport(token: string) {
    return apiFetch('/api/fleet/analytics/performance', { method: 'GET', token });
}

export interface InviteDriverPayload {
    phoneNumber: string;
    fullName: string;
    vehicleId?: number | string;
}

export interface InviteDriverResult {
    staffId: string;
    inviteCode: string;
    smsSent: boolean;
    phoneNumber: string;
}

// Dispatcher-issued driver onboarding — replaces the old self-signup +
// approval path for drivers. Creates a pre-approved driver account (their
// username becomes their phone number) and a 6-character invite code the
// driver redeems from the mobile app.
export async function inviteDriver(payload: InviteDriverPayload, token: string): Promise<InviteDriverResult> {
    return apiFetch('/api/drivers/invite', { method: 'POST', token, body: payload }) as Promise<InviteDriverResult>;
}

// The backend half of the driver app's "Forgot your PIN? Contact dispatch"
// copy — clears the driver's PIN so they're prompted to set a new one at
// their next sign-in, without sending them through invite-code entry again.
// Suspend or reinstate. There is no delete: orders, status logs and
// delivery confirmations reference the username, and that history has to
// stay attributable after someone leaves.
export async function setUserStatus(userId: number, status: 'suspended' | 'approved', token: string) {
    return apiFetch(`/api/users/${userId}/status`, { method: 'PATCH', token, body: { status } });
}

export async function resetDriverPin(userId: number, token: string) {
    return apiFetch(`/api/users/${userId}/reset-driver-pin`, { method: 'POST', token });
}

// Vehicles with no driver currently assigned — used to populate the
// optional "assign a vehicle now" picker in the Invite Driver form.
export async function fetchUnassignedVehicles(token: string): Promise<Vehicle[]> {
    const vehicles = await apiFetch('/api/vehicles', { method: 'GET', token }) as Vehicle[];
    return vehicles.filter((v) => !v.currentDriverId);
}

// Driver compliance documents (national ID, license, vehicle registration,
// insurance, roadworthiness certificate) — admin review queue.
export async function fetchDriverDocuments(token: string) {
    return apiFetch('/api/driver-documents', { method: 'GET', token });
}

// holderKind is required because driver and vehicle documents live in
// separate tables with independent id sequences — an id alone does not say
// which. expiresAt is read off the certificate the reviewer is looking at;
// it is the one moment anyone actually has the document in front of them.
export async function updateDriverDocumentStatus(
    id: number,
    status: string,
    rejectionReason: string | null,
    token: string,
    // Not optional, and no default. The comment above said "required" while
    // the code quietly filled in 'driver' for anyone who forgot — which is
    // exactly what the revoke and reject-with-AI-reason paths did, sending a
    // vehicle document's id at the driver table. The server now refuses a
    // request without it; this makes the compiler refuse one first.
    options: { holderKind: 'driver' | 'vehicle'; expiresAt?: string | null }
) {
    return apiFetch(`/api/driver-documents/${id}/status`, {
        method: 'PATCH',
        token,
        body: {
            status,
            rejectionReason,
            holderKind: options.holderKind,
            expiresAt: options.expiresAt ?? null,
        },
    });
}

// Control-room/dispatch-desk/warehouse wall displays — admin-provisioned,
// read-only devices authenticated with their own long-lived, revocable
// token (not a staff login). See services/kioskAuthService.js.
export interface CreateKioskDeviceResult extends KioskDevice {
    token: string;
}

export async function createKioskDevice(label: string, token: string): Promise<CreateKioskDeviceResult> {
    return apiFetch('/api/kiosk-devices', { method: 'POST', token, body: { label } }) as Promise<CreateKioskDeviceResult>;
}

export async function listKioskDevices(token: string): Promise<KioskDevice[]> {
    return apiFetch('/api/kiosk-devices', { method: 'GET', token }) as Promise<KioskDevice[]>;
}

export async function revokeKioskDevice(id: number, token: string) {
    return apiFetch(`/api/kiosk-devices/${id}`, { method: 'DELETE', token });
}

// Called by the kiosk device itself — its own label (for on-screen
// display) plus a side effect: verifying this token also bumps
// last_seen_at server-side, so a periodic call here doubles as a
// heartbeat that keeps the admin panel's "last seen" honest for a
// long-running session that otherwise only talks over the socket.
export async function fetchMyKioskDevice(token: string): Promise<{ label: string | null }> {
    return apiFetch('/api/kiosk-devices/me', { method: 'GET', token }) as Promise<{ label: string | null }>;
}

// Opt-in TOTP MFA (authenticator-app codes) for a staff account's own
// login — see kigali-freight-router/services/totpService.js. The login
// call itself and its second-step verification live in SocketContext.tsx
// (matching how plain login already works there), not here — these three
// are purely the self-service enroll/confirm/disable actions used by
// TopCommandBar's account menu.
export interface MyAccount {
    username: string;
    role: string;
    mfaEnabled: boolean;
}

export async function fetchMyAccount(token: string): Promise<MyAccount> {
    return apiFetch('/api/auth/me', { method: 'GET', token }) as Promise<MyAccount>;
}

export interface MfaEnrollResult {
    qrCodeDataUrl: string;
    manualEntrySecret: string;
}

export async function enrollMfa(token: string): Promise<MfaEnrollResult> {
    return apiFetch('/api/auth/mfa/enroll', { method: 'POST', token }) as Promise<MfaEnrollResult>;
}

export async function confirmMfa(code: string, token: string): Promise<{ recoveryCodes: string[] }> {
    return apiFetch('/api/auth/mfa/confirm', { method: 'POST', token, body: { code } }) as Promise<{ recoveryCodes: string[] }>;
}

export async function disableMfa(password: string, token: string) {
    return apiFetch('/api/auth/mfa/disable', { method: 'POST', token, body: { password } });
}

// ── Multi-stop runs ──────────────────────────────────────────────────
// A run is one driver, one ordered sequence of stops drawn from real
// orders. See the router's tripController for why stops drive order
// status rather than the other way round.

export interface TripStop {
    id: number;
    order_id: number;
    kind: 'PICKUP' | 'DROP';
    sequence: number;
    lat: number | null;
    lng: number | null;
    address_text: string | null;
    status: 'PENDING' | 'ARRIVED' | 'DONE' | 'FAILED' | 'SKIPPED';
    failure_reason: string | null;
    cargo_description: string | null;
    weight_kg: number | null;
    order_status: string;
    customer_name: string | null;
    customer_phone: string | null;
    recipient_name: string | null;
    recipient_phone: string | null;
    special_instructions: string | null;
    tracking_token: string | null;
    priority: 'high' | 'normal' | 'low';
}

export interface Trip {
    id: number;
    driver_username: string | null;
    driver_full_name: string | null;
    vehicle_id: number | null;
    status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    planned_distance_m: number | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    stops: TripStop[];
    stopCount: number;
    completedStopCount: number;
    currentStop: TripStop | null;
}

export interface TripSummary {
    id: number;
    driver_username: string | null;
    driver_full_name: string | null;
    status: Trip['status'];
    planned_distance_m: number | null;
    created_at: string;
    stop_count: number;
    completed_stop_count: number;
    failed_stop_count: number;
    /** Stops with no coordinates yet — nothing to draw and nothing to sequence. */
    unplaced_stop_count: number;
}

export async function fetchTrips(token: string): Promise<TripSummary[]> {
    return apiFetch('/api/trips', { method: 'GET', token }) as Promise<TripSummary[]>;
}

export async function fetchTrip(tripId: number, token: string): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}`, { method: 'GET', token }) as Promise<Trip>;
}

export async function createTrip(
    input: { orderIds: number[]; driverUsername?: string | null; vehicleId?: number | null },
    token: string
): Promise<Trip> {
    return apiFetch('/api/trips', { method: 'POST', token, body: input }) as Promise<Trip>;
}

export async function updateTrip(
    tripId: number,
    input: { driverUsername?: string | null; vehicleId?: number | null; status?: 'PLANNED' | 'ACTIVE' | 'CANCELLED' },
    token: string
): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}`, { method: 'PATCH', token, body: input }) as Promise<Trip>;
}

export async function optimiseTrip(tripId: number, token: string): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}/optimise`, { method: 'POST', token }) as Promise<Trip>;
}

export async function reorderTrip(tripId: number, stopIds: number[], token: string): Promise<Trip> {
    return apiFetch(`/api/trips/${tripId}/sequence`, { method: 'PATCH', token, body: { stopIds } }) as Promise<Trip>;
}
