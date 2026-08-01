// src/utils/api.js
import { getApiBase } from './runtimeConfig.js';

export const API_BASE = getApiBase();

if (!API_BASE) {
    throw new Error(
        'Missing API base URL. For local dev, create a .env file from .env.example and set VITE_API_BASE_URL. ' +
        'In a deployed container, set the API_BASE_URL env var (see docker-entrypoint.sh).'
    );
}

function createHttpError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
}

// Registered by SocketContext so any expired/invalid token clears the
// session in one place, instead of every caller having to check the status.
let unauthorizedHandler = null;
export function setUnauthorizedHandler(handler) {
    unauthorizedHandler = handler;
}

async function parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : null;
    const acceptedResponse = res.status === 202;

    if (!res.ok && !acceptedResponse) {
        const message = payload?.error?.message || payload?.error || payload?.message || `Request failed with status ${res.status}`;
        if (res.status === 401 || res.status === 403) {
            unauthorizedHandler?.();
        }
        throw createHttpError(message, res.status);
    }

    if (acceptedResponse && payload == null) {
        return { accepted: true };
    }

    if (payload && typeof payload === 'object' && 'success' in payload && 'data' in payload) {
        return payload.data;
    }

    return payload;
}

// Wraps fetch with the API base URL and JSON handling.
// Pass a token to automatically attach the Authorization header.
 export async function apiFetch(path, { method = 'GET', token, body } = {}) {
     const headers = { 'Content-Type': 'application/json' };
     if (token) headers.Authorization = `Bearer ${token}`;
     const res = await fetch(`${API_BASE}${path}`, {
         method,
         headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    return parseResponse(res);
}

// Fetch all committed or active routes
export async function fetchRoutes(token) {
    return apiFetch('/api/routes', { method: 'GET', token });
}

export async function fetchGeofences(token) {
    return apiFetch('/api/geofences', { method: 'GET', token });
}

// Address/place search, proxied through our backend to Nominatim (keeps
// its 1 req/sec usage policy + User-Agent requirement server-side instead
// of exposing that host directly to the browser).
export async function geocodeSearch(query, token) {
    const result = await apiFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`, { method: 'GET', token });
    return result?.results ?? [];
}

// VRP Multi-Stop Route Optimization Caller with advanced fleet and time windows
 export async function optimizeMultiStopRoute(depot, vehicles, stops, vehicleCapacity, token) {
    return apiFetch('/api/routes/optimize', {
         method: 'POST',
         token,
         body: { depot, vehicles, stops, vehicleCapacity }
     });
}

// Create a new delivery stop caller
 export async function createDeliveryStop(stopData, token) {
     const result = await apiFetch('/api/stops', {
         method: 'POST',
         token,
         body: stopData,
     });
    return result?.stop ?? result;
}

// Delete a delivery stop caller
 export async function deleteDeliveryStop(stopId, token) {
     const result = await apiFetch(`/api/stops/${stopId}`, {
         method: 'DELETE',
         token,
     });
     return result;
}

// Commit finalized route to persistent storage
 export async function commitOptimizedRoute(commitData, token) {
     const result = await apiFetch('/api/routes/commit', {
         method: 'POST',
         token,
         body: commitData,
     });
     return result?.route ?? result;
}

// Dispatch hubs, used to pre-fill pickup coordinates on the order form and
// managed directly from the Fleet tab.
export async function fetchHubs(token) {
    return apiFetch('/api/hubs', { method: 'GET', token });
}

export async function createHub(hub, token) {
    return apiFetch('/api/hubs', { method: 'POST', token, body: hub });
}

export async function updateHub(id, hub, token) {
    return apiFetch(`/api/hubs/${id}`, { method: 'PATCH', token, body: hub });
}

export async function deleteHub(id, token) {
    return apiFetch(`/api/hubs/${id}`, { method: 'DELETE', token });
}

// Vehicle types populate the fleet registration form's "type" dropdown and
// are managed directly from the Fleet tab.
export async function fetchVehicleTypes(token) {
    return apiFetch('/api/vehicle-types', { method: 'GET', token });
}

export async function createVehicleType(name, token) {
    return apiFetch('/api/vehicle-types', { method: 'POST', token, body: { name } });
}

export async function updateVehicleType(id, name, token) {
    return apiFetch(`/api/vehicle-types/${id}`, { method: 'PATCH', token, body: { name } });
}

export async function deleteVehicleType(id, token) {
    return apiFetch(`/api/vehicle-types/${id}`, { method: 'DELETE', token });
}

export async function fetchActiveOrders(token) {
    return apiFetch('/api/orders/active', { method: 'GET', token });
}

export async function createOrder(orderData, token) {
    const result = await apiFetch('/api/orders', { method: 'POST', token, body: orderData });
    return result?.order ?? result;
}

export async function assignOrders(orderIds, driverName, token) {
    return apiFetch('/api/orders/assign', { method: 'POST', token, body: { orderIds, driverName } });
}

export async function fetchNearestDrivers(orderId, token) {
    return apiFetch(`/api/orders/${orderId}/nearest-drivers`, { method: 'GET', token });
}

export async function fetchIncidents(token) {
    return apiFetch('/api/incidents', { method: 'GET', token });
}

export async function fetchRecentDeliveries(token) {
    return apiFetch('/api/orders/deliveries/recent', { method: 'GET', token });
}

export async function fetchInFlightOrders(token) {
    return apiFetch('/api/orders/in-flight', { method: 'GET', token });
}

// Pass driverName to reassign to a different driver, or omit/null it to send
// the order back to the dispatch queue unassigned.
export async function reassignOrder(orderId, driverName, token) {
    return apiFetch(`/api/orders/${orderId}/reassign`, { method: 'PATCH', token, body: { driverName: driverName || null } });
}

export async function updateIncidentStatus(incidentId, status, token) {
    return apiFetch(`/api/incidents/${incidentId}/status`, { method: 'PATCH', token, body: { status } });
}

// Users with role 'driver' — used by both the order-assignment and
// vehicle-assignment flows.
export async function fetchDrivers(token) {
    const users = await apiFetch('/api/users', { method: 'GET', token });
    return users.filter((u) => String(u.role).toLowerCase() === 'driver');
}

export async function fetchAdminStats(token) {
    return apiFetch('/api/stats', { method: 'GET', token });
}

// Spatial clustering of PENDING orders into batches a driver could pick up
// in one loop — read-only suggestions, dispatch still assigns manually.
export async function fetchBatchedOrders(token) {
    return apiFetch('/api/orders/pooling', { method: 'GET', token });
}

export async function fetchOrderHistory(orderId, token) {
    return apiFetch(`/api/orders/${orderId}/history`, { method: 'GET', token });
}

export async function fetchLiveFleetStatus(token) {
    return apiFetch('/api/fleet/telemetry-sheet', { method: 'GET', token });
}

// hours: lookback window for the trail (backend default 4). tolerance:
// RDP simplification in degrees (backend default 0.0001, ~11m).
export async function fetchDriverBreadcrumbs(driverName, token, { hours, tolerance } = {}) {
    const params = new URLSearchParams();
    if (hours != null) params.set('hours', hours);
    if (tolerance != null) params.set('tolerance', tolerance);
    const qs = params.toString();
    return apiFetch(`/api/fleet/history/${encodeURIComponent(driverName)}${qs ? `?${qs}` : ''}`, { method: 'GET', token });
}

export async function fetchFleetPerformanceReport(token) {
    return apiFetch('/api/fleet/analytics/performance', { method: 'GET', token });
}

// Dispatcher-issued driver onboarding — replaces the old self-signup +
// approval path for drivers. Creates a pre-approved driver account (their
// username becomes their phone number) and a 6-character invite code the
// driver redeems from the mobile app.
export async function inviteDriver(payload, token) {
    return apiFetch('/api/drivers/invite', { method: 'POST', token, body: payload });
}

// The backend half of the driver app's "Forgot your PIN? Contact dispatch"
// copy — clears the driver's PIN so they're prompted to set a new one at
// their next sign-in, without sending them through invite-code entry again.
export async function resetDriverPin(userId, token) {
    return apiFetch(`/api/users/${userId}/reset-driver-pin`, { method: 'POST', token });
}

// Vehicles with no driver currently assigned — used to populate the
// optional "assign a vehicle now" picker in the Invite Driver form.
export async function fetchUnassignedVehicles(token) {
    const vehicles = await apiFetch('/api/vehicles', { method: 'GET', token });
    return vehicles.filter((v) => !v.currentDriverId);
}

// Driver compliance documents (national ID, license, vehicle registration,
// insurance, roadworthiness certificate) — admin review queue.
export async function fetchDriverDocuments(token) {
    return apiFetch('/api/driver-documents', { method: 'GET', token });
}

export async function updateDriverDocumentStatus(id, status, rejectionReason, token) {
    return apiFetch(`/api/driver-documents/${id}/status`, {
        method: 'PATCH',
        token,
        body: { status, rejectionReason },
    });
}