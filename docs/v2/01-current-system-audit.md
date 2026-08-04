# Inzira v2.0 — Current System Audit

---

## Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KIGALI FREIGHT MONOREPO                      │
├─────────────────────┬───────────────────────┬───────────────────────┤
│  kigali-freight-router          kigali-freight-ui            kigali-freight-driver   │
│  (Backend API)                   (Web Dashboard)              (Mobile Driver App)     │
│  Express + Socket.IO          React 19 + Vite                Expo 54 + RN 0.81        │
│  PostgreSQL/PostGIS           Tailwind CSS v4                TypeScript + expo-router │
│  Redis (optional)             Leaflet/React-Leaflet          SecureStore, AsyncStorage│
│  Firebase Admin (FCM)         Socket.IO Client               expo-location, FCM       │
└─────────────────────┴───────────────────────┴───────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Shared contracts │
                    │  (implicit only)  │
                    └───────────────────┘
Communication: REST (HTTPS) + Socket.IO (WSS)
Auth: JWT (access) + bcrypt-hashed refresh tokens (rotation)
Real-time: Socket.IO with Redis adapter for horizontal scaling
```

---

## Strengths

| Area | Evidence |
|------|----------|
| **Spatial intelligence** | Native PostGIS: KNN driver matching, ST_DWithin pooling, ST_Simplify breadcrumbs, geometry columns on orders |
| **Real-time durability** | Telemetry queue persists to Redis/in-memory → async flush → dual-table write (current + history) → geofence check → broadcast |
| **Transaction safety** | Order assignment uses `SELECT ... FOR UPDATE` + explicit `BEGIN/COMMIT/ROLLBACK` in single client connection |
| **Role-based auth** | Middleware enforces `['admin']`, `['admin','dispatcher']`, `['admin','driver','dispatcher']` per endpoint |
| **Audit trail** | Every mutating action writes to `system_audit_logs` with username, action_type, description, timestamp |
| **Observability** | Prometheus metrics (HTTP latency, socket events), `/health` + `/ready` + `/metrics`, structured JSON logs |
| **Migration discipline** | Schema versioning via `schema_migrations` table; additive-only migrations; bootstrap detection for existing DBs |
| **VRP solver** | Nearest-neighbor + 2-opt with capacity constraints — pure TS, no external OR-Tools dependency |
| **Offline-first mobile** | AsyncStorage queue with FIFO flush on app foreground + background location task scaffolded |

---

## Weaknesses

| Area | Issue |
|------|-------|
| **No shared contracts** | UI and driver each duplicate API response shapes; drift is inevitable |
| **No API documentation** | OpenAPI spec missing; frontend devs guess field names from `console.log` |
| **Validation gap** | Controllers trust middleware only; no Zod/Joi schemas on request bodies |
| **Test coverage** | Router has integration tests only; UI: 0 tests; Driver: 0 tests; no E2E |
| **Token refresh on clients** | Backend implemented rotation; UI `api.js` and driver `api.ts` still expect single `token` field |
| **Driver telemetry not wired** | `lib/locationTracking.ts` exists but never emits `driver:telemetry-push` to Socket.IO |
| **Push notifications untested** | FCM token registration endpoint exists; no integration test sends notification on assign |
| **Migration ordering bug** | `add_users.sql` creates `user_role` enum; `init_spatial.sql` doesn't — fails on fresh DB |
| **Inconsistent role casing** | Middleware normalizes to lowercase; some routes use `['ADMIN','DISPATCHER']`, others `['admin','dispatcher']` |
| **Hardcoded Kigali hubs** | Seed data embeds Nyabugogo/Kimironko/Gikondo; not configurable |

---

## Technical Debt

| ID | Location | Description | Effort |
|----|----------|-------------|--------|
| TD-001 | `router/controllers/*` | No request validation; `req.body` used directly | S |
| TD-002 | `router/utils/roles.js` | `ALLOWED_ROLES` duplicated in middleware, controllers, validation | S |
| TD-003 | `router/migrations/add_users.sql` | `CREATE TYPE user_role` fails if exists; needs `DO $$` guard | S |
| TD-004 | `router/controllers/authController.js` | `signup` allows `role=admin` from public endpoint | S |
| TD-005 | `router/tests/integration.test.js` | Tests create users via public signup; should use admin API | M |
| TD-006 | `ui/src/utils/api.js` | Expects `{success,data.token}`; backend now returns `{success,data:{accessToken,refreshToken,role}}` | S |
| TD-007 | `driver/lib/api.ts` | Same as TD-006; also no token refresh logic | S |
| TD-008 | `driver/lib/auth.tsx` | Stores only `token`/`role`/`username`; no `refreshToken` | M |
| TD-009 | `driver/lib/locationTracking.ts` | Background task registered but never started; foreground watch not wired to Socket.IO | M |
| TD-010 | `router/services/vrpOptimizer.js` | No time windows, no driver shift constraints, no traffic awareness | L |
| TD-011 | `router/config/appConfig.js` | No validation for `CORS_ORIGIN` — `*` allowed in dev | S |
| TD-012 | `router/server.js` | Helmet CSP disabled globally; should be per-route or config-driven | S |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **API contract drift** | High | High | Create shared `@kigali-freight/api-types` package; generate from OpenAPI |
| **Refresh token DB growth** | Medium | Medium | TTL index + nightly cron to purge expired/revoked >30d |
| **Socket.IO connection storms** | Medium | High | Redis adapter + sticky sessions; connection rate limiting |
| **PostGIS query regression** | Low | High | Add `EXPLAIN ANALYZE` to CI for spatial queries |
| **Driver app background kill** | High | High | Test on Android 14 + iOS 17; use `expo-task-manager` + `startLocationUpdatesAsync` |
| **FCM token rotation** | Medium | Medium | Backend deletes on `messaging/registration-token-not-registered`; client re-registers on login |
| **Single-point Redis** | Low | High | Deploy Redis Sentinel or Cluster; fail-open to in-memory for auth |
| **Migration rollback untested** | Medium | High | Write `down` SQL for each migration; test in CI |

---

## Production Readiness Assessment

| Component | Status | Blockers |
|-----------|--------|----------|
| **Authentication** | ⚠️ Partial | Public signup allows admin role; refresh tokens not consumed by clients |
| **Orders lifecycle** | ✅ Complete | — |
| **VRP optimization** | ✅ Complete | No time windows / shift constraints |
| **Geofences** | ✅ Complete | Violation alerts only via WebSocket/Telegram — no in-app toast on UI |
| **Fleet telemetry** | ✅ Backend / ⚠️ Frontend | Driver app doesn't push; UI receives but driver never sends |
| **Incidents** | ✅ Complete | Driver can report; UI shows; no acknowledgment workflow |
| **Notifications** | ⚠️ Partial | FCM register endpoint exists; no send-on-assign integration test |
| **Admin panel** | ✅ Complete | User mgmt, vehicle mgmt, audit logs all functional |
| **Observability** | ✅ Complete | Prometheus + health/ready + structured logs |
| **CI/CD** | ⚠️ Partial | Router: dual test (mem+Redis), audit; UI: lint+build only; Driver: no CI |
| **Docker** | ✅ Router/UI | Driver: EAS only (no Docker) |
| **Database ops** | ⚠️ Partial | Migrations run on start; no backup/restore scripts; no rollback tested |

---

## Missing Features (by Module)

### Authentication
- [ ] Public signup restricted to `driver` only (admin creates admin/dispatcher)
- [ ] Password reset flow (email → token → new password)
- [ ] Refresh token rotation on UI + Driver clients
- [ ] Session listing / revoke-other-devices (backend exists, no UI)

### Orders
- [ ] Time-window constraints on stops (VRP)
- [ ] Multi-depot support
- [ ] Order cancellation with reason codes
- [ ] Bulk import (CSV/Excel) for dispatchers

### Routes/VRP
- [ ] Traffic-aware routing (OSRM with live speeds)
- [ ] Driver shift / working hour limits
- [ ] Vehicle type compatibility (cold chain, hazmat)
- [ ] Route replay with speed/stop annotations

### Geofences
- [ ] In-app violation toast/notification on UI dashboard
- [ ] Geofence speed limit override per vehicle
- [ ] Polygon import (GeoJSON/KML upload)

### Fleet Telemetry
- [ ] Driver app background location → Socket.IO
- [ ] Historical heatmap (deck.gl or Leaflet.heat)
- [ ] Idle detection (engine on, GPS static > N min)

### Incidents
- [ ] Acknowledgment workflow (dispatcher marks "seen/resolved")
- [ ] Photo attachment (driver app)
- [ ] Escalation rules (unacked > 15 min → SMS/call)

### Notifications
- [ ] FCM send on order assign (integration test)
- [ ] In-app notification center (UI + driver)
- [ ] Webhook retry with exponential backoff

### Admin
- [ ] Role change audit diff (old → new)
- [ ] Vehicle maintenance schedule
- [ ] Driver performance scorecard (on-time %, incidents, distance)

### Analytics
- [ ] Orders/minute, avg delivery time, ETA accuracy
- [ ] Driver utilization heatmap
- [ ] Geofence violation trends

---

## Security Concerns

| Issue | Severity | Location |
|-------|----------|----------|
| Public `/api/auth/signup` accepts `role=admin` | **Critical** | `authController.js:88` |
| No request body validation (_sql injection via_ `user_role` enum bypass) | High | All controllers |
| Helmet CSP disabled globally | Medium | `server.js:35` |
| CORS `origin: '*'` allowed in dev | Low | `server.js:40` |
| JWT secret in env only (no rotation) | Medium | `appConfig.js:47` |
| Refresh tokens stored as bcrypt (good) but no rotation policy enforcement | Medium | `authController.js:112` |
| FCM server key in env (if set) — no secret manager | Low | `pushNotificationService.js` |
| Socket.IO auth only on connect (no per-event re-auth) | Low | `server.js:141` |

---

## Performance Concerns

| Area | Concern | Current State |
|------|---------|---------------|
| **Telemetry queue flush** | 250ms interval, batch 100 → 400 writes/sec max | Acceptable for ~200 drivers |
| **VRP solver** | O(n²) distance matrix + 2-opt → slows >50 stops | Use for ≤30 stops; offload to worker for larger |
| **Spatial queries** | `ST_DWithin` on `geography` cast per query | Add functional indexes on `pickup_geom::geography` |
| **Socket.IO broadcast** | `io.emit` to all clients on every telemetry | Use rooms: `driver:<id>`, `role:dispatcher` |
| **Audit logs** | Unbounded growth; no partitioning | Add `pg_partman` on `created_at` monthly |
| **Redis memory** | Rate limit + Socket.IO adapter + queue share instance | Separate Redis DBs or instances per concern |

---