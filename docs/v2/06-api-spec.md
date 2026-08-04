# Inzira v2.0 — API Specification

---

## Conventions

- **Base URL**: `/api` (mounted at root in `server.js`)
- **Auth**: `Authorization: Bearer <jwt>` (except `/auth/*` public endpoints)
- **Content-Type**: `application/json`
- **Response Envelope**:
  - Success: `{ "success": true, "data": <T> }`
  - Error: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }`
- **Status Codes**: 200, 201, 400, 401, 403, 404, 409, 429, 500
- **Rate Limits**: Auth endpoints: 10 req / 15 min / IP; Global: 20 req / 15 min / IP
- **Role Names**: Lowercase in JWT (`admin`, `dispatcher`, `driver`); middleware normalizes

---

## Authentication (`/api/auth`)

### POST `/api/auth/signup`
**Public** — Driver self-registration only (role forced to `driver`)

**Request**:
```json
{
  "username": "string (3-50 chars)",
  "password": "string (8-128 chars)",
  "role": "string"  // Ignored; always set to 'driver'
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-string",
    "refreshToken": "hex-string",
    "role": "driver",
    "message": "User registered successfully"
  }
}
```

**Errors**: 400 `AUTH_INVALID_PAYLOAD`, 400 `AUTH_USERNAME_TAKEN`

---

### POST `/api/auth/login`
**Public**

**Request**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt-string",
    "refreshToken": "hex-string",
    "role": "driver|dispatcher|admin"
  }
}
```

**Errors**: 400 `AUTH_INVALID_PAYLOAD`, 401 `AUTH_INVALID_CREDENTIALS`

---

### POST `/api/auth/refresh`
**Public** — Rotates refresh token

**Request**:
```json
{
  "refreshToken": "hex-string"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-string",
    "refreshToken": "new-hex-string",
    "role": "driver|dispatcher|admin"
  }
}
```

**Errors**: 400 `AUTH_REFRESH_MISSING`, 401 `AUTH_REFRESH_INVALID`

---

### POST `/api/auth/logout`
**Public** — Revokes specific refresh token

**Request**:
```json
{
  "refreshToken": "hex-string"
}
```

**Response 200**:
```json
{ "success": true, "data": { "message": "Logged out successfully" } }
```

**Errors**: 400 `AUTH_LOGOUT_MISSING_TOKEN`

---

### POST `/api/auth/logout-all`
**Authenticated** — Revokes all user's refresh tokens

**Headers**: `Authorization: Bearer <accessToken>`

**Response 200**:
```json
{ "success": true, "data": { "message": "Logged out from all devices" } }
```

**Errors**: 401 `AUTH_REQUIRED`

---

## Orders (`/api/orders`)

### POST `/api/orders`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "cargo_description": "string",
  "weight_kg": "number",
  "origin_hub_name": "string",
  "pickup_lng": "number",
  "pickup_lat": "number",
  "delivery_lng": "number",
  "delivery_lat": "number"
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "message": "Order logged successfully.",
    "order": {
      "id": "integer",
      "cargo_description": "string",
      "status": "PENDING",
      "weight_kg": "number",
      "origin_hub_name": "string",
      "pickup_lng": "number",
      "pickup_lat": "number",
      "delivery_lng": "number",
      "delivery_lat": "number"
    }
  }
}
```

**Socket Event**: `order:created` → broadcasts full order object

---

### GET `/api/orders/active`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "cargo_description": "string",
      "status": "PENDING",
      "weight_kg": "number",
      "origin_hub_name": "string",
      "pickup_lng": "number",
      "pickup_lat": "number",
      "delivery_lng": "number",
      "delivery_lat": "number"
    }
  ]
}
```

---

