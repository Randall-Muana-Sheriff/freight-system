# Kigali Freight v2.0 — Functional Requirements (Extracted from v1 Implementation)

---

## Requirement ID Format

- **FR-xxx** — Functional Requirement
- **NFR-xxx** — Non-Functional Requirement
- Module prefix: `AUTH`, `ORD`, `RTE`, `GEO`, `FLT`, `INC`, `NOT`, `ADM`, `STP`, `DSP`, `ANA`, `DRV`, `UI`, `INF`

---

## Authentication & Authorization (AUTH)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-AUTH-001 | System shall allow driver self-registration via `POST /api/auth/signup` with username, password. Role forced to `driver`. | `authController.register` |
| FR-AUTH-002 | System shall allow admin to create dispatcher/admin users via admin API (not public). | `adminRoutes.js` — missing create endpoint |
| FR-AUTH-003 | System shall authenticate username/password via `POST /api/auth/login` and return access token (2h) + refresh token (30d). | `authController.login` |
| FR-AUTH-004 | Access token shall be JWT (HS256) containing `userId`, `username`, `role`. | `generateAccessToken()` |
| FR-AUTH-005 | Refresh token shall be cryptographically random (64 bytes hex), stored as bcrypt hash (cost 10) with expiry, user-agent, IP. | `generateRefreshToken()`, `storeRefreshToken()` |
| FR-AUTH-006 | System shall rotate refresh tokens: `POST /api/auth/refresh` revokes old, issues new pair. | `authController.refresh` |
| FR-AUTH-007 | System shall revoke specific refresh token on `POST /api/auth/logout`. | `authController.logout` |
| FR-AUTH-008 | System shall revoke all user refresh tokens on `POST /api/auth/logout-all` (requires auth). | `authController.logoutAll` |
| FR-AUTH-009 | Middleware shall validate JWT and enforce role allow-list per route. | `authMiddleware.js` |
| FR-AUTH-010 | Public signup shall NOT accept `role=admin` or `role=dispatcher`. | Current bug — allows any role |
| FR-AUTH-011 | System shall support password reset via email token (future). | Not implemented |
| FR-AUTH-012 | System shall seed a global admin user on first migration (via env vars). | Not implemented |

---

## Orders (ORD)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-ORD-001 | Dispatcher/admin shall create order with cargo description, weight, origin hub, pickup/delivery coordinates. | `OrderController.createOrder` |
| FR-ORD-002 | Order creation shall store pickup/delivery as PostGIS `geometry(Point,4326)`. | `ST_SetSRID(ST_MakePoint(...))` |
| FR-ORD-003 | System shall list pending orders (`status=PENDING`) for dispatch. | `GET /api/orders/active` |
| FR-ORD-004 | System shall spatially cluster pending orders by pickup proximity (1.5km) and delivery proximity (3.5km). | `GET /api/orders/pooling` |
| FR-ORD-005 | Dispatcher/admin shall assign one or more orders to a driver in a single atomic transaction. | `POST /api/orders/assign` — `SELECT FOR UPDATE` |
| FR-ORD-006 | Assignment shall create audit log entries (`order_status_logs`) with previous/new status, changed_by. | `order_status_logs` insert |
| FR-ORD-007 | Assigned orders shall emit `order:dispatched` socket event with driver name and order details. | `io.emit('order:dispatched')` |
| FR-ORD-008 | Push notification shall be sent to driver on assignment (best-effort). | `sendPushToUser()` |
| FR-ORD-009 | Driver shall view own assigned (non-delivered) orders. | `GET /api/orders/driver/assignments` |
| FR-ORD-010 | Driver shall update order status through valid transitions: `PENDING→ASSIGNED→PICKED_UP→IN_TRANSIT→ARRIVED→DELIVERED` + `CANCELLED`. | `PATCH /api/orders/:id/status` |
| FR-ORD-011 | Driver may only update orders assigned to them (enforced by middleware). | Role check in `updateOrderStatus` |
| FR-ORD-012 | All status changes shall be logged to `order_status_logs`. | `logQuery` insert |
| FR-ORD-013 | Status change shall emit `order:status-updated` socket event. | `io.emit('order:status-updated')` |
| FR-ORD-014 | System shall provide full status history for an order. | `GET /api/orders/:id/history` |
| FR-ORD-015 | System shall recommend nearest 3 drivers for an order using KNN (`<->` operator) on `driver_locations`. | `GET /api/orders/:id/nearest-drivers` |

