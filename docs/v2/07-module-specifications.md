# Kigali Freight v2.0 — Module Specifications

---

## Backend Module Map (Router)

```
kigali-freight-router/
├── server.js                 # App bootstrap, Socket.IO, route registration
├── config/
│   ├── appConfig.js          # Validated env config (Zod schema)
│   ├── db.js                 # PG pool (Postgres + PostGIS)
│   └── redisClient.js        # Optional Redis (ioredis) for adapter + rate limit
├── controllers/              # 10 files — request/response + business logic
├── services/                 # 7 files — singleton stateful logic
├── middleware/               # 5 files — cross-cutting concerns
├── routes/                   # 11 files — Express router mounting
├── migrations/               # 9 SQL files (tracked via schema_migrations)
├── bin/migrate.js            # Migration runner (idempotent, ordered)
└── tests/integration.test.js # Full integration suite
```

---

## Controller Modules

### `authController.js`
**Responsibility**: User authentication, token lifecycle

**Public API**:
```javascript
signup(req, res)        // POST /api/auth/signup
login(req, res)         // POST /api/auth/login
refresh(req, res)       // POST /api/auth/refresh
logout(req, res)        // POST /api/auth/logout
logoutAll(req, res)     // POST /api/auth/logout-all
```

**Dependencies**: `db`, `bcrypt`, `jsonwebtoken`, `config/appConfig` (JWT_SECRET, TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY_DAYS)

**Key Logic**:
- Signup: Forces `role='driver'`, hashes password (bcrypt cost 10), issues JWT + refresh token
- Login: Verifies bcrypt, issues new JWT + refresh token, inserts into `refresh_tokens`
- Refresh: Validates token in DB (not revoked, not expired), rotates (marks old revoked, inserts new), issues new JWT + refresh token
- Logout: Marks specific refresh token revoked
- Logout All: Marks all user's refresh tokens revoked

**State**: None (stateless except DB)

---

### `orderController.js`
**Responsibility**: Order CRUD, pooling, assignment, status transitions, audit

**Public API**:
```javascript
createOrder(req, res)           // POST /api/orders
getActiveOrders(req, res)       // GET /api/orders/active
getPooling(req, res)            // GET /api/orders/pooling
assignOrders(req, res)          // POST /api/orders/assign
getDriverAssignments(req, res)  // GET /api/orders/driver/assignments
updateOrderStatus(req, res)     // PATCH /api/orders/:id/status
getOrderHistory(req, res)       // GET /api/orders/:id/history
getNearestDrivers(req, res)     // GET /api/orders/:id/nearest-drivers
```

**Dependencies**: `db`, `services/notificationService` (push on assign)

**Key Logic**:
- Pooling: `ST_DWithin` with 1.5km pickup / 3.5km delivery radius, greedy clustering
- Assign: `SELECT FOR UPDATE` on orders → verify PENDING → bulk UPDATE → insert `order_status_logs` (→ ASSIGNED) → emit `order:dispatched` + push notification
- Status: Role-checked transitions (PENDING→ASSIGNED→PICKED_UP→IN_TRANSIT→ARRIVED→DELIVERED), driver can only update own, logs to `order_status_logs`
- Nearest: KNN via `<->` operator on `driver_locations.geom`

---

### `fleetController.js`
**Responsibility**: Telemetry ingestion, live fleet sheet, breadcrumbs, performance analytics

**Public API**:
```javascript
ingestTelemetry(req, res)           // POST /api/fleet/telemetry
getLiveFleetStatus(req, res)        // GET /api/fleet/telemetry-sheet
getDriverBreadcrumbs(req, res)      // GET /api/fleet/history/:driverName
getFleetPerformance(req, res)       // GET /api/fleet/analytics/performance
```

**Dependencies**: `db`, `services/telemetryQueue` (enqueue), PostGIS functions

