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
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
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
        throw new HttpError(message, res.status);
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

// VRP Multi-Stop Route Optimization Caller with advanced fleet and time windows
export async function optimizeMultiStopRoute(depot: unknown, vehicles: unknown, stops: OptimizeStop[], vehicleCapacity: unknown, token: string) {
    return apiFetch('/api/routes/optimize', {
        method: 'POST',
        token,
        body: { depot, vehicles, stops, vehicleCapacity },
    });
}

// Create a new delivery stop caller
export async function createDeliveryStop(stopData: unknown, token: string) {
    const result = await apiFetch('/api/stops', {
        method: 'POST',
        token,
        body: stopData,
    }) as { stop?: unknown };
    return result?.stop ?? result;
}

// Delete a delivery stop caller
export async function deleteDeliveryStop(stopId: number | string, token: string) {
    return apiFetch(`/api/stops/${stopId}`, {
        method: 'DELETE',
        token,
    });
}

// Commit finalized route to persistent storage
export async function commitOptimizedRoute(commitData: unknown, token: string) {
    const result = await apiFetch('/api/routes/commit', {
        method: 'POST',
        token,
        body: commitData,
    }) as { route?: unknown };
    return result?.route ?? result;
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

export async function fetchNearestDrivers(orderId: number, token: string): Promise<{ recommendedDrivers?: DriverSuggestion[] }> {
    return apiFetch(`/api/orders/${orderId}/nearest-drivers`, { method: 'GET', token }) as Promise<{ recommendedDrivers?: DriverSuggestion[] }>;
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

export async function updateDriverDocumentStatus(id: number, status: string, rejectionReason: string | null, token: string) {
    return apiFetch(`/api/driver-documents/${id}/status`, {
        method: 'PATCH',
        token,
        body: { status, rejectionReason },
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