---

## Routes & VRP (RTE)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-RTE-001 | System shall solve VRP for single/multiple vehicles given depot, stops (with demand), vehicle capacity. | `POST /api/routes/optimize` → `solveVRP()` |
| FR-RTE-002 | Solver shall use nearest-neighbor initial tour + 2-opt improvement. | `vrpOptimizer.js` |
| FR-RTE-003 | Solver shall respect vehicle capacity (sum of stop demands ≤ capacity). | `currentLoad + demand <= vehicleCapacity` |
| FR-RTE-004 | Solution shall return per-vehicle sequence, total distance (km), total load. | `routes` array in response |
| FR-RTE-005 | System shall save route snapshots (GeoJSON LineString) to `completed_routes` with status `SNAPSHOT`. | `POST /api/routes/save` |
| FR-RTE-006 | System shall commit finalized routes with status `COMMITTED`, aggregate distance, total demand. | `POST /api/routes/commit` |
| FR-RTE-007 | Committed routes shall be listable. | `GET /api/routes` |
| FR-RTE-008 | Route commit/save shall emit `routeUpdated` socket event. | `io.emit('routeUpdated')` |
| FR-RTE-009 | Route coordinates shall be normalized to `[lng, lat]` arrays. | `normalizeRouteCoordinates()` |

---

## Geofences (GEO)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-GEO-001 | Admin/dispatcher shall create geofence with name, polygon coordinates (closed ring), speed limit (km/h, default 60). | `POST /api/geofences` |
| FR-GEO-002 | Polygon shall be stored as PostGIS `geometry(Polygon,4326)` with auto-closing ring. | `ST_GeomFromText('POLYGON((...))', 4326)` |
| FR-GEO-003 | System shall list all geofences as GeoJSON. | `GET /api/geofences` → `ST_AsGeoJSON(geom)` |
| FR-GEO-004 | Admin/dispatcher shall delete geofence by ID. | `DELETE /api/geofences/:id` |
| FR-GEO-005 | On every telemetry ping, system shall check if point is inside any geofence (`ST_Contains`). | `telemetryQueue.js` |
| FR-GEO-006 | If inside geofence AND speed > limit → `SPEED_VIOLATION` alert. | `processTelemetryItem()` |
| FR-GEO-007 | If inside geofence (no speed check) → `BOUNDARY_BREACH` alert. | `processTelemetryItem()` |
| FR-GEO-008 | Alerts shall be written to `geofence_alerts`, emitted via `geofence:violation` socket, and sent to external webhook/Telegram. | `dispatchExternalAlert()` |
| FR-GEO-009 | When driver exits a geofence they were violating, system shall emit `geofence:exit` and log `ZONE_EXIT`. | `hashDelete(DRIVER_BREACHES_KEY)` |

---

## Fleet Telemetry (FLT)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-FLT-001 | Authenticated driver shall report position via `POST /api/fleet/telemetry` (lat, lng, optional speedKmh). | `FleetController.reportTelemetry` |
| FR-FLT-002 | Authenticated driver shall report position via Socket.IO `driver:telemetry-push` event. | `server.js` socket handler |
| FR-FLT-003 | All telemetry shall enter durable queue (Redis list or in-memory) with batch flush (250ms, 100 items). | `telemetryQueue.js` |
| FR-FLT-004 | Queue processor shall write to `driver_location_history` (append) and upsert `driver_locations` (current). | `processTelemetryItem()` |
| FR-FLT-005 | Queue processor shall run geofence checks on every ping. | `ST_Contains(geom, point)` |
| FR-FLT-006 | Queue processor shall update live fleet state hash (`kigali:fleet:live-state`) and emit `driver:location-update`. | `hashSet(FLEET_STATE_KEY)` + `io.emit` |
| FR-FLT-007 | Dispatcher/admin shall get live fleet status: active orders with driver position, distance to delivery, ETA, telemetry freshness. | `GET /api/fleet/telemetry-sheet` |
| FR-FLT-008 | System shall provide driver breadcrumbs with RDP compression (PostGIS `ST_Simplify`). | `GET /api/fleet/history/:driverName` |
| FR-FLT-009 | System shall provide fleet performance report: avg/max dwell time at hubs per driver (completed orders). | `GET /api/fleet/analytics/performance` |
| FR-FLT-010 | Driver mobile app shall send background location to telemetry endpoint (not yet implemented). | `lib/locationTracking.ts` scaffolded |