**Key Logic**:
- Ingest: Validates lat/lng/speed, gets driver from JWT, enqueues to `telemetryQueue`
- Live Sheet: Spatial join `driver_locations` → `pending_orders` via `ST_Distance`, Haversine ETA at 30km/h, staleness > 60s
- Breadcrumbs: `ST_Simplify` (RDP) on `driver_location_history` points within time window
- Performance: CTE computes dwell time between PICKED_UP→ARRIVED per order per driver

---

### `routeController.js`
**Responsibility**: VRP optimization, route persistence (snapshot/committed)

**Public API**:
```javascript
optimizeRoutes(req, res)    // POST /api/routes/optimize
saveRoute(req, res)         // POST /api/routes/save
commitRoute(req, res)       // POST /api/routes/commit
getRoutes(req, res)         // GET /api/routes
```

**Dependencies**: `db`, `services/vrpOptimizer`

**Key Logic**:
- Optimize: Delegates to `vrpOptimizer.solve()` (nearest-neighbor + 2-opt improvement)
- Save: Inserts into `completed_routes` with `status='SNAPSHOT'`, emits `routeUpdated`
- Commit: Inserts with `status='COMMITTED'`, emits `routeUpdated`

---

### `geofenceController.js`
**Responsibility**: Geofence CRUD, violation detection (via telemetryQueue)

**Public API**:
```javascript
getGeofences(req, res)      // GET /api/geofences
saveGeofence(req, res)      // POST /api/geofences
deleteGeofence(req, res)    // DELETE /api/geofences/:id
```

**Dependencies**: `db`, PostGIS `ST_MakePolygon`, `ST_Contains`, `ST_AsGeoJSON`

**Key Logic**:
- Save: Normalizes coordinates (ensure closed ring), builds `geometry(Polygon,4326)`, stores speed limit
- Delete: Removes by ID, emits `geofenceUpdated` with `deleted: true`

---

### `dispatchController.js`
**Responsibility**: OSRM matrix, driver ranking by ETA

**Public API**:
```javascript
getOsrmMatrix(req, res)   // POST /api/dispatch/matrix
```

**Dependencies**: `axios` → `router.project-osrm.org/table/v1/driving/`

**Key Logic**: Builds coordinate string `lng,lat;lng,lat...`, calls OSRM, parses duration/distance, sorts by ETA ascending

---

### `incidentController.js`
**Responsibility**: Driver/manual incident reporting

**Public API**:
```javascript
reportIncident(req, res)  // POST /api/incidents
```

**Dependencies**: `db`
**Table**: `geofence_alerts` (reuse with `event_type='MANUAL_INCIDENT'`)

---

### `notificationsController.js`
**Responsibility**: FCM token registration

**Public API**:
```javascript
registerToken(req, res)  // POST /api/notifications/register-token
```

**Dependencies**: `db` (upsert into `push_tokens`)

---

### `adminController.js`
**Responsibility**: User mgmt, vehicle mgmt, audit logs

**Public API**:
```javascript
getUsers(req, res)                // GET /api/users
updateUserRole(req, res)          // PATCH /api/users/:id/role
getVehicles(req, res)             // GET /api/vehicles
createVehicle(req, res)           // POST /api/vehicles
assignVehicle(req, res)           // PATCH /api/vehicles/:id/assign
getAuditLogs(req, res)            // GET /api/audit-logs
```

---

### `stopController.js`
**Responsibility**: Depot/stop management

**Public API**:
```javascript
getStops(req, res)      // GET /api/stops
createStop(req, res)    // POST /api/stops
deleteStop(req, res)    // DELETE /api/stops/:id
```

---

## Service Modules

### `services/telemetryQueue.js`
**Pattern**: Singleton with durable async processing

**State**:
```javascript
queue: Array<TelemetryItem>      // In-memory buffer
redis: RedisClient | null        // Optional persistence
FLUSH_INTERVAL_MS = 250
MAX_BATCH_SIZE = 100
```

