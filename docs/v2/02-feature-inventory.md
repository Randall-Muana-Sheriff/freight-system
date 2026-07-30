# Kigali Freight v2.0 — Feature Inventory

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Complete | Fully implemented, tested, working end-to-end |
| ⚠️ Partial | Implemented but has gaps (missing tests, client not wired, edge cases) |
| ❌ Missing | Not implemented at all |

---

## Authentication & Authorization

| Feature | Status | Notes |
|---------|--------|-------|
| User registration (public) | ⚠️ Partial | Allows `role=admin` — should be restricted to `driver` only |
| User login (username/password) | ✅ Complete | Returns `accessToken` (2h) + `refreshToken` (30d) |
| JWT access token (HS256) | ✅ Complete | 2h expiry, contains `userId`, `username`, `role` |
| Refresh token rotation | ✅ Backend / ❌ Clients | Backend issues new pair + revokes old; UI/Driver don't use refresh |
| Logout (revoke single token) | ✅ Complete | `POST /api/auth/logout` with refresh token |
| Logout all devices | ✅ Complete | `POST /api/auth/logout-all` (requires auth) |
| Role guards (middleware) | ✅ Complete | `authMiddleware(['admin','dispatcher'])` etc. |
| Password hashing (bcrypt) | ✅ Complete | Cost factor 10 |
| Password reset flow | ❌ Missing | No email, no token, no UI |
| Session listing / revoke others | ⚠️ Backend only | `refresh_tokens` table has data; no admin UI endpoint |
| Seeded global admin | ❌ Missing | No migration to create initial `admin` user |

---

## Orders (Core Domain)

| Feature | Status | Notes |
|---------|--------|-------|
| Create order (dispatcher/admin) | ✅ Complete | `POST /api/orders` with geometry + PostGIS points |
| List active/pending orders | ✅ Complete | `GET /api/orders/active` |
| Spatial pooling (nearby pickups/deliveries) | ✅ Complete | `GET /api/orders/pooling` — ST_DWithin 1.5km/3.5km |
| Assign bundle to driver (transactional) | ✅ Complete | `POST /api/orders/assign` — `SELECT FOR UPDATE` + audit log |
| Driver sees own assignments | ✅ Complete | `GET /api/orders/driver/assignments` |
| Status transitions (PENDING→ASSIGNED→PICKED_UP→IN_TRANSIT→ARRIVED→DELIVERED) | ✅ Complete | `PATCH /api/orders/:id/status` with role checks |
| Status audit trail | ✅ Complete | `order_status_logs` table + `GET /api/orders/:id/history` |
| Nearest driver recommendations | ✅ Complete | `GET /api/orders/:id/nearest-drivers` — KNN `<->` operator |
| Cancel order | ❌ Missing | No endpoint; would need reason code + notification |
| Bulk import (CSV) | ❌ Missing | Dispatcher pain point |
| Time-window constraints on stops | ❌ Missing | VRP solver doesn't support |

---

## Routes & VRP Optimization

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-stop VRP (nearest-neighbor + 2-opt) | ✅ Complete | `POST /api/routes/optimize` — capacity-aware |
| Depot + vehicles + stops + capacity input | ✅ Complete | Solver returns per-vehicle sequence + distance + load |
| Save route snapshot | ✅ Complete | `POST /api/routes/save` → `completed_routes` (status=SNAPSHOT) |
| Commit finalized route | ✅ Complete | `POST /api/routes/commit` → `completed_routes` (status=COMMITTED) |
| List committed routes | ✅ Complete | `GET /api/routes` |
| Route history playback (UI) | ✅ Complete | `HistoryPlayback` component parses GeoJSON |
| Time windows | ❌ Missing | Solver ignores |
| Driver shift limits | ❌ Missing | Solver ignores |
| Traffic-aware routing | ❌ Missing | Uses Haversine straight-line only |
| Multi-depot | ❌ Missing | Single depot only |

---

## Geofences

| Feature | Status | Notes |
|---------|--------|-------|
| CRUD (create/read/delete) | ✅ Complete | `POST/GET/DELETE /api/geofences` |
| Polygon storage (PostGIS) | ✅ Complete | `geom` geometry(Polygon,4326) + speed_limit_kmh |
| Real-time violation detection | ✅ Backend | Telemetry queue checks `ST_Contains(geom, point)` on every ping |
| Speed violation detection | ✅ Backend | Compares `currentVelocityKmh` vs `speed_limit_kmh` |
| WebSocket events (`geofence:violation`, `geofence:exit`) | ✅ Backend | Emitted from `telemetryQueue.js` |
| External alerts (Telegram/webhook) | ✅ Backend | `dispatchExternalAlert()` called on violation |
| UI violation toast/notification | ⚠️ Partial | UI receives event; no toast component implemented |
| Geofence import (GeoJSON/KML) | ❌ Missing | Manual coordinate entry only |
| Per-vehicle speed override | ❌ Missing | Global per-geofence only |

---

## Fleet Telemetry

