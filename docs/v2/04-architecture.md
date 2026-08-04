# Inzira v2.0 — Current Architecture

---

## Project Structure (Monorepo)

```
Freight/
├── kigali-freight-router/          # Backend API + Socket.IO
│   ├── bin/migrate.js              # Migration runner
│   ├── config/                     # Configuration modules
│   │   ├── appConfig.js            # Validated env config (single source of truth)
│   │   ├── db.js                   # pg.Pool singleton
│   │   ├── redisClient.js          # Optional Redis (ioredis)
│   │   └── firebaseAdmin.js        # Firebase Admin SDK init
│   ├── controllers/                # Request handlers (10 files)
│   │   ├── adminController.js
│   │   ├── authController.js
│   │   ├── dispatchController.js
│   │   ├── fleetController.js
│   │   ├── geofenceController.js
│   │   ├── incidentController.js
│   │   ├── notificationController.js
│   │   ├── orderController.js
│   │   ├── routeController.js
│   │   └── stopController.js
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT verification + role guard
│   │   ├── metrics.js              # Prometheus metrics + middleware
│   │   ├── rateLimit.js            # Token bucket (Redis/in-memory)
│   │   ├── requestContext.js       # X-Request-Id propagation
│   │   └── validateAuthPayload.js  # Signup/login validation
│   ├── migrations/                 # 9 SQL files (ordered in bin/migrate.js)
│   ├── routes/                     # Express routers (11 files)
│   ├── services/
│   │   ├── auditLogService.js      # Append to system_audit_logs
│   │   ├── poolingService.js       # Unused — logic in orderController
│   │   ├── pushNotificationService.js # FCM send + token mgmt
│   │   ├── sharedState.js          # Redis/Map abstraction for queue/state
│   │   ├── spatialService.js       # Unused — raw PostGIS helpers
│   │   ├── telemetryQueue.js       # Durable async telemetry processor
│   │   └── vrpOptimizer.js         # Pure TS VRP solver
│   ├── tests/
│   │   └── integration.test.js     # Full stack integration tests
│   ├── utils/
│   │   ├── httpResponse.js         # ok()/fail() response helpers
│   │   └── roles.js                # ALLOWED_ROLES constant
│   ├── server.js                   # App bootstrap, Socket.IO, routes
│   ├── package.json
│   ├── Dockerfile
│   └── README.md
│
├── kigali-freight-ui/              # React 19 + Vite Web Dashboard
│   ├── src/
│   │   ├── components/             # 17 presentational components
│   │   ├── context/SocketContext.jsx # Socket.IO + REST client + state
│   │   ├── utils/
│   │   │   ├── api.js              # fetch wrapper + endpoint helpers
│   │   │   ├── useRoutes.js        # React Query-like hook for routes
│   │   │   └── mapIcons.js         # Leaflet icon config side-effect
│   │   ├── App.jsx                 # Auth gate → Dashboard
│   │   ├── main.jsx                # React root
│   │   └── index.css               # Tailwind v4 imports
│   ├── public/
│   ├── nginx.conf                  # SPA fallback + gzip
│   ├── Dockerfile                  # Multi-stage: build → nginx
│   ├── package.json
│   └── vite.config.js
│
└── kigali-freight-driver/          # Expo 54 + React Native 0.81 + TypeScript
    ├── app/
    │   ├── _layout.tsx             # Stack navigator + AuthProvider
    │   ├── index.tsx               # Redirect → (auth) or (app)
    │   ├── (auth)/login.tsx        # Login screen
    │   └── (app)/                  # Authenticated tabs
    │       ├── _layout.tsx         # Tab navigator
    │       ├── index.tsx           # Dashboard (metrics, assignments, quick actions)
    │       ├── assignments.tsx     # Jobs list
    │       ├── trip/[id].tsx       # Trip detail + status actions
    │       ├── incidents.tsx       # Incident report form
    │       ├── alerts.tsx          # Notifications history (placeholder)
    │       └── profile.tsx         # Sign out, account info
    ├── components/                 # 8 reusable components
    │   ├── ScreenShell.tsx
    │   ├── MetricCard.tsx
    │   ├── AssignmentCard.tsx
    │   ├── SectionHeader.tsx
    │   ├── IncidentForm.tsx
    │   ├── EmptyState.tsx
    │   ├── RefreshControl.tsx
    │   └── LoadingSpinner.tsx
    ├── lib/                        # Core logic (10 files)
    │   ├── api.ts                  # fetch wrapper + endpoint helpers
    │   ├── auth.tsx                # AuthContext + SecureStore + offline flush
    │   ├── offlineQueue.ts         # AsyncStorage FIFO queue + flush
    │   ├── pushNotifications.ts    # FCM token + handler + deep link
    │   ├── locationTracking.ts     # expo-task-manager background task
    │   ├── assignments.ts          # Type mappers for assignment cards
    │   ├── theme.ts                # Design tokens (colors, spacing, radius)
    │   └── ... (utils)
    ├── assets/
    ├── app.config.ts               # Expo config (extra: apiBaseUrl)
    ├── eas.json                    # EAS build profiles
    ├── google-services.json        # FCM config (gitignored in prod)
    ├── package.json
    └── tsconfig.json               # Strict mode
```

