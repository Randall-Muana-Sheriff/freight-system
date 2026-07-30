# Kigali Freight v2.0 — Prioritized Backlog

---

## Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Blocks production / Critical path |
| **P1** | High value, near-term delivery |
| **P2** | Important, can defer |
| **P3** | Nice to have / Polish |
| **Tech Debt** | Internal quality, no direct user value |

| Size | Effort |
|------|--------|
| **XS** | < 4 hrs |
| **S** | 4–16 hrs |
| **M** | 16–40 hrs (1 week) |
| **L** | 40–80 hrs (2 weeks) |
| **XL** | > 80 hrs |

---

## P0 — Critical Path (Must Have for Driver MVP)

| ID | Title | Area | Size | Description |
|----|-------|------|------|-------------|
| B-001 | Driver app: Store & use refresh token | Driver | S | SecureStore: `refresh_token` + `access_token`; update AuthProvider |
| B-002 | Driver app: Auto-refresh on 401 + retry original request | Driver | S | Interceptor in `lib/api.ts` calls `/api/auth/refresh`, retries once |
| B-003 | Driver app: Foreground location → Socket.IO `driver:telemetry-push` | Driver | M | `watchPosition` in `useLocationTracking` → emit socket event |
| B-004 | Driver app: Background location → HTTP `/api/fleet/telemetry` | Driver | M | `startBackgroundLocationTracking()` in `locationTracking.ts` + TaskManager |
| B-005 | Driver app: Offline queue flush on reconnect (tested) | Driver | M | `offlineQueue.ts` flush on `AppState` active + NetInfo connected |
| B-006 | Push: FCM on order assign → driver receives notification | Router/Driver | S | `notificationService.sendPushToUser` called in `assignOrders`; driver registers token on login |
| B-007 | UI: Fix auth token field mismatch (`token` → `accessToken`/`refreshToken`) | UI | XS | `src/utils/api.js` + `SocketContext.jsx` |
| B-008 | UI: Geofence violation toast/notification | UI | S | `SocketContext` receives `geofence:violation` → toast component |
| B-009 | Router: Input validation (Zod) on all mutating endpoints | Router | M | All POST/PATCH/DELETE in controllers |
| B-010 | Router: Seeded global admin migration | Router | S | Migration creates admin user from env vars on first deploy |

---

## P1 — High Value (Next Sprint After MVP)