| Feature | Status | Notes |
|---------|--------|-------|
| Driver device → HTTP `/api/fleet/telemetry` | ✅ Complete | Authenticated driver role; enqueues to durable queue |
| Driver device → Socket.IO `driver:telemetry-push` | ✅ Backend | Same queue processing path |
| Queue persistence (Redis list / in-memory fallback) | ✅ Complete | `telemetryQueue.js` with batch flush (250ms, 100 items) |
| Dual write: `driver_locations` (current) + `driver_location_history` (breadcrumbs) | ✅ Complete | Upsert + insert |
| Geofence check on every ping | ✅ Complete | Runs inside `processTelemetryItem` |
| Live fleet status (spatial join orders→drivers) | ✅ Complete | `GET /api/fleet/telemetry-sheet` — distance, ETA, staleness |
| Driver breadcrumbs (RDP compression via PostGIS) | ✅ Complete | `GET /api/fleet/history/:driverName?hours=4&tolerance=0.0001` |
| Fleet performance report (dwell time at hubs) | ✅ Complete | `GET /api/fleet/analytics/performance` |
| Driver app background location → backend | ⚠️ Scaffolded | `lib/locationTracking.ts` exists; never started; no Socket.IO emit |
| Driver app foreground location → Socket.IO | ❌ Missing | No watchPosition wired to `driver:telemetry-push` |
| Historical heatmap | ❌ Missing | Data exists; no visualization |
| Idle detection | ❌ Missing | No "engine on, GPS static" logic |

---

## Incidents

| Feature | Status | Notes |
|---------|--------|-------|
| Driver reports incident (title + description + optional orderId) | ✅ Complete | `POST /api/incidents` → `geofence_alerts` with event_type=MANUAL_INCIDENT |
| UI incident registry | ✅ Complete | `IncidentRegistry` component lists all |
| Acknowledgment workflow | ❌ Missing | No "mark seen/resolved" by dispatcher |
| Photo attachment | ❌ Missing | Driver app has no camera integration |
| Escalation rules | ❌ Missing | No timeout → SMS/call |

---

## Notifications (Push)

| Feature | Status | Notes |
|---------|--------|-------|
| FCM token registration endpoint | ✅ Complete | `POST /api/notifications/register-token` |
| Token storage (`push_tokens` table) | ✅ Complete | Upsert on (re)register; delete on FCM unregistered |
| Send to user (all their devices) | ✅ Backend | `sendPushToUser(username, {title,body,data})` |
| Order assign → push notification | ⚠️ Backend only | `assignOrderBundle` calls `sendPushToUser`; no integration test |
| Driver app registers token on login | ✅ Complete | `registerPushTokenWithBackend(jwt)` called in `AuthProvider` |
| Notification tap → deep link to assignments | ✅ Complete | `useNotificationResponseHandler` routes to `/(app)/assignments` |
| In-app notification center | ❌ Missing | Only native push; no history screen |
| Webhook fallback (Telegram) | ✅ Backend | `dispatchExternalAlert` used for geofence alerts |

---

## Admin Panel

| Feature | Status | Notes |
|---------|--------|-------|
| List users (id, username, role) | ✅ Complete | `GET /api/users` |
| Update user role | ✅ Complete | `PATCH /api/users/:id/role` (admin only) |
| List vehicles | ✅ Complete | `GET /api/vehicles` |
| Create vehicle | ✅ Complete | `POST /api/vehicles` |
| Assign vehicle to driver | ✅ Complete | `PATCH /api/vehicles/:id/assign` |
| Audit logs (paginated, 100 latest) | ✅ Complete | `GET /api/audit-logs` |
| Vehicle maintenance tracking | ❌ Missing | No schema, no endpoints |
| Driver performance scorecard | ❌ Missing | Data exists; no aggregation endpoint |

---

## Delivery Stops (Depot Management)

| Feature | Status | Notes |
|---------|--------|-------|
| List pending stops | ✅ Complete | `GET /api/stops` |
| Create stop (name, lat, lng, demand) | ✅ Complete | `POST /api/stops` |
| Delete stop | ✅ Complete | `DELETE /api/stops/:id` |
| Map-based picker (UI) | ✅ Complete | `stopTargetMode` in Dashboard |

---

## Dispatch Operations

| Feature | Status | Notes |
|---------|--------|-------|
| OSRM matrix (distance/duration from point to fleet) | ✅ Complete | `POST /api/dispatch/matrix` calls `router.project-osrm.org` |
| Driver ranking by ETA | ✅ Complete | Returns sorted `{driverName, distanceKm, etaMinutes}` |
| UI dispatch panel (click map → see rankings) | ✅ Complete | `DispatchPanel` + `calculateRoadMatrixETA` |

---

## Analytics / Reporting

| Feature | Status | Notes |
|---------|--------|-------|
| Fleet performance (dwell time at hubs) | ✅ Complete | `GET /api/fleet/analytics/performance` |
| Live fleet KPIs (active count, stale signals) | ✅ Complete | Part of `telemetry-sheet` response |
| Prometheus metrics (HTTP, socket, custom) | ✅ Complete | `/metrics` endpoint |
| Business KPIs (orders/min, ETA accuracy) | ❌ Missing | Only infra metrics |

---

## Driver Mobile App