---

## Module Dependency Graph

### Backend (Router)

```
server.js (entry)
├── config/appConfig.js
├── config/db.js → pg.Pool
├── config/redisClient.js (optional)
├── config/firebaseAdmin.js (optional)
├── middleware/
│   ├── requestContext.js
│   ├── metrics.js → prom-client
│   ├── rateLimit.js → redisClient / Map
│   ├── authMiddleware.js → jwt.verify
│   └── validateAuthPayload.js
├── routes/ (mounted in order)
│   ├── systemRoutes.js → /health, /ready, /metrics
│   ├── authRoutes.js → /api/auth/* → AuthController
│   ├── orderRoutes.js → /api/orders/* → OrderController
│   ├── fleetRoutes.js → /api/fleet/* → FleetController
│   ├── routeRoutes.js → /api/routes/* → RouteController
│   ├── geofenceRoutes.js → /api/geofences/* → GeofenceController
│   ├── stopRoutes.js → /api/stops/* → StopController
│   ├── dispatchRoutes.js → /api/dispatch/* → DispatchController
│   ├── incidentRoutes.js → /api/incidents/* → IncidentController
│   ├── notificationRoutes.js → /api/notifications/* → NotificationController
│   └── adminRoutes.js → /api/* → AdminController
├── controllers/* → services/*, pool, io
├── services/
│   ├── telemetryQueue.js → sharedState.js → pool, io, dispatchExternalAlert
│   ├── vrpOptimizer.js (pure)
│   ├── pushNotificationService.js → firebaseAdmin, pool
│   ├── auditLogService.js → pool
│   └── sharedState.js → redisClient / Map
└── Socket.IO (io)
    ├── connection auth (JWT or simulator secret)
    ├── driver:telemetry-push → telemetryQueue.enqueue()
    └── events: fleet:snapshot, driver:location-update, geofence:violation, geofence:exit, order:created, order:dispatched, order:status-updated, routeUpdated, stopUpdated
```

### Frontend (UI)

```
main.jsx
└── App.jsx
    └── SocketProvider (SocketContext.jsx)
        ├── useSocket() → provides:
        │   ├── jwtToken, userRole, login/logout
        │   ├── socket (io), isConnected, toggleNetworkStream
        │   ├── trackedAssets, violations, routeHistories, savedGeofences, savedRoutesList
        │   └── actions: refreshFeeds, saveDriverRouteHistory, saveGeofence, deleteGeofence, calculateRoadMatrixETA
        └── Dashboard.jsx (orchestrator)
            ├── KpiSummary, IncidentRegistry, DispatchPanel, HistoryPlayback
            ├── GeofenceDrawer, FleetAssetList, FleetMap (Leaflet)
            ├── RouteOptimizerPanel, AdminControlPanel, AdminUserManagement
            ├── SystemAuditLogs, VehicleAssignmentPanel, UserProfile
            └── useRoutes hook (utils/useRoutes.js) → api.js → fetchRoutes/fetchGeofences
```

### Mobile (Driver)