---

## Incidents (INC)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-INC-001 | Driver shall report incident with optional orderId, title, description. | `POST /api/incidents` |
| FR-INC-002 | Incident shall be stored in `geofence_alerts` with `event_type='MANUAL_INCIDENT'`. | `IncidentController.createIncident` |
| FR-INC-003 | UI shall display all incidents in registry. | `IncidentRegistry` component |

---

## Notifications (NOT)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-NOT-001 | Any authenticated user shall register FCM push token via `POST /api/notifications/register-token`. | `NotificationController.registerToken` |
| FR-NOT-002 | Tokens stored in `push_tokens` table (username, fcm_token, platform, upsert on conflict). | `registerPushToken()` |
| FR-NOT-003 | System shall send push to all devices for a username (FCM multicast). | `sendPushToUser()` |
| FR-NOT-004 | FCM errors `registration-token-not-registered` / `invalid-registration-token` shall delete token. | `UNREGISTERED_ERROR_CODES` |
| FR-NOT-005 | Order assignment shall trigger push to driver (title: "New delivery assigned"). | `assignOrderBundle` → `sendPushToUser` |
| FR-NOT-006 | Geofence violation shall trigger external alert (Telegram/webhook) with driver, zone, type, timestamp. | `dispatchExternalAlert()` |
| FR-NOT-007 | Driver app shall handle notification tap → navigate to assignments screen. | `useNotificationResponseHandler` |

---

## Admin (ADM)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-ADM-001 | Admin shall list all users (id, username, role). | `GET /api/users` |
| FR-ADM-002 | Admin shall update any user's role (must be valid `ALLOWED_ROLES`). | `PATCH /api/users/:id/role` |
| FR-ADM-003 | Admin/dispatcher shall list vehicles (id, plate, type, driver, status). | `GET /api/vehicles` |
| FR-ADM-004 | Admin/dispatcher shall create vehicle (plate, type). | `POST /api/vehicles` |
| FR-ADM-005 | Admin/dispatcher shall assign vehicle to driver. | `PATCH /api/vehicles/:id/assign` |
| FR-ADM-006 | Admin shall view audit logs (latest 100, action_type, description, username, timestamp). | `GET /api/audit-logs` |

---

## Delivery Stops (STP)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-STP-001 | Admin/dispatcher shall list pending delivery stops. | `GET /api/stops` |
| FR-STP-002 | Admin/dispatcher shall create stop (name, lat, lng, demand). | `POST /api/stops` |
| FR-STP-003 | Admin/dispatcher shall delete stop by ID. | `DELETE /api/stops/:id` |
| FR-STP-004 | Stop CRUD shall emit `stopUpdated` socket event. | `io.emit('stopUpdated')` |

---

## Dispatch (DSP)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-DSP-001 | Given target lat/lng and active fleet array, system shall call OSRM table API for distance/duration matrix. | `POST /api/dispatch/matrix` |
| FR-DSP-002 | Response shall rank drivers by distance (ascending) with distanceKm and etaMinutes. | `DispatchController.getMatrix` |

---

## Analytics (ANA)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-ANA-001 | System shall expose Prometheus metrics at `/metrics`. | `metricsMiddleware` + `register` |
| FR-ANA-002 | Metrics shall include HTTP request count, duration histogram, by route/status, socket events total + by name. | `metrics.js` |
| FR-ANA-003 | System shall expose `/health` (liveness) and `/ready` (DB connectivity). | `systemRoutes.js` |

---

## Driver Mobile App (DRV)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-DRV-001 | Driver shall log in with username/password; tokens stored in SecureStore. | `lib/auth.tsx` |
| FR-DRV-002 | On login, app shall register FCM token with backend. | `registerPushTokenWithBackend()` |
| FR-DRV-003 | On login, app shall start background location tracking (expo-task-manager). | `startBackgroundLocationTracking()` |
| FR-DRV-004 | App shall flush offline queue on foreground (AppState 'active'). | `AppState.addEventListener` |
| FR-DRV-005 | Dashboard shall show live assignments, metrics, pending sync count. | `app/(app)/index.tsx` |
| FR-DRV-006 | Driver shall view assignment list and tap for detail. | `app/(app)/assignments.tsx` |
| FR-DRV-007 | Driver shall update order status (assigned→transit→delivered) via PATCH. | `app/(app)/trip/[id].tsx` |
| FR-DRV-008 | Status updates offline shall queue to AsyncStorage and sync on reconnect. | `lib/offlineQueue.ts` |
| FR-DRV-009 | Driver shall report incident (title, description, optional orderId). | `app/(app)/incidents.tsx` |
| FR-DRV-010 | Driver shall sign out (clears SecureStore, stops background tracking). | `signOut()` |
| FR-DRV-011 | Driver shall receive push notification on assignment; tap opens assignments. | `useNotificationResponseHandler` |
| FR-DRV-012 | Background location task shall read token from SecureStore and POST to `/api/fleet/telemetry`. | `TaskManager.defineTask(LOCATION_TASK_NAME)` |