**Public API**:
```javascript
enqueue(item)                          // Called by fleetController
processTelemetryItem(item)             // Core logic: upsert driver_locations + insert history + geofence check
flushBatch()                           // Process up to MAX_BATCH_SIZE
start()                                // Start interval timer
stop()                                 // Flush remaining on shutdown
```

**Geofence Check** (inside `processTelemetryItem`):
```sql
-- Via ST_Contains(geom, point)
SELECT id, name, speed_limit_kmh FROM geofences
WHERE ST_Contains(geom, ST_MakePoint(lng, lat)::geography)
```
- On entry: emit `geofence:violation` (type=entered, or speeding if `currentVelocityKmh > speed_limit_kmh`)
- On exit: emit `geofence:exit`
- External alert: `dispatchExternalAlert(alert)` (Telegram/webhook)

**Socket Events Emitted**: `geofence:violation`, `geofence:exit`

---

### `services/vrpOptimizer.js`
**Algorithm**: Nearest-neighbor initial solution + 2-opt local search

**Public API**:
```javascript
solve({ depot, vehicles, stops, vehicleCapacity })
```

**Returns**:
```javascript
{
  routes: [
    { vehicleId, sequence: Stop[], totalDistanceKm, totalLoad }
  ],
  summary: { totalVehiclesNeeded, aggregateDistanceKm }
}
```

**Constraints**:
- Capacity: Sum of stop.demand ≤ vehicleCapacity per route
- Single depot only
- Straight-line (Haversine) distance, no traffic

---

### `services/notificationService.js`
**Responsibility**: FCM push notifications

**Public API**:
```javascript
sendPushToUser(username, { title, body, data })
registerToken(username, token, platform)  // Upsert push_tokens
cleanupInvalidTokens(messageIds)          // Called on FCM 'NotRegistered' error
```

**Dependencies**: `firebase-admin` (initialized in server.js), `db`

**Usage**: Called by `orderController.assignOrders` → `sendPushToUser(driverName, { title: 'New delivery assigned', body: '...', data: { type: 'order_assigned' } })`

---

### `services/auditService.js`
**Responsibility**: Structured audit logging

**Public API**:
```javascript
log(userId, username, actionType, description)
```

**Table**: `audit_logs` (id, user_id, username, action_type, description, created_at)

**Called By**: Controllers after successful mutations

---

### `services/socketService.js`
**Responsibility**: Socket.IO setup, authentication, room management

**Public API**:
```javascript
initialize(io)           // Attach auth middleware, connection handler
broadcast(event, data)   // io.emit()
toUser(username, event, data)  // io.to(socketId).emit()
```

**Auth**: Accepts `token` in handshake auth OR `username` + `simulatorSecret` for test clients

**Rooms**: User-specific room = `user:<username>` for targeted pushes

---

### `services/externalAlertService.js`
**Responsibility**: External webhook/Telegram alerts

**Public API**:
```javascript
dispatchExternalAlert(alert)
```