### GET `/api/orders/pooling`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "batch_id": "string (e.g., BATCH-1234)",
      "origin_cluster": "string (hub name)",
      "total_weight_kg": "string (2 decimals)",
      "shipments": [
        { "id": "integer", "cargo_description": "string", "weight_kg": "number", ... }
      ]
    }
  ]
}
```

---

### POST `/api/orders/assign`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "orderIds": ["integer"],
  "driverName": "string"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "message": "Dispatched bundle to <driverName>.",
    "dispatchedCount": "integer"
  }
}
```

**Socket Event**: `order:dispatched` → `{ driverName, assignedManifest[], timestamp }`
**Push**: FCM to driver with title "New delivery assigned"

---

### GET `/api/orders/driver/assignments`
**Roles**: `admin`, `driver`, `dispatcher`

**Auth**: Driver sees only own (username matched case-insensitive)

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "cargo_description": "string",
      "status": "ASSIGNED|PICKED_UP|IN_TRANSIT|ARRIVED",
      "origin_hub_name": "string",
      "delivery_lng": "number",
      "delivery_lat": "number",
      "updated_at": "ISO timestamp"
    }
  ]
}
```

---

### PATCH `/api/orders/:id/status`
**Roles**: `admin`, `driver`, `dispatcher`
**Auth**: Driver may only update own assigned orders

**Request**:
```json
{
  "status": "ASSIGNED|PICKED_UP|IN_TRANSIT|ARRIVED|DELIVERED|CANCELLED"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "message": "Milestone updated to [<status>].",
    "order": {
      "id": "integer",
      "cargo_description": "string",
      "status": "string"
    }
  }
}
```

**Socket Event**: `order:status-updated` → `{ orderId, status, cargo_description, timestamp }`

---

### GET `/api/orders/:id/history`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "previous_status": "string",
      "new_status": "string",
      "changed_by": "string",
      "changed_at": "ISO timestamp"
    }
  ]
}
```

---

### GET `/api/orders/:id/nearest-drivers`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": {
    "orderId": "integer",
    "cargo": "string",
    "status": "string",
    "recommendedDrivers": [
      {
        "driverName": "string",
        "distanceFromPickupKm": "number (2 decimals)",
        "telemetryAgeSeconds": "integer",
        "coordinates": { "lat": "number", "lng": "number" }
      }
    ]
  }
}
```

---

## Fleet Telemetry (`/api/fleet`)

### POST `/api/fleet/telemetry`
**Roles**: `driver`
**Auth**: Driver identity from JWT (`req.user.username`)

**Request**:
```json
{
  "lat": "number (finite)",
  "lng": "number (finite)",
  "speedKmh": "number (optional, ≥0)"
}
```

**Response 200**:
```json
{ "success": true, "data": { "queued": true } }
```

**Internal**: Enqueued to `telemetryQueue` → processed async

---

### GET `/api/fleet/telemetry-sheet`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": {
    "systemTime": "ISO timestamp",
    "activeFleetCount": "integer",
    "fleetReport": [
      {
        "orderId": "integer",
        "cargo": "string",
        "driver": "string",
        "currentLocation": { "lat": "number", "lng": "number" },
        "destinationLocation": { "lat": "number", "lng": "number" },
        "distanceRemainingKm": "number (2 decimals)",
        "estimatedMinutesArrival": "integer (≥1)",
        "telemetryStatus": "LIVE|STALE_SIGNAL"
      }
    ]
  }
}
```

---

### GET `/api/fleet/history/:driverName`
**Roles**: `admin`, `dispatcher`

**Query Params**:
- `hours` (default: 4)
- `tolerance` (default: 0.0001 degrees ≈ 11m)

**Response 200**:
```json
{
  "success": true,
  "data": {
    "driverName": "string",
    "algorithm": "Ramer-Douglas-Peucker (PostGIS ST_Simplify)",
    "inputToleranceDegrees": "number",
    "survivingPointsCount": "integer",
    "trail": [ [lat, lng], [lat, lng], ... ]
  }
}
```

---