```
app/_layout.tsx (Stack)
└── AuthProvider (lib/auth.tsx)
    └── index.tsx → Redirect to (auth)/login or (app)/
        ├── (auth)/login.tsx → useAuth().signIn()
        └── (app)/_layout.tsx (Tabs)
            ├── index.tsx (Dashboard) → useAuth(), fetchDriverAssignments()
            ├── assignments.tsx → fetchDriverAssignments()
            ├── trip/[id].tsx → fetchTripHistory(), updateOrderStatus()
            ├── incidents.tsx → reportIncident()
            ├── alerts.tsx (placeholder)
            └── profile.tsx → useAuth().signOut()

lib/
├── api.ts → fetch wrapper + loginDriver, fetchDriverAssignments, updateOrderStatus, reportIncident, registerPushToken
├── auth.tsx → AuthContext (SecureStore, offline flush, push register, location start)
├── offlineQueue.ts → AsyncStorage FIFO + flushOfflineQueue(token)
├── pushNotifications.ts → getDevicePushToken() + registerPushTokenWithBackend(jwt) + useNotificationResponseHandler()
└── locationTracking.ts → TaskManager.defineTask() + startBackgroundLocationTracking()
```

---

## Data Flow

### 1. Order Creation → Assignment → Delivery

```
Dispatcher (UI)                          Backend (Router)                          Driver (App)
     │                                        │                                        │
     ├─ POST /api/orders ───────────────────►│                                        │
     │   {cargo, weight, hub, coords}        │                                        │
     │                                        ├─ INSERT orders (with geom)              │
     │                                        ├─ io.emit('order:created', order)        │
     │                                        │                                        │
     │◄───────────── {order} ────────────────┤                                        │
     │                                        │                                        │
     ├─ POST /api/orders/assign ────────────►│                                        │
     │   {orderIds[], driverName}            │                                        │
     │                                        ├─ BEGIN                                │
     │                                        ├─ SELECT FOR UPDATE orders WHERE id IN  │
     │                                        ├─ UPDATE orders SET status='ASSIGNED'   │
     │                                        ├─ INSERT order_status_logs              │
     │                                        ├─ COMMIT                               │
     │                                        ├─ io.emit('order:dispatched', ...)     │
     │                                        ├─ sendPushToUser(driverName, ...)      │
     │                                        │                                        │
     │◄───────────── {dispatchedCount} ──────┤                                        │
     │                                        │                                        │
     │                                        │                                        ├─ FCM push received
     │                                        │                                        ├─ app opens → fetchDriverAssignments()
     │                                        │                                        │   GET /api/orders/driver/assignments
     │                                        │◄───────────────────────────────────────┤
     │                                        │                                        │
     │                                        │   Driver updates status ── PATCH /api/orders/:id/status
     │                                        │   {status: 'PICKED_UP'}                 │
     │                                        │◄───────────────────────────────────────┤
     │                                        ├─ BEGIN                                │
     │                                        ├─ UPDATE orders SET status=...          │
     │                                        ├─ INSERT order_status_logs              │
     │                                        ├─ COMMIT                               │
     │                                        ├─ io.emit('order:status-updated', ...) │
     │                                        │                                        │
```

### 2. Telemetry Ingestion (Socket.IO + HTTP)

```
Driver App (background task)              Backend (Router)
     │                                        │
     ├─ HTTP POST /api/fleet/telemetry ────►│  (or Socket.IO driver:telemetry-push)
     │   {lat, lng, speedKmh}               │
     │                                        ├─ telemetryQueue.enqueue(item)
     │                                        │   │
     │                                        │   └─ (async, 250ms batch)
     │                                        │       ├─ INSERT driver_location_history
     │                                        │       ├─ UPSERT driver_locations
     │                                        │       ├─ SELECT geofences WHERE ST_Contains(geom, point)
     │                                        │       ├─ IF violation: INSERT geofence_alerts + io.emit('geofence:violation')
     │                                        │       ├─ UPSERT fleet:live-state hash
     │                                        │       └─ io.emit('driver:location-update', state)
     │                                        │
     │◄──────────── {queued: true} ──────────┤
     │                                        │
UI (Dashboard)                              │
     │                                        │
     ├─ Socket.IO connect (Bearer token) ───►│
     │                                        ├─ io.emit('fleet:snapshot', allLiveState)
     │◄──────────── fleet:snapshot ──────────┤
     │                                        │
     ├─ driver:location-update ──────────────►│ (real-time marker updates)
     ├─ geofence:violation ─────────────────►│ (violation toast)
     │                                        │
```

### 3. VRP Optimization