**Config**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WEBHOOK_URL` (env)

---

### `services/pushNotificationService.js`
**Note**: Legacy name; actual implementation in `notificationService.js`. Kept for compat.

---

## Middleware Modules

### `middleware/authMiddleware.js`
**Exports**: `authMiddleware(allowedRoles?)`

**Logic**:
```javascript
const token = req.headers.authorization?.split(' ')[1];
const decoded = jwt.verify(token, JWT_SECRET);  // { userId, username, role, iat, exp }
req.user = decoded;
if (allowedRoles && !allowedRoles.includes(decoded.role)) return 403;
```

**Allowed Roles**: Normalized lowercase (`admin`, `dispatcher`, `driver`)

---

### `middleware/rateLimit.js`
**Exports**: `rateLimit(windowMs, max, message?)`

**Store**: Redis (if `redisClient`) else in-memory Map with cleanup interval

**Applied**:
- Global: `rateLimit(15*60*1000, 20)`
- Auth: `rateLimit(15*60*1000, 10, 'Too many auth attempts')`

---

### `middleware/validationMiddleware.js`
**Exports**: `validate(schema)` using Zod

**Usage**: `@ achievements` — not yet widely applied (tech debt)

---

### `middleware/errorHandler.js`
**Exports**: `errorHandler(err, req, res, next)`

**Behavior**: Logs error, maps known codes to HTTP status, returns envelope `{success:false, error:{code,message}}`

---

### `middleware/requestLogger.js`
**Exports**: `requestLogger`

**Output**: JSON per request — `{ method, url, status, durationMs, userId, ip, userAgent }`

---

## Route Files (Mounting)

| File | Mount Path | Controllers |
|------|------------|-------------|
| `authRoutes.js` | `/api/auth` | authController |
| `orderRoutes.js` | `/api/orders` | orderController |
| `fleetRoutes.js` | `/api/fleet` | fleetController |
| `routeRoutes.js` | `/api/routes` | routeController |
| `geofenceRoutes.js` | `/api/geofences` | geofenceController |
| `dispatchRoutes.js` | `/api/dispatch` | dispatchController |
| `incidentRoutes.js` | `/api/incidents` | incidentController |
| `notificationRoutes.js` | `/api/notifications` | notificationsController |
| `adminRoutes.js` | `/api` (users, vehicles, audit) | adminController |
| `stopRoutes.js` | `/api/stops` | stopController |
| `healthRoutes.js` | `/` (health, ready, metrics) | inline |

**Mounted in**: `server.js` → `app.use('/api', ...)`

---

## Frontend Module Map (UI)

```
kigali-freight-ui/
├── src/
│   ├── main.jsx                      # Entry, providers
│   ├── App.jsx                       # Routes + AuthGuard
│   ├── context
│   ├── context/
│   │   └── SocketContext.jsx         # Socket.IO connection + event handlers + API wrappers
│   ├── utils/
│   │   ├── api.js                    # REST client (auth handling, 401 redirect)
│   │   ├── useRoutes.js              # React Query-like hook for routes
│   │   ├── format.js                 # Date/number formatting
│   │   └── useDebounce.js            # Debounce hook
│   └── components/
│       ├── Dashboard.jsx             # Main orchestrator (15 panels via state tabs)
│       ├── AuthForm.jsx              # Login/signup form
│       ├── FleetMap.jsx              # Leaflet map: markers, trails, playback
│       ├── FleetAssetList.jsx        # Table of live fleet
│       ├── DispatchPanel.jsx         # Click map → OSRM matrix → ranked drivers
│       ├── RouteOptimizerPanel.jsx   # VRP UI: depot/vehicles/stops/capacity form
│       ├── GeofenceDrawer.jsx        # Polygon drawing on map
│       ├── HistoryPlayback.jsx       # Timeline scrubber for route replay
│       ├── AdminUserManagement.jsx   # User list + role change
│       ├── VehicleAssignmentPanel.jsx
│       ├── SystemAuditLogs.jsx       # Paginated audit log viewer
│       ├── UserProfile.jsx
│       ├── KpiSummary.jsx            # KPI cards
│       ├── IncidentPanel.jsx         # Incident registry
│       ├── MetricCard.jsx            # Reusable KPI card
│       └── ui/                       # Button, Input, Card, Modal, Select, Toast
```

### `SocketContext.jsx` — Key Contracts

**State**:
```javascript
{
  socket: SocketIOClient,
  isConnected: boolean,
  fleetData: Map<driverName, TelemetryRecord>,
  routes: CompletedRoute[],
  geofences: Geofence[],
  incidents: Incident[],
  stops: Stop[],
  authTokens: { accessToken, refreshToken }  // Legacy: expects `token` field
}
```

**Event Handlers**:
- `fleet:snapshot` → initial fleet load
- `driver:location-update` → update `fleetData` + trail
- `geofence:violation` / `geofence:exit` → update geofence state, toast (TODO)
- `order:created`, `order:dispatched`, `order:status-updated` → refresh orders
- `routeUpdated`, `stopUpdated` → refresh routes/stops

**API Wrappers**: `fetchOrders()`, `fetchGeofences()`, `fetchRoutes()`, etc. (wrap `api.js`)

---

### `utils/api.js` — REST Client

**Base URL**: `import.meta.env.VITE_API_BASE_URL || ''`

**Auth**: Reads `localStorage.getItem('authToken')` (legacy `token` field)

**Methods**: `get`, `post`, `patch`, `del` → return `{success,data}` or throw

**401/403 Handler**: `setUnauthorizedHandler(() => { clearAuth(); navigate('/login'); })`

**Gap**: No refresh token logic

---

## Driver App Module Map

```
kigali-freight-driver/
├── app/
│   ├── (auth)/login.tsx           # Login screen
│   ├── (app)/
│   │   ├── index.tsx              # Dashboard: assignments, metrics, sync status
│   │   ├── assignments.tsx        # List of assigned orders
│   │   ├── trip/[id].tsx          # Trip detail + status transitions
│   │   ├── incidents.tsx          # Incident report form
│   │   └── profile.tsx            # Sign out
│   └── _layout.tsx                # expo-router layout
├── lib/
│   ├── api.ts                     # REST client + auth headers
│   ├── auth.tsx                   # AuthProvider + SecureStore (accessToken only)
│   ├── locationTracking.ts        # Foreground/background (expo-task-manager) — scaffolded
│   ├── pushNotifications.ts       # FCM token + handlers + deep link
│   ├── offlineQueue.ts            # Mutation queue (status updates + incidents) + flush
│   └── netInfo.ts                 # NetInfo listener for online/offline
├── components/
│   ├── ScreenShell.tsx
│   ├── MetricCard.tsx
│   ├── AssignmentCard.tsx
│   └── IncidentForm.tsx
└── types/                         # Shared TypeScript types
```

---

### `lib/auth.tsx` — AuthProvider

**State**: `authState = { accessToken, user: { username, role } }`

**Storage**: `SecureStore` key `auth_token` (accessToken only) + `auth_user`

**Methods**:
```javascript
loginDriver(username, password)    // POST /api/auth/login → stores token, sets state
logoutDriver()                     // POST /api/auth/logout (if refresh token existed) → clears SecureStore
```

**Gap**: No refreshToken storage, no auto-refresh

---

### `lib/api.ts` — REST Client

**Base**: `API_BASE_URL` (env)

**Interceptors**: Adds `Authorization: Bearer <accessToken>` from SecureStore

**401 Handling**: Clears auth, redirects to login (no refresh attempt)

---

### `lib/offlineQueue.ts` — Mutation Queue

**Storage**: `AsyncStorage` key `@offline_queue`

**Queue Item**:
```typescript
{ id: string, type: 'status_update' | 'incident', payload: any, timestamp: number }
```

**Methods**:
```typescript
enqueue(type, payload)           // Push to queue + persist
flushQueue()                     // FIFO: POST /api/orders/:id/status or POST /api/incidents
clearQueue()
```

**Trigger**: Called on `AppState` change to `active` + NetInfo `isConnected`

---

### `lib/pushNotifications.ts`

**FCM**: `expo-notifications` + `messaging`

**Flow**:
1. `registerForPushNotificationsAsync()` → gets Expo push token
2. `registerPushTokenWithBackend(jwt)` → POST `/api/notifications/register-token`
3. Handler: `notificationReceived` + `notificationResponseReceived` → deep link to `/(app)/assignments`

**Gap**: No foreground presentation (banner) handling

---

### `lib/locationTracking.ts`

**Foreground**: `useLocationTracking()` hook → `watchPosition` → callback (not wired to Socket.IO)

**Background**: `TaskManager.defineTask('background-location')` + `startBackgroundLocationTracking()` → `Location.startLocationUpdatesAsync()` — **never called**

---

## Database Module (PostGIS Schema)

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Authentication | id, username, password_hash, role, created_at |
| `refresh_tokens` | Token rotation | id, user_id, token_hash, expires_at, revoked, created_at |
| `orders` | Core domain | id, cargo_description, weight_kg, status, origin_hub_name, pickup (geom), delivery (geom), driver_id, created_at |
| `order_status_logs` | Audit trail | id, order_id, previous_status, new_status, changed_by, changed_at |
| `driver_locations` | Current position | driver_name (PK), geom, velocity_kmh, last_seen |
| `driver_location_history` | Breadcrumbs | id, driver_name, geom, velocity_kmh, recorded_at |
| `geofences` | Zones | id, name, geom (Polygon), speed_limit_kmh |
| `geofence_alerts` | Violations + incidents | id, geofence_id, driver_name, event_type, description, created_at |
| `completed_routes` | VRP snapshots + committed | id, vehicle_id, driver_name, geojson_path, aggregate_distance_km, total_demand, status, created_at |
| `delivery_stops` | Depots | id, name, geom, demand |
| `vehicles` | Fleet registry | id, plate_number, vehicle_type, current_driver_id, status |
| `push_tokens` | FCM tokens | id, username, token, platform, updated_at |
| `audit_logs` | System audit | id, user_id, username, action_type, description, created_at |
| `schema_migrations` | Migration tracking | id, filename, applied_at |

### Indexes (Critical)
- `idx_driver_locations_geom` (GiST on geom) — KNN nearest driver
- `idx_driver_location_history_driver_recorded` (driver_name, recorded_at) — breadcrumb range
- `idx_driver_location_history_geom` (GiST) — spatial history queries
- `idx_orders_status` — active order filtering
- `idx_orders_driver_id` — driver assignments
- `idx_geofences_geom` (GiST) — ST_Contains
- `idx_geofence_alerts_driver_created` — incident listing
- `idx_refresh_tokens_user` — token lookup
- `idx_refresh_tokens_token_hash` — refresh validation

---

## Migration Modules (Ordered)

| # | File | Description |
|---|------|-------------|
| 1 | `001_init_spatial_baseline.sql` | PostGIS extension, enums, core tables, indexes |
| 2 | `002_add_vehicles_table.sql` | vehicles table |
| 3 | `003_add_delivery_stops.sql` | delivery_stops table |
| 4 | `004_add_completed_routes.sql` | completed_routes table |
| 5 | `005_add_push_tokens_table.sql` | push_tokens table |
| 6 | `006_add_audit_logs_table.sql` | audit_logs table |
| 7 | `007_add_geofence_alerts_table.sql` | geofence_alerts (incidents) |
| 8 | `008_add_refresh_tokens.sql` | refresh_tokens, modify users (add password_hash → NOT NULL) |
| 9 | `009_add_users_fk_fixes.sql` | Foreign keys on orders.driver_id, vehicles.current_driver_id |

**Runner**: `bin/migrate.js` — reads `schema_migrations`, applies missing in alphanumeric order, transaction per file.

---

## Cross-Module Data Flow

### Order Assignment Flow
```
POST /api/orders/assign (orderController)
  → SELECT FOR UPDATE orders WHERE id IN (...) AND status='PENDING'
  → UPDATE orders SET status='ASSIGNED', driver_id=...
  → INSERT order_status_logs (PENDING→ASSIGNED)
  → INSERT audit_logs (ORDER_ASSIGNED)
  → socket.emit('order:dispatched', { driverName, assignedManifest[] })
  → notificationService.sendPushToUser(driverName, {...})
  → response 200