---

## Web Dashboard (UI)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-UI-001 | User shall log in / sign up via form; token stored in localStorage. | `SocketContext.login` |
| FR-UI-002 | On login, app shall connect Socket.IO with JWT auth. | `toggleNetworkStream` |
| FR-UI-003 | Dashboard shall show live fleet map with driver markers, trails, geofences. | `FleetMap` |
| FR-UI-004 | Dispatcher shall click map to see ranked drivers by ETA (OSRM matrix). | `DispatchPanel` + `calculateRoadMatrixETA` |
| FR-UI-005 | Dispatcher shall optimize multi-stop routes (VRP UI: depot, vehicles, stops, capacity). | `RouteOptimizerPanel` |
| FR-UI-006 | Dispatcher shall draw geofence polygons on map and save. | `GeofenceDrawer` |
| FR-UI-007 | User shall playback committed routes with timeline scrubber. | `HistoryPlayback` |
| FR-UI-008 | Admin shall manage users (view, change role). | `AdminUserManagement` |
| FR-UI-009 | Admin/dispatcher shall manage vehicles (create, assign). | `VehicleAssignmentPanel` |
| FR-UI-010 | Admin shall view audit logs. | `SystemAuditLogs` |
| FR-UI-011 | Role-based panel visibility (admin sees all; dispatcher subset). | `Dashboard.jsx` role checks |
| FR-UI-012 | Real-time updates via Socket.IO: fleet snapshot, location updates, geofence violations, route/stop updates. | `SocketContext` event handlers |

---

## Infrastructure (INF)

| ID | Requirement | Source |
|----|-------------|--------|
| FR-INF-001 | Router shall run database migrations on startup (idempotent, tracked in `schema_migrations`). | `bin/migrate.js` |
| FR-INF-002 | Router shall support optional Redis for rate limiting, Socket.IO adapter, shared state. | `redisClient.js`, `server.js` |
| FR-INF-003 | Router shall expose structured JSON logs with requestId, method, path, status, duration. | `server.js` request logging |
| FR-INF-004 | UI shall build static assets via Vite and serve via nginx. | `Dockerfile`, `nginx.conf` |
| FR-INF-005 | Driver shall build via EAS (Expo Application Services). | `eas.json` |
| FR-INF-006 | CI shall run router integration tests (dual: in-memory + Redis). | `.github/workflows` |
| FR-INF-007 | CI shall run UI lint + build. | `.github/workflows` |

---

## Non-Functional Requirements

| ID | Requirement | Source / Evidence |
|----|-------------|-------------------|
| NFR-SEC-001 | All passwords hashed with bcrypt (cost ≥10). | `bcrypt.hash(password, 10)` |
| NFR-SEC-002 | JWT secret configurable via env, not hardcoded. | `appConfig.js` |
| NFR-SEC-003 | Rate limiting on auth endpoints (10 req/15min/IP). | `authRoutes.js:10-13` |
| NFR-SEC-004 | Helmet security headers (CSP disabled for API). | `server.js:35` |
| NFR-SEC-005 | CORS restricted to configured origins. | `server.js:36-48` |
| NFR-SEC-006 | Refresh tokens revoked on logout/rotation; stored as bcrypt hash. | `authController.js` |
| NFR-PER-001 | Telemetry queue batch flush ≤250ms, batch size ≤100. | `telemetryQueue.js` constants |
| NFR-PER-002 | Socket.IO horizontal scaling via Redis adapter when `REDIS_URL` set. | `server.js:87-95` |
| NFR-PER-003 | Spatial queries indexed (GIST on geometry columns). | Migrations: `CREATE INDEX ... USING GIST` |
| NFR-PER-004 | VRP solver handles ≤30 stops in <2s (nearest-neighbor + 2-opt). | `vrpOptimizer.js` |
| NFR-AVA-001 | Health endpoint (`/health`) returns 200 OK with uptime. | `systemRoutes.js` |
| NFR-AVA-002 | Readiness endpoint (`/ready`) checks DB connectivity. | `systemRoutes.js` |
| NFR-AVA-003 | Graceful shutdown: flush telemetry queue, close Redis, close DB pool, end server. | `shutdownServices()` |
| NFR-OBS-001 | Prometheus metrics at `/metrics` (HTTP + socket). | `metrics.js` |
| NFR-OBS-002 | Structured JSON logs with request correlation ID. | `server.js` |
| NFR-MAI-001 | Migrations additive-only; tracked in `schema_migrations`. | `bin/migrate.js` |
| NFR-MAI-002 | TypeScript strict mode in UI and Driver. | `tsconfig.json` |
| NFR-MAI-003 | ESLint + Prettier in UI and Driver. | `eslint.config.js` |