### GET `/api/fleet/analytics/performance`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": {
    "generatedAt": "ISO timestamp",
    "metricScope": "Completed Orders Turnaround Analysis",
    "fleetMetrics": [
      {
        "driverName": "string",
        "completedDeliveriesCount": "integer",
        "averageUnloadingDwellTimeMinutes": "number (1 decimal)",
        "worstCaseDwellTimeMinutes": "number (1 decimal)"
      }
    ]
  }
}
```

---

## Geofences (`/api/geofences`)

### GET `/api/geofences`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "name": "string",
      "speedLimitKmh": "integer",
      "geojson": { "type": "Polygon", "coordinates": [[[lng,lat],...]] }
    }
  ]
}
```

---

### POST `/api/geofences`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "name": "string (unique)",
  "coordinates": [ [lng, lat], [lng, lat], ... ],  // Open or closed ring
  "speedLimitKmh": "integer (optional, default 60)"
}
```

**Response 200**:
```json
{ "success": true, "data": { "message": "Polygon zone \"<name>\" with limit <N> km/h saved." } }
```

**Socket Event**: `geofenceUpdated` → `{ name, speedLimitKmh }`
**Audit**: `GEOFENCE_SAVED`

---

### DELETE `/api/geofences/:id`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{ "success": true, "data": { "deleted": true, "id": "integer" } }
```

**Socket Event**: `geofenceUpdated` → `{ id, deleted: true }`
**Audit**: `GEOFENCE_DELETED`

---

## Routes (`/api/routes`)

### GET `/api/routes`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "vehicle_id": "integer",
      "driver_name": "string",
      "geojson_path": { "type": "LineString", "coordinates": [[lng,lat],...] },
      "aggregate_distance_km": "number",
      "total_demand": "integer",
      "status": "SNAPSHOT|COMMITTED",
      "created_at": "ISO timestamp"
    }
  ]
}
```

---

### POST `/api/routes/optimize`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "depot": { "id": "string", "lat": "number", "lng": "number" },
  "vehicles": [ { "id": "integer", ... } ],
  "stops": [ { "id": "string", "lat": "number", "lng": "number", "demand": "integer" } ],
  "vehicleCapacity": "integer (default 100)"
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "routes": [
      {
        "vehicleId": "integer",
        "sequence": [ { "id": "...", "lat": "...", "lng": "..." }, ... ],
        "totalDistanceKm": "number (2 decimals)",
        "totalLoad": "integer"
      }
    ],
    "summary": {
      "totalVehiclesNeeded": "integer",
      "aggregateDistanceKm": "number (2 decimals)"
    }
  }
}
```

---

### POST `/api/routes/save`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "driverName": "string",
  "coordinates": [ [lng, lat], [lng, lat], ... ]  // Path points
}
```

**Response 200**:
```json
{ "success": true, "data": { "route": { "id": "integer", ... } } }
```

**Socket Event**: `routeUpdated` → route row
**Audit**: `ROUTE_SAVED`

---

### POST `/api/routes/commit`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "vehicleId": "integer",
  "driverName": "string",
  "geojsonPath": [ [lng, lat], ... ] | { "type": "LineString", "coordinates": [[lng,lat],...] },
  "aggregateDistanceKm": "number",
  "totalDemand": "integer"
}
```

**Response 200**:
```json
{ "success": true, "data": { "route": { "id": "integer", ... } } }
```

**Socket Event**: `routeUpdated` → route row
**Audit**: `ROUTE_COMMITTED`

---

## Dispatch (`/api/dispatch`)

### POST `/api/dispatch/matrix`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "targetLat": "number",
  "targetLng": "number",
  "activeFleet": [
    { "driverName": "string", "lat": "number", "lng": "number" }
  ]
}
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "rankings": [
      { "driverName": "string", "distanceKm": "number (2 decimals)", "etaMinutes": "integer" }
    ]
  }
}
```

**External**: Calls `http://router.project-osrm.org/table/v1/driving/...`

---

## Incidents (`/api/incidents`)

### POST `/api/incidents`
**Roles**: `admin`, `driver`, `dispatcher`