```

### Telemetry Ingestion Flow
```
POST /api/fleet/telemetry (fleetController)
  → validate lat/lng/speed
  → telemetryQueue.enqueue({ driverName, lat, lng, speedKmh, timestamp })
  → [async, batch] telemetryQueue.processTelemetryItem(item)
      → upsert driver_locations (geom, velocity_kmh, last_seen)
      → insert driver_location_history
      → SELECT geofences WHERE ST_Contains(geom, point)
      → IF violations:
           → INSERT geofence_alerts
           → socket.emit('geofence:violation')
           → externalAlertService.dispatchExternalAlert()
      → IF exiting previous violation zone:
           → socket.emit('geofence:exit')
```

### Push Notification Flow
```
Driver app login
  → registerForPushNotificationsAsync() → expoPushToken
  → POST /api/notifications/register-token (jwt auth)
     → upsert push_tokens (username, token, platform)
     → 200 OK

Order assigned (backend)
  → notificationService.sendPushToUser(driverName, {...})
     → SELECT token FROM push_tokens WHERE username=driverName
     → firebase.sendToDevice(token, {...})
```

---

## Module Coupling Matrix

| From \ To | DB | Socket.IO | Redis | OSRM | FCM | Telegram |
|-----------|----|-----------|-------|------|-----|----------|
| authController | ✅ | | ✅ (rate limit) | | | |
| orderController | ✅ | ✅ | | | ✅ | |
| fleetController | ✅ | | | | | |
| telemetryQueue | ✅ | ✅ | | | | ✅ |
| routeController | ✅ | ✅ | | | | |
| geofenceController | ✅ | ✅ | | | | |
| dispatchController | | | | ✅ | | |
| notificationService | ✅ | | | | ✅ | |
| socketService | | ✅ | ✅ (adapter) | | | |
| Admin controllers | ✅ | ✅ | | | | |

---

## Testing Module Boundaries

### Integration Tests (`router/tests/integration.test.js`)

**Modules Exercised**:
- Auth: signup → login → refresh → logout → logout-all
- Vehicles: CRUD + assign
- Orders: create → active → pooling → assign → status transitions → history → nearest drivers
- Telemetry: ingest → live sheet → breadcrumbs → performance
- Metrics: `/metrics` endpoint

**Fixtures**: `createTestUser(role)`, `loginAs(role)`, `createTestOrder()`, `createTestVehicle()`

---

## Deployment Module (Docker)

### Router Dockerfile
- Multi-stage: `node:20-alpine` build → `node:20-alpine` runtime
- Non-root user `appuser`
- Healthcheck: `wget -qO- http://localhost:3000/health`
- Env: `NODE_ENV=production`