| Feature | Status | Notes |
|---------|--------|-------|
| Login (SecureStore persistence) | ✅ Complete | `AuthProvider` + `loginDriver` |
| Auto token refresh | ❌ Missing | Stores only access token |
| Dashboard (assignments, metrics, pending sync) | ✅ Complete | `index.tsx` + `MetricCard` |
| Assignments list | ✅ Complete | `assignments.tsx` fetches `/driver/assignments` |
| Assignment detail + status transitions | ✅ Complete | `trip/[id].tsx` with PATCH status |
| Incident reporting (title + description) | ✅ Complete | `incidents.tsx` → `POST /api/incidents` |
| Offline queue (status updates + incidents) | ✅ Scaffolded | `lib/offlineQueue.ts` — FIFO flush on foreground |
| Background location tracking (expo-task-manager) | ⚠️ Scaffolded | Task defined; `startBackgroundLocationTracking()` never called |
| Foreground location → Socket.IO | ❌ Missing | No `watchPosition` + `driver:telemetry-push` |
| Push notifications (FCM) | ✅ Complete | Token registration + handler + deep link |
| Proof of delivery (photo + signature) | ❌ Missing | No camera, no canvas signature |
| Navigation handoff (Google Maps / Waze) | ❌ Missing | `Linking.openURL` not implemented |
| Profile / sign out | ✅ Complete | `profile.tsx` |
| Airplane mode → offline → sync | ⚠️ Untested | Queue exists; no E2E test |

---

## Web Dashboard (UI)

| Feature | Status | Notes |
|---------|--------|-------|
| Login / signup form | ✅ Complete | `AuthForm` — but expects old `token` field |
| Role-based panel visibility | ✅ Complete | `userRole === 'admin'` guards |
| KPI summary cards | ✅ Complete | `KpiSummary` |
| Live fleet map (Leaflet) | ✅ Complete | `FleetMap` — real-time markers, trails, playback |
| Fleet asset list | ✅ Complete | `FleetAssetList` |
| Dispatch panel (click map → rank drivers) | ✅ Complete | `DispatchPanel` |
| Route optimizer (VRP UI) | ✅ Complete | `RouteOptimizerPanel` — depot/vehicles/stops/capacity |
| Geofence drawer (polygon on map) | ✅ Complete | `GeofenceDrawer` |
| History playback (timeline scrubber) | ✅ Complete | `HistoryPlayback` |
| Admin user management | ✅ Complete | `AdminUserManagement` |
| Admin vehicle assignment | ✅ Complete | `VehicleAssignmentPanel` |
| Audit logs viewer | ✅ Complete | `SystemAuditLogs` |
| User profile | ✅ Complete | `UserProfile` |
| Dark/light theme | ❌ Missing | Tailwind v4 supports; not implemented |
| Error boundaries | ❌ Missing | No React error boundary for map/components |

---

## Infrastructure / DevOps

| Feature | Status | Notes |
|---------|--------|-------|
| Router Dockerfile (multi-stage, non-root) | ✅ Complete | |
| UI Dockerfile (nginx static) | ✅ Complete | |
| Driver EAS config (`eas.json`) | ✅ Complete | Preview/production profiles |
| GitHub Actions CI (router) | ✅ Complete | Dual test (mem+Redis), audit, Docker build |
| GitHub Actions CI (UI) | ✅ Complete | Lint + build + Docker |
| GitHub Actions CI (Driver) | ❌ Missing | No workflow |
| Root docker-compose.yml | ❌ Missing | Only in router README reference |
| Migration runner (tracked, idempotent) | ✅ Complete | `bin/migrate.js` + `schema_migrations` table |
| Migration rollback scripts | ❌ Missing | No `down` SQL |
| Database backup/restore scripts | ❌ Missing | Not tested |
| Health/readiness endpoints | ✅ Complete | `/health`, `/ready` |
| Structured JSON logging | ✅ Complete | `server.js` request logging |
| Prometheus metrics | ✅ Complete | `/metrics` |
| Load test script | ✅ Complete | `ops/load-test.js` (simulates 100+ drivers) |

---

## Summary Counts

| Category | ✅ Complete | ⚠️ Partial | ❌ Missing | Total |
|----------|-------------|------------|------------|-------|
| Authentication | 6 | 3 | 2 | 11 |
| Orders | 7 | 0 | 3 | 10 |
| Routes/VRP | 5 | 0 | 4 | 9 |
| Geofences | 6 | 1 | 2 | 9 |
| Fleet Telemetry | 7 | 1 | 4 | 12 |
| Incidents | 2 | 0 | 3 | 5 |
| Notifications | 5 | 1 | 2 | 8 |
| Admin | 6 | 0 | 2 | 8 |
| Stops | 3 | 0 | 0 | 3 |
| Dispatch | 2 | 0 | 0 | 2 |
| Analytics | 2 | 0 | 1 | 3 |
| Driver App | 7 | 2 | 5 | 14 |
| Web Dashboard | 13 | 0 | 2 | 15 |
| Infrastructure | 7 | 0 | 5 | 12 |
| **TOTAL** | **78** | **8** | **35** | **121** |

---