| ID | Title | Area | Size | Description |
|----|-------|------|------|-------------|
| B-011 | Order cancel endpoint + reason codes + notification | Router | S | `POST /api/orders/:id/cancel` with `reasonCode`, emits event |
| B-012 | Bulk order import (CSV) with validation + preview | Router/UI | M | CSV parse → validate → preview modal → confirm → bulk insert |
| B-013 | Admin-only user creation endpoint + UI | Router/UI | S | `POST /api/admin/users` (admin only) + `AdminUserManagement` create modal |
| B-014 | Session listing / revoke others (admin UI) | Router/UI | S | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` |
| B-015 | Password reset flow (email + token) | Router/UI | M | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| B-016 | VRP: Time-window constraints on stops | Router | L | Solver accepts `timeWindow: { earliest, latest }` per stop |
| B-017 | VRP: Driver shift limits | Router | M | Solver accepts `shift: { start, end }` per vehicle |
| B-018 | Incident acknowledgment workflow (dispatcher) | Router/UI | S | `PATCH /api/incidents/:id/acknowledge` + UI button |
| B-019 | Incident photo attachment (driver app) | Driver | M | Camera → upload → attach to incident |
| B-020 | In-app notification center (UI) | UI | M | `NotificationCenter` component + `/api/notifications/history` |
| B-021 | Geofence import (GeoJSON/KML) | Router/UI | M | `POST /api/geofences/import` + file upload in `GeofenceDrawer` |
| B-022 | Per-vehicle speed override in geofences | Router | S | `vehicle_speed_overrides` JSONB on geofence |
| B-023 | Fleet performance report UI (charts) | UI | S | Recharts/Chart.js on `/api/fleet/analytics/performance` |
| B-024 | Historical heatmap visualization | UI | M | Canvas/WebGL heatmap from `driver_location_history` |
| B-025 | Idle detection (engine on, GPS static) | Router | M | Telemetry analysis: speed=0, ignition=on → alert |

---

## P2 — Important (Can Defer)

| ID | Title | Area | Size | Description |
|----|-------|------|------|-------------|
| B-026 | Traffic-aware routing (OSRM/Valhalla) | Router | L | Replace Haversine with road network distances in VRP |
| B-027 | Multi-depot VRP support | Router | M | Multiple depots in solver input |
| B-028 | Incident escalation rules (timeout → SMS/call) | Router | M | Configurable escalation policies |
| B-029 | Driver app: Proof of delivery (photo + signature) | Driver | L | Camera + canvas signature + GPS stamp |
| B-030 | Driver app: Navigation handoff (Google Maps/Waze) | Driver | S | `Linking.openURL` with `daddr` |
| B-031 | Driver app: Geofence violation toast | Driver | S | Foreground service notification on violation |
| B-032 | UI: Dark/light theme toggle | UI | S | Tailwind v4 `darkMode: 'class'` + context |
| B-033 | UI: Error boundaries for map/components | UI | S | React error boundary wrapper |
| B-034 | Shared TypeScript types package (API contracts) | All | M | `freight-types` npm workspace package |
| B-035 | OpenAPI/Swagger spec + auto-generated client | Router/UI/Driver | M | `swagger-jsdoc` → `openapi.json` → TypeScript client |
| B-036 | Horizontal scaling docs (Redis adapter, sticky sessions) | Router | S | `docs/ops/scaling.md` |
| B-037 | Centralized logging (Pino → Loki/ELK) | Router | M | Structured JSON → Loki + Grafana |
| B-038 | Request tracing (X-Request-Id) | Router | S | Middleware generates + propagates |
| B-039 | DB migration rollback scripts (tested) | Router | M | `down.sql` for each migration |
| B-040 | Seeded global admin migration | Router | S | Migration checks env `ADMIN_USERNAME/PASSWORD` |
| B-041 | Rate limit tuning + Redis cluster config | Router | S | Production rate limit values |
| B-042 | Load/soak test (100+ simulated drivers) | Router | M | `ops/load-test.js` in CI |

---

## P3 — Nice to Have / Polish

| ID | Title | Area | Size | Description |
|----|-------|------|------|-------------|
| B-043 | Multi-tenant isolation (org_id) | All | XL | Row-level security, org-scoped APIs |
| B-044 | Role-based field-level permissions | Router | M | Serializer filters fields by role |
| B-045 | Advanced VRP: pickup/delivery pairing | Router | L | Coupled pickup/delivery stops |
| B-046 | Real-time collaboration (shared map, cursors) | UI | M | Yjs / Socket.IO presence |
| B-047 | Analytics dashboard (Grafana + Prometheus) | Ops | M | Pre-built dashboards |
| B-048 | Customer portal (track order, ETA, POD) | All | L | Separate React app, public API |
| B-049 | Billing/invoicing integration | Router | L | Stripe/Flutterwave integration |
| B-050 | Accessibility audit (VoiceOver/TalkBack) | Driver/UI | M | Labels, contrast, focus order |
| B-051 | Internationalization (Kinyarwanda/English/French) | All | M | `i18next` / `expo-localization` |
| B-052 | Data retention policy + partitioning | Router | M | Monthly partitions + cron purge |
| B-053 | Disaster recovery drill | Ops | M | PG backup/restore, Redis failover test |
| B-054 | Security audit (OWASP Top 10) | All | M | Dependency scan, SAST, pentest |

---

## Tech Debt

| ID | Title | Area | Size | Description |
|----|-------|------|------|-------------|
| TD-001 | Replace `geofence_alerts` reuse for incidents with dedicated `incidents` table | Router | M | Clean schema separation |
| TD-002 | Extract token rotation logic to `services/refreshTokenService.js` | Router | S | Single responsibility |
| TD-003 | Unify `notificationService.js` and `pushNotificationService.js` | Router | S | Remove duplicate |
| TD-004 | Add Zod schemas to all route handlers (currently ~10% coverage) | Router | M | `validationMiddleware` + schemas |
| TD-005 | Migrate UI from `localStorage` auth to `httpOnly` cookies or secure storage | UI | M | XS | Security |
| TD-006 | Add React Testing Library + Vitest to UI | UI | M | `npm init vitest`, component tests |
| TD-007 | Add Jest + React Native Testing Library to Driver | Driver | M | `npm init jest`, component tests |
| TD-008 | Add E2E test framework (Playwright/Cypress) | UI | M | Cross-app smoke tests |
| TD-009 | Root `docker-compose.yml` for local dev stack | All | S | Postgres+PostGIS, Redis, Router, UI |
| TD-010 | Add `google-services.json` to Driver EAS (gitignored) | Driver | XS | FCM config |
| TD-011 | Add CI workflow for Driver (lint + typecheck + test) | Driver | S | `.github/workflows/driver-ci.yml` |
| TD-012 | Add security audit (`npm audit`) to UI + Driver CI | UI/Driver | S | `npm audit --audit-level=high` |
| TD-013 | Fix legacy `token` field references in UI `api.js` and `SocketContext` | UI | XS | See B-007 |
| TD-014 | Add healthcheck to UI Dockerfile (nginx + backend proxy) | UI | XS | `wget` health endpoint |
| TD-015 | Document Socket.IO event contract (server ↔ clients) | All | S | `docs/v2/06-api-spec.md#websocket` |

