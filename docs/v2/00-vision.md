# Kigali Freight v2.0 — Vision Document

---

## What Is Kigali Freight?

**Kigali Freight** is an end-to-end logistics and fleet management platform designed for the Kigali, Rwanda metropolitan area. It consists of three interconnected applications:

| Application | Technology | Purpose |
|-------------|------------|---------|
| **kigali-freight-router** | Node.js/Express + Socket.IO + PostgreSQL/PostGIS | Backend API, real-time telemetry engine, VRP solver, auth, admin |
| **kigali-freight-ui** | React 19 + Vite + Tailwind CSS v4 + Leaflet | Web dashboard for dispatchers, admins, and fleet managers |
| **kigali-freight-driver** | Expo 54 + React Native 0.81 + TypeScript + expo-router | Mobile app for drivers (assignments, navigation, incidents, offline) |

The system orchestrates **order creation → spatial pooling → driver assignment → real-time tracking → geofence monitoring → delivery confirmation → analytics**.

---

## Current Purpose (v1.x)

The current implementation (v1) is a **functional prototype** that demonstrates:
- JWT-based authentication with role-based access (admin, dispatcher, driver)
- Order management with PostGIS spatial queries (pickup/delivery geometry)
- Real-time driver telemetry via Socket.IO with durable queue persistence
- Geofence creation, speed-limit enforcement, and violation alerts (WebSocket + Telegram/webhook)
- Multi-stop Vehicle Routing Problem (VRP) solver with 2-opt optimization
- Admin panel for user/vehicle management and audit logging
- Driver mobile app with offline queue, background location, FCM push
- Prometheus metrics, health/readiness endpoints, structured logging

**Status**: API and web dashboard are feature-complete for core workflows. Driver app is ~60% complete (missing live telemetry push, proof-of-delivery, navigation handoff).

---

## Goals for v2.0

### 1. Production Hardening
- Eliminate all `any` types, strict TypeScript across all three apps
- Input validation (Zod) on every controller endpoint
- Refresh token rotation (already implemented in authController — needs client integration)
- Rate limiting with Redis (already in router — needs tuning)
- Comprehensive test coverage (unit, integration, E2E)

### 2. Architecture Unification
- **Shared TypeScript package** for API contracts (request/response types, enums, WebSocket events)
- **OpenAPI/Swagger spec** generated from source of truth
- Single source of truth for roles, statuses, error codes

### 3. Offline-First Driver Experience
- Background location tracking with expo-task-manager (functional but untested)
- Conflict-free offline queue with sync on reconnect (exists, needs hardening)
- Photo + signature proof-of-delivery capture
- Navigation handoff to Google Maps / Waze / OSMAnd

### 4. Observability & Operations
- Centralized logging (Pino → Loki/ELK)
- Distributed tracing (X-Request-Id propagation)
- Business KPI dashboards (orders/min, ETA accuracy, dwell time)
- Migration rollback procedures documented + tested

### 5. Multi-Tenancy Readiness
- Schema-per-tenant or row-level security for future multi-org deployments
- Configurable branding, webhook endpoints per tenant

### 6. Scalability
- Horizontal Socket.IO scaling via Redis adapter (already implemented)
- Read replicas for analytics queries
- Partitioned telemetry tables by time (PostgreSQL pg_partman)

---

## Non-Goals (Out of Scope for v2.0)

| Non-Goal | Reason |
|----------|--------|
| Customer-facing portal / merchant app | No UI built; merchant role removed in consolidation |
| AI/ML demand forecasting | Requires historical data volume not yet available |
| Multi-city expansion | PostGIS schema is Kigali-specific (hub coordinates hardcoded) |
| Custom map tiles (Mapbox/Google) | OSM/Leaflet sufficient for MVP; tiles add cost/complexity |
| Real-time chat between-driver payroll/payout integration | Requires financial compliance (Rwanda Revenue Authority) |
| Advanced warehouse management | Out of scope — this is last-mile dispatch |

---

## Success Criteria (v2.0 Definition of Done)

| Criterion | Target |
|-----------|--------|
| **TypeScript strict mode** | `tsc --noEmit` passes in all 3 apps |
| **Test coverage** | Router: ≥80% unit + 100% integration; UI: ≥70% unit; Driver: ≥60% unit |
| **E2E smoke test** | CI pipeline runs full stack (docker-compose) + Cypress/Detox flow |
| **API documentation** | OpenAPI 3.1 spec served at `/docs` + Postman collection |
| **Security audit** | `npm audit --audit-level=high` clean in all apps; no hardcoded secrets |
| **Offline driver flow** | Airplane mode → complete assignment → sync on reconnect works |
| **Load test** | 200 simulated drivers @ 5s interval for 10 min, <2% telemetry loss |
| **Deploy artifact** | Multi-stage Docker images for router/UI; EAS build profiles for driver |
| **Rollback** | Migration down scripts tested; DB restore <15 min RTO |