```
Dispatcher (UI)                          Backend (Router)
     │                                        │
     ├─ POST /api/routes/optimize ─────────►│
     │   {depot, vehicles[], stops[], cap}   │
     │                                        ├─ solveVRP({depot, stops, vehicleCapacity})
     │                                        │   ├─ Build N×N Haversine distance matrix
     │                                        │   ├─ Capacity-constrained nearest-neighbor clustering
     │                                        │   ├─ 2-opt per route
     │                                        │   └─ Return {routes[], summary}
     │◄──────────── {routes, summary} ───────┤
     │                                        │
     ├─ (review on map)                      │
     ├─ POST /api/routes/commit ────────────►│
     │   {vehicleId, driverName, geojson, km, demand}│
     │                                        ├─ INSERT completed_routes (status=COMMITTED)
     │                                        ├─ io.emit('routeUpdated', route)
     │                                        └─ appendAuditLog('ROUTE_COMMITTED', ...)
```

### 4. Offline Queue (Driver App)

```
Driver App (offline)                       Backend (when online)
     │                                        │
     ├─ updateOrderStatus() ──────────────►│  (FAILS: no network)
     │                                        │
     ├─ enqueueOfflineAction({type:'status-update', orderId, status}) │
     ├─ enqueueOfflineAction({type:'incident-report', payload})       │
     │                                        │
     │  (App foregrounds / network returns)                                  │
     ├─ AppState 'active' event ──────────►│                                        │
     │                                        │
     ├─ flushOfflineQueue(token) ──────────►│  (sequential FIFO)
     │   For each item:                       ├─ updateOrderStatus() or reportIncident()
     │     try:                                │
     │       await apiCall()                   │   (succeeds → removed from queue)
     │     catch:                              │   (fails → stop, remaining re-queued)
     │       break                             │
```

---

## External Integrations

| Integration | Protocol | Purpose | Config |
|-------------|----------|---------|--------|
| **PostgreSQL + PostGIS** | TCP (pg) | Primary data store, spatial queries | `DB_*` env vars |
| **Redis (optional)** | TCP (ioredis) | Rate limit, Socket.IO adapter, shared state | `REDIS_URL` |
| **OSRM** | HTTP | Distance/duration matrix for dispatch | `router.project-osrm.org` (public) |
| **Firebase Cloud Messaging** | HTTP (Firebase Admin) | Push notifications to driver apps | `FIREBASE_SERVICE_ACCOUNT_PATH` |
| **Telegram Bot API** | HTTP | Geofence alerts (fallback) | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **Generic Webhook** | HTTP POST | Alert dispatch (configurable) | `ALERT_WEBHOOK_URL` |
| **Leaflet/OSM Tiles** | HTTPS | Map rendering (UI) | No auth (public tiles) |

---

## Communication Protocols

### REST API
- **Base**: `/api`
- **Auth**: `Authorization: Bearer <jwt>`
- **Envelope**: `{success: true, data: ...}` or `{success: false, error: {code, message}}`
- **Content-Type**: `application/json`
- **Rate Limits**: 400/401/403/404/409/429/500 with codes

### Socket.IO
- **Namespace**: `/` (default)
- **Auth**: `auth: { token: 'Bearer <jwt>' }` on connect
- **Events (Server → Client)**:
  - `fleet:snapshot` — initial asset array
  - `driver:location-update` — `{driverName, lat, lng, velocityKmh, lastSeen}`
  - `geofence:violation` — `{id, driverName, zoneName, type, description, enteredAt}`
  - `geofence:exit` — `{driverName, zoneName, exitedAt}`
  - `order:created` — order object
  - `order:dispatched` — `{driverName, assignedManifest[], timestamp}`
  - `order:status-updated` — `{orderId, status, cargo_description, timestamp}`
  - `routeUpdated` — completed_route row
  - `stopUpdated` — delivery_stop row (or `{id, deleted: true}`)
- **Events (Client → Server)**:
  - `driver:telemetry-push` — `{driverName, lat, lng}` (authenticated driver only)

---

## Deployment Topology