### UI Dockerfile
- Multi-stage: `node:20-alpine` build (Vite) → `nginx:alpine` serve
- Build arg: `VITE_API_BASE_URL`
- Nginx config: SPA fallback, gzip, caching

### Driver EAS Config (`eas.json`)
- Profiles: `preview`, `production`
- `android:googleServicesFile` for FCM (gitignored)

---

## Missing Modules (Gaps)

| Module | Needed For | Priority |
|--------|------------|----------|
| `services/offlineSync.js` | Server-side offline queue reconciliation | High |
| `services/refreshTokenService.js` | Centralized token rotation logic (moved from controller) | Medium |
| `services/geofenceImport.js` | GeoJSON/KML → geofences bulk import | Medium |
| `services/orderImport.js` | CSV bulk order import | Medium |
| `controllers/userController.js` | Admin user creation (seeded admin only) | High |
| `middleware/inputValidation.js` | Zod schemas on all mutating endpoints | High |
| `utils/openapi.js` | Auto-generated OpenAPI spec from route handlers | Low |
| `services/heatmapAggregator.js` | Historical telemetry → heatmap tiles | Low |
| `services/idleDetector.js` | Engine-on GPS-static detection | Low |
| `services/vrpTimeWindow.js` | Time-window constrained VRP | Low |