**Request**:
```json
{
  "orderId": "integer (optional)",
  "title": "string",
  "description": "string"
}
```

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "integer",
    "order_id": "integer|null",
    "driver_name": "string",
    "event_type": "MANUAL_INCIDENT",
    "description": "<title>\n\n<description>",
    "created_at": "ISO timestamp"
  }
}
```

---

## Delivery Stops (`/api/stops`)

### GET `/api/stops`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    { "id": "integer", "name": "string", "lat": "number", "lng": "number", "demand": "integer" }
  ]
}
```

---

### POST `/api/stops`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "name": "string",
  "lat": "number",
  "lng": "number",
  "demand": "integer (optional, default 1)"
}
```

**Response 201**:
```json
{ "success": true, "data": { "stop": { "id": "integer", ... } } }
```

**Socket Event**: `stopUpdated` → stop row
**Audit**: `STOP_CREATED`

---

### DELETE `/api/stops/:id`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{ "success": true, "data": { "deleted": { "id": "integer", ... } } }
```

**Socket Event**: `stopUpdated` → `{ id, deleted: true }`
**Audit**: `STOP_DELETED`

---

## Notifications (`/api/notifications`)

### POST `/api/notifications/register-token`
**Roles**: Any authenticated (driver in practice)

**Request**:
```json
{
  "token": "string (FCM token)",
  "platform": "string (ios|android|unknown, optional)"
}
```

**Response 200**:
```json
{ "success": true, "data": { "registered": true } }
```

---

## Admin (`/api`)

### GET `/api/users`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    { "id": "integer", "username": "string", "role": "string" }
  ]
}
```

---

### PATCH `/api/users/:id/role`
**Roles**: `admin`

**Request**:
```json
{
  "role": "admin|dispatcher|driver"
}
```

**Response 200**:
```json
{ "success": true, "data": { "user": { "id": "integer", "username": "string", "role": "string" } } }
```

**Audit**: `USER_ROLE_UPDATED`

---

### GET `/api/vehicles`
**Roles**: `admin`, `dispatcher`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "plateNumber": "string",
      "vehicleType": "string",
      "currentDriverId": "integer|null",
      "status": "string"
    }
  ]
}
```

---

### POST `/api/vehicles`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "name": "string (plate number)",
  "type": "string"
}
```

**Response 201**:
```json
{ "success": true, "data": { "vehicle": { "id": "integer", ... } } }
```

**Audit**: `VEHICLE_REGISTERED`

---

### PATCH `/api/vehicles/:id/assign`
**Roles**: `admin`, `dispatcher`

**Request**:
```json
{
  "driverId": "integer"
}
```

**Response 200**:
```json
{ "success": true, "data": { "vehicle": { "id": "integer", ... } } }
```

**Audit**: `VEHICLE_ASSIGNED`

---

### GET `/api/audit-logs`
**Roles**: `admin`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "integer",
      "actionType": "string",
      "description": "string",
      "username": "string",
      "timestamp": "ISO timestamp"
    }
  ]
}
```

---

## System (`/`)

### GET `/health`
**Public**