```
                    ┌──────────────┐
                    │   Clients    │
                    │  (UI, Driver)│
                    └──────┬───────┘
                           │ HTTPS/WSS
                    ┌──────▼───────┐
                    │  Load Balancer│
                    │  (nginx/ALB)   │
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │Router #1│    │Router #2│    │Router #N│  (horizontal scaling)
      └────┬────┘    └────┬────┘    └────┬────┘
           │              │              │
           └──────────────┼──────────────┘
                          ▼
              ┌─────────────────────┐
              │   Redis Cluster     │  (Pub/Sub for Socket.IO adapter,
              │  (Rate limit,       │   shared rate-limit counters,
              │   Socket adapter,   │   telemetry queue, live fleet hash)
              │   Shared state)     │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │  PostgreSQL/PostGIS │  (Primary + read replicas)
              └─────────────────────┘
```

### Single-Instance (Dev / Small Scale)
- No Redis → in-memory rate limit, in-memory Socket.IO adapter, in-process telemetry queue
- All state local to process

---

## Configuration Matrix

| Env Var | Required | Default | Apps |
|---------|----------|---------|------|
| `PORT` | No | 5000 | Router |
| `CORS_ORIGIN` | No | `http://localhost:5173,http://127.0.0.1:5173` | Router |
| `DB_USER` | Yes | — | Router |
| `DB_PASSWORD` | Yes | — | Router |
| `DB_HOST` | Yes | — | Router |
| `DB_PORT` | No | 5432 | Router |
| `DB_DATABASE` | Yes | — | Router |
| `JWT_SECRET` | Yes | — | Router |
| `SIMULATOR_SHARED_SECRET` | No | — | Router |
| `TELEGRAM_BOT_TOKEN` | No | — | Router |
| `TELEGRAM_CHAT_ID` | No | — | Router |
| `ALERT_WEBHOOK_URL` | No | — | Router |
| `REDIS_URL` | No | — | Router |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | No | — | Router |
| `ALLOW_DESTRUCTIVE_BASELINE` | No | 0 | Router (migrate) |
| `VITE_API_BASE_URL` | Yes | — | UI |
| `EXPO_PUBLIC_API_BASE_URL` | Yes | — | Driver |

---

## Security Boundaries

| Boundary | Protection |
|----------|------------|
| **Public Internet → Router** | Helmet (no CSP), CORS allow-list, rate limit (10 req/15min on auth), JWT on all `/api/*` |
| **Router → PostgreSQL** | Parameterized queries only (no string interpolation), least-privilege DB user |
| **Router → Redis** | TLS if `rediss://`, password in URL |
| **Router → FCM** | Service account JSON (file, not env), scoped to messaging |
| **Router → OSRM** | Public endpoint, no auth, timeout 5s |
| **UI → Router** | Same-origin or CORS allow-list, JWT in localStorage |
| **Driver → Router** | JWT in SecureStore, FCM token per device, background task reads token from SecureStore |

---

## Observability Stack

| Component | Tool | Endpoint |
|-----------|------|----------|
| Metrics | Prometheus | `GET /metrics` |
| Health | Custom | `GET /health` (liveness) |
| Readiness | Custom | `GET /ready` (DB check) |
| Logs | Console (JSON) | stdout — structured: `{level, requestId, method, path, statusCode, durationMs}` |
| Tracing | X-Request-Id header | Propagated via `requestContext` middleware |

---

## Technology Versions (Locked)

| Layer | Package | Version |
|-------|---------|---------|
| Runtime | Node.js | 20.x (LTS) |
| Backend | Express | 4.18.x |
| Backend | Socket.IO | 4.7.x |
| Backend | pg | 8.11.x |
| Backend | ioredis | 5.3.x |
| Backend | jsonwebtoken | 9.0.x |
| Backend | bcrypt | 5.1.x |
| Backend | prom-client | 15.1.x |
| Frontend | React | 19.x |
| Frontend | Vite | 5.x |
| Frontend | Tailwind CSS | 4.x |
| Frontend | Leaflet | 1.9.x |
| Frontend | react-leaflet | 4.2.x |
| Frontend | socket.io-client | 4.7.x |
| Mobile | Expo SDK | 54 |
| Mobile | React Native | 0.81.x |
| Mobile | TypeScript | 5.3.x |
| Mobile | expo-router | 5.x |
| Mobile | expo-location | ~18.0.0 |
| Mobile | expo-notifications | ~0.28.0 |
| Mobile | expo-secure-store | ~13.0.0 |
| Mobile | @react-native-async-storage/async-storage | 1.21.x |

---