---

## Data Requirements (Implicit from Implementation)

| Entity | Key Fields | Constraints |
|--------|------------|-------------|
| `users` | id, username (unique), password_hash, role (enum), created_at | role ∈ {admin,dispatcher,driver} |
| `orders` | id, cargo_description, status, weight_kg, origin_hub_id, pickup_geom, delivery_geom, created_at, updated_at | status ∈ {PENDING,ASSIGNED,PICKED_UP,IN_TRANSIT,ARRIVED,DELIVERED,CANCELLED} |
| `refresh_tokens` | id, user_id (FK), token_hash, user_agent, ip_address, expires_at, revoked_at, created_at | expires_at > NOW() for valid; revoked_at IS NULL for active |
| `geofences` | id, name (unique), speed_limit_kmh, geom (Polygon,4326) | speed_limit_kmh ≥ 0 |
| `driver_locations` | driver_name (unique), lat, lng, geom (Point,4326), updated_at | Upsert on driver_name |
| `driver_location_history` | id, driver_name, lat, lng, geom (Point,4326), recorded_at | Append-only |
| `geofence_alerts` | id, order_id (nullable), driver_name, event_type, description, distance_meters, created_at | event_type ∈ {BOUNDARY_BREACH,SPEED_VIOLATION,ZONE_EXIT,MANUAL_INCIDENT,ARRIVED_AT_DESTINATION} |
| `push_tokens` | id, username, fcm_token (unique), platform, created_at, updated_at | One token per device; username can have multiple |
| `fleet_vehicles` | id, plate_number, vehicle_type, current_driver_id (FK users), status, created_at | status ∈ {ACTIVE,INACTIVE,MAINTENANCE} |
| `delivery_stops` | id, name, lat, lng, demand, status, created_at | status ∈ {PENDING,COMPLETED} |
| `completed_routes` | id, vehicle_id, driver_name, geojson_path (LineString), aggregate_distance_km, total_demand, status, created_at | status ∈ {SNAPSHOT,COMMITTED} |
| `system_audit_logs` | id, action_type, description, username, created_at | Append-only |
| `order_status_logs` | id, order_id (FK), previous_status, new_status, changed_by, created_at | FK cascade delete |
| `hubs` | id, name, code, coordinates (Point,4326), created_at | Kigali hubs seeded |

---

## Traceability Matrix (Top 20 Critical Requirements)

| Requirement | Backend | UI | Driver | Tests |
|-------------|---------|-----|--------|-------|
| FR-AUTH-003 (login → tokens) | ✅ | ⚠️ (old format) | ⚠️ (no refresh) | ✅ |
| FR-AUTH-006 (refresh rotation) | ✅ | ❌ | ❌ | ❌ |
| FR-ORD-005 (assign transactional) | ✅ | ✅ | ✅ | ✅ |
| FR-ORD-010 (status transitions) | ✅ | ✅ | ✅ | ✅ |
| FR-RTE-001 (VRP solve) | ✅ | ✅ | ❌ | ❌ |
| FR-GEO-005 (geofence check) | ✅ | ⚠️ (no toast) | ❌ | ❌ |
| FR-FLT-003 (durable queue) | ✅ | ✅ (receives) | ❌ (no send) | ✅ |
| FR-FLT-010 (driver bg location) | N/A | N/A | ⚠️ scaffolded | ❌ |
| FR-NOT-005 (assign → push) | ✅ | N/A | ✅ (handler) | ❌ |
| FR-DRV-008 (offline queue) | N/A | N/A | ⚠️ scaffolded | ❌ |

---