**Response 200**:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "inzira-router",
    "uptimeSeconds": "integer"
  }
}
```

---

### GET `/ready`
**Public**

**Response 200**:
```json
{
  "success": true,
  "data": {
    "status": "ready",
    "database": "ok"
  }
}
```

**Response 503** (DB down):
```json
{
  "success": false,
  "error": {
    "code": "READINESS_CHECK_FAILED",
    "message": "Database readiness check failed."
  }
}
```

---

### GET `/metrics`
**Public** — Prometheus text format

**Content-Type**: `text/plain; version=0.0.4; charset=utf-8`

**Key Metrics**:
- `kigali_http_requests_total`
- `kigali_http_request_duration_ms`
- `kigali_http_requests_route_total{method,path,status}`
- `kigali_socket_events_total`
- `kigali_socket_events_by_name_total{event}`

---

## Socket.IO Events

### Connection
```javascript
io('http://host', { auth: { token: 'Bearer <jwt>' } })
// OR simulator: { username: 'sim_driver_1', simulatorSecret: '...' }
```

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `fleet:snapshot` | `Array<{driverName, lat, lng, velocityKmh, lastSeen}>` | Initial state on connect |
| `driver:location-update` | `{driverName, lat, lng, velocityKmh, lastSeen}` | Real-time position |
| `geofence:violation` | `{id, driverName, zoneName, type, description, enteredAt}` | Boundary/speed breach |
| `geofence:exit` | `{driverName, zoneName, exitedAt}` | Driver left violation zone |
| `order:created` | Order object | New order broadcast |
| `order:dispatched` | `{driverName, assignedManifest[], timestamp}` | Orders assigned to driver |
| `order:status-updated` | `{orderId, status, cargo_description, timestamp}` | Order milestone |
| `routeUpdated` | Completed route row | Route saved/committed |
| `stopUpdated` | Stop row or `{id, deleted: true}` | Stop created/deleted |

### Client → Server Events

| Event | Payload | Auth Required |
|-------|---------|---------------|
| `driver:telemetry-push` | `{driverName, lat, lng}` | `driver` role |

---

## Error Codes Reference

| Code | HTTP | Context |
|------|------|---------|
| `AUTH_INVALID_PAYLOAD` | 400 | Missing/invalid username/password/role |
| `AUTH_USERNAME_TAKEN` | 400 | Duplicate username on signup |
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong username or password |
| `AUTH_REFRESH_MISSING` | 400 | No refreshToken in body |
| `AUTH_REFRESH_INVALID` | 401 | Token expired/revoked/not found |
| `AUTH_LOGOUT_MISSING_TOKEN` | 400 | No refreshToken on logout |
| `AUTH_TOKEN_MISSING` | 401 | No Authorization header |
| `AUTH_INVALID_TOKEN` | 403 | JWT expired/malformed |
| `AUTH_FORBIDDEN` | 403 | Role not allowed for endpoint |
| `AUTH_REQUIRED` | 401 | Auth needed (logout-all) |
| `AUTH_REGISTER_FAILED` | 500 | DB error on signup |
| `AUTH_LOGIN_FAILED` | 500 | DB error on login |
| `AUTH_REFRESH_FAILED` | 500 | DB error on refresh |
| `AUTH_LOGOUT_FAILED` | 500 | DB error on logout |
| `AUTH_LOGOUT_ALL_FAILED` | 500 | DB error on logout-all |
| `ORDERS_ACTIVE_FETCH_FAILED` | 500 | DB error |
| `ORDERS_CREATE_FAILED` | 500 | DB error |
| `ORDERS_ASSIGN_INVALID_PAYLOAD` | 400 | Missing/invalid orderIds/driverName |
| `ORDERS_ASSIGN_CONFLICT` | 409 | Order not PENDING or already assigned |
| `ORDERS_ASSIGN_FAILED` | 500 | Transaction rollback |
| `ORDERS_INVALID_STATUS` | 400 | Status not in allowed list |
| `ORDERS_NOT_FOUND` | 404 | Order ID doesn't exist |
| `ORDERS_STATUS_FORBIDDEN` | 403 | Driver updating other's order |
| `ORDERS_STATUS_UPDATE_FAILED` | 500 | DB error |
| `ORDERS_POOLING_FAILED` | 500 | Spatial query error |
| `ORDERS_HISTORY_FAILED` | 500 | DB error |
| `ORDERS_NEAREST_DRIVERS_FAILED` | 500 | Spatial query error |
| `DRIVER_ASSIGNMENTS_FETCH_FAILED` | 500 | DB error |
| `TELEMETRY_INVALID_COORDINATES` | 400 | lat/lng not finite numbers |
| `TELEMETRY_MISSING_IDENTITY` | 401 | No username in JWT |
| `TELEMETRY_ENQUEUE_FAILED` | 500 | Queue error |
| `FLEET_LIVE_STATUS_FAILED` | 500 | Spatial query error |
| `FLEET_BREADCRUMBS_FAILED` | 500 | RDP compression error |
| `FLEET_PERFORMANCE_FAILED` | 500 | Analytics query error |
| `GEOFENCE_FETCH_FAILED` | 500 | DB error |
| `GEOFENCE_SAVE_FAILED` | 500 | DB error |
| `GEOFENCE_DELETE_FAILED` | 500 | DB error |
| `ROUTES_FETCH_FAILED` | 500 | DB error |
| `ROUTES_OPTIMIZE_FAILED` | 500 | VRP solver error |
| `ROUTES_SNAPSHOT_SAVE_FAILED` | 500 | DB error |
| `ROUTES_COMMIT_FAILED` | 500 | DB error |
| `STOPS_FETCH_FAILED` | 500 | DB error |
| `STOPS_INVALID_PAYLOAD` | 400 | Missing name/lat/lng |
| `STOPS_CREATE_FAILED` | 500 | DB error |
| `STOPS_NOT_FOUND` | 404 | Stop ID doesn't exist |
| `STOPS_DELETE_FAILED` | 500 | DB error |
| `INCIDENT_DRIVER_MISSING` | 400 | No username in JWT |
| `INCIDENT_INVALID_PAYLOAD` | 400 | Missing title/description |
| `INCIDENT_CREATE_FAILED` | 500 | DB error |
| `PUSH_USERNAME_MISSING` | 400 | No username in JWT |
| `PUSH_TOKEN_REQUIRED` | 400 | Empty token |
| `PUSH_TOKEN_REGISTER_FAILED` | 500 | DB error |
| `ADMIN_USERS_FETCH_FAILED` | 500 | DB error |
| `ADMIN_ROLE_REQUIRED` | 400 | Missing role in body |
| `ADMIN_ROLE_INVALID` | 400 | Role not in ALLOWED_ROLES |
| `ADMIN_ROLE_UPDATE_FAILED` | 500 | DB error |
| `ADMIN_USER_NOT_FOUND` | 404 | User ID doesn't exist |
| `ADMIN_VEHICLES_FETCH_FAILED` | 500 | DB error |
| `ADMIN_VEHICLE_INVALID_PAYLOAD` | 400 | Missing name/type |
| `ADMIN_VEHICLE_CREATE_FAILED` | 500 | DB error |
| `ADMIN_DRIVER_REQUIRED` | 400 | Missing driverId |
| `ADMIN_VEHICLE_NOT_FOUND` | 404 | Vehicle ID doesn't exist |
| `ADMIN_VEHICLE_ASSIGN_FAILED` | 500 | DB error |
| `ADMIN_AUDIT_FETCH_FAILED` | 500 | DB error |
| `DISPATCH_MATRIX_FAILED` | 500 | OSRM call failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `READINESS_CHECK_FAILED` | 503 | DB unreachable |

---

## Versioning

- Current: v1 (no version in path — `/api/*`)
- Future: `/api/v1/*` with OpenAPI spec
- Breaking changes require new version path

---

## Client Integration Notes

### UI (`src/utils/api.js`)
- Expects `data.token` on login (legacy) → **must update to `data.accessToken` + `data.refreshToken`**
- Implements `setUnauthorizedHandler` for 401/403 → clears localStorage
- No automatic token refresh

### Driver (`lib/api.ts`)
- Expects `data.token` on login → **must update**
- Stores only access token in SecureStore → **must add refreshToken**
- No auto-refresh logic → **must implement**

### Required Client Changes for Refresh Tokens
1. Store both `accessToken` and `refreshToken` (SecureStore / localStorage)
2. On 401/403 from API call → call `/api/auth/refresh` with `refreshToken`
3. On refresh success → update stored tokens, retry original request
4. On refresh failure → clear auth, redirect to login

---