---

## Completed (Reference)

| ID | Title | Completed |
|----|-------|-----------|
| ✅ B-000 | Auth refresh tokens (JWT + rotation) | 2026-07-17 |
| ✅ B-007* | UI auth token field mismatch | Part of B-007 |

---

## Backlog Grooming Notes

### Sprint Planning Guidelines
- **Max WIP**: 3 P0 items parallel per developer
- **Definition of Ready**: Spec linked, dependencies resolved, test plan outlined
- **Definition of Done**: See [08-roadmap.md Definition of Done](./08-roadmap.md#definition-of-done-per-item)

### Estimation Baseline
- Use planning poker with team
- Reference: B-001 (S) = 1 story point baseline

### Recurring Grooming
- **Weekly**: Review P0/P1, move ready items to sprint
- **Bi-weekly**: Re-estimate P2/P3, retire stale items
- **Monthly**: Tech debt sprint (20% capacity)

---

## Traceability

| Backlog Item | Spec Doc | MVP Checklist |
|--------------|----------|---------------|
| B-001 through B-006 | [06-api-spec.md](./06-api-spec.md#authentication) | Auth Refresh, Driver Telemetry, Push |
| B-007 | [06-api-spec.md](./06-api-spec.md#authentication) | Auth Refresh |
| B-008 | [06-api-spec.md](./06-api-spec.md#socketio-events) | Geofence Alert |
| B-009 | [07-module-specifications.md](./07-module-specifications.md#middleware-modules) | Input Validation |
| B-010 | [05-database-design.md](./05-database-design.md) | Admin Seeding |
| B-011 through B-015 | [03-requirements.md](./03-requirements.md) | Order Management, Admin |
| B-016 through B-017 | [04-architecture.md](./04-architecture.md#vrp-solver) | VRP Enhancements |
| B-018 through B-022 | [02-feature-inventory.md](./02-feature-inventory.md#incidents) | Incidents, Geofences |
| B-023 through B-025 | [02-feature-inventory.md](./02-feature-inventory.md#fleet-telemetry) | Analytics |
| B-026 through B-030 | [04-architecture.md](./04-architecture.md#vrp-solver) | Advanced VRP |
| B-031 through B-035 | [07-module-specifications.md](./07-module-specifications.md) | Platform Hardening |
| B-036 through B-042 | [08-roadmap.md](./08-roadmap.md#phase-3-platform-hardening) | Production Ready |
| B-043 through B-054 | [08-roadmap.md](./08-roadmap.md#phase-4-advanced-features) | Future Phases |

---

## Quick Filter Commands

```bash
# View P0 only
grep "^| B-00[0-9]" 09-backlog.md

# View by area
grep "Driver" 09-backlog.md
grep "Router" 09-backlog.md
grep "UI" 09-backlog.md

# View by size
grep "| S |" 09-backlog.md
grep "| M |" 09-backlog.md
grep "| L |" 09-backlog.md
```