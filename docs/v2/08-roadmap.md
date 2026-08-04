# Inzira v2.0 — Roadmap

---

## Phase 0: Foundation (Weeks 1–2) — **IN PROGRESS**

| # | Item | Status | Notes |
|---|------|--------|-------|
| 0.1 | Auth Refresh Tokens (JWT + rotation) | ✅ DONE | 6/6 integration tests pass |
| 0.2 | Admin-only user creation (seeded global admin) | 🔄 PLANNED | See [#13](#13-admin-user-creation) |
| 0.3 | Password reset flow (email + token) | 📋 BACKLOG | Requires email provider |
| 0.4 | Input validation (Zod) on all mutating endpoints | 📋 BACKLOG | Critical for security |
| 0.5 | Root `docker-compose.yml` for local stack | 📋 BACKLOG | Postgres+PostGIS, Redis, Router, UI |

---

## Phase 1: Driver App Critical Path (Weeks 3–6)

**Goal**: Driver can receive assignment, navigate, track location, report status, work offline

| # | Item | Effort | Dependencies | Status |
|---|------|--------|--------------|--------|
| 1.1 | Driver app: Store + use refresh token | S | 0.1 | 🔲 |
| 1.2 | Driver app: Auto-refresh on 401 + retry request | S | 1.1 | 🔲 |
| 1.3 | Driver app: Foreground location → Socket.IO `driver:telemetry-push` | M | 1.1 | 🔲 |
| 1.4 | Driver app: Background location (expo-task-manager) → HTTP `/api/fleet/telemetry` | M | 1.1 | 🔲 |
| 1.5 | Driver app: Offline queue flush on reconnect + status sync | M | 1.4 | 🔲 |
| 1.6 | Push: FCM on order assign → driver receives notification | S | 0.1, 1.1 | 🔲 |
| 1.7 | Push: Notification tap → deep link to assignment screen | ✅ DONE | | ✅ |
| 1.8 | Driver app: Status transitions (ASSIGNED→PICKED_UP→IN_TRANSIT→ARRIVED→DELIVERED) | S | 1.1 | 🔲 |
| 1.9 | Driver app: Proof of delivery (photo + signature + GPS) | L | 1.8 | 🔲 |
| 1.10 | Geofence violation toast in driver app | S | 1.3 | 🔲 |

**Exit Criteria**: Driver can complete a delivery end-to-end offline-capable with push notifications.

---

## Phase 2: Dispatcher & Operations (Weeks 7–10)

**Goal**: Dispatcher efficiency, bulk ops, operational visibility

| # | Item | Effort | Dependencies | Status |
|---|------|--------|--------------|--------|
| 2.1 | Bulk order import (CSV) with validation + preview | M | 0.4 | 🔲 |
| 2.2 | Order cancel endpoint + reason codes + notification | S | 0.4 | 🔲 |
| 2.3 | Time-window constraints in VRP solver | L | — | 🔲 |
| 2.4 | Driver shift limits in VRP solver | M | 2.3 | 🔲 |
| 2.5 | Traffic-aware routing (OSRM / Valhalla integration) | L | 2.3 | 🔲 |
| 2.6 | Multi-depot support in VRP | M | 2.3 | 🔲 |
| 2.7 | Geofence import (GeoJSON/KML) + UI | M | — | 🔲 |
| 2.8 | Per-vehicle speed override in geofences | S | 2.7 | 🔲 |
| 2.9 | Incident acknowledgment workflow (dispatcher: seen/resolved) | S | — | 🔲 |
| 2.10 | Incident photo attachment (driver app camera) | M | 1.9 | 🔲 |
| 2.11 | Incident escalation rules (timeout → SMS/call) | M | 2.9 | 🔲 |
| 2.12 | In-app notification center (UI) | M | 1.6 | 🔲 |
| 2.13 | Fleet performance report UI (dwell time charts) | S | — | 🔲 |
| 2.14 | Historical heatmap visualization (UI) | M | — | 🔲 |
| 2.15 | Idle detection (engine on, GPS static > N min) | M | 1.4 | 🔲 |

---

## Phase 3: Platform Hardening (Weeks 11–14)

**Goal**: Production readiness, scaling, observability

| # | Item | Effort | Dependencies | Status |
|---|------|--------|--------------|--------|
| 3.1 | OpenAPI/Swagger spec generation + UI | S | 0.5 | 🔲 |
| 3.2 | Shared TypeScript types package (API contracts) | M | 3.1 | 🔲 |
| 3.3 | UI unit tests (Vitest + React Testing Library) | M | — | 🔲 |
| 3.4 | Driver app unit tests (Jest + React Native Testing Library) | M | — | 🔲 |
| 3.5 | E2E smoke test in CI (router + UI + driver) | M | 1.x | 🔲 |
| 3.6 | Router: Horizontal scaling docs (Redis adapter, sticky sessions) | S | — | 🔲 |
| 3.7 | Centralized logging (Pino → Loki/ELK) | M | — | 🔲 |
| 3.8 | Request tracing (X-Request-Id propagation) | S | — | 🔲 |
| 3.9 | DB migration rollback strategy (tested) | S | — | 🔲 |
| 3.10 | Seeded global admin migration | S | 0.2 | 🔲 |
| 3.11 | Session listing / revoke others (admin UI) | S | 0.2 | 🔲 |
| 3.12 | Rate limit tuning + Redis cluster config | S | — | 🔲 |
| 3.13 | Load/soak test (100+ simulated drivers) | M | 1.x | 🔲 |

---

## Phase 4: Advanced Features (Weeks 15–20)

| # | Item | Effort | Status |
|---|------|--------|--------|
| 4.1 | Multi-tenant isolation (org_id on all tables) | L | 🔲 |
| 4.2 | Role-based field-level permissions | M | 🔲 |
| 4.3 | Advanced VRP: pickup/delivery pairing, time windows, shift limits | L | 🔲 |
| 4.4 | Real-time collaboration (shared map, cursor presence) | M | 🔲 |
| 4.5 | Analytics dashboard (Grafana + Prometheus) | M | 🔲 |
| 4.6 | Driver app: Turn-by-turn navigation handoff (Google Maps/Apple Maps) | M | 🔲 |
| 4.7 | Customer portal (track order, ETA, proof of delivery) | L | 🔲 |
| 4.8 | Billing/invoicing integration | L | 🔲 |

---

## Phase 5: Polish & Scale (Ongoing)

| # | Item | Effort | Status |
|---|------|--------|--------|
| 5.1 | Dark/light theme toggle (Tailwind v4) | S | 🔲 |
| 5.2 | Accessibility audit (VoiceOver/TalkBack) | M | 🔲 |
| 5.3 | Internationalization (Kinyarwanda/English/French) | M | 🔲 |
| 5.4 | Data retention policy + partitioning (telemetry history) | M | 🔲 |
| 5.5 | Disaster recovery drill (PG backup/restore, Redis failover) | M | 🔲 |
| 5.6 | Security audit (OWASP Top 10, dependency scan) | M | 🔲 |

---

## Milestone Summary

| Milestone | Target Week | Key Deliverable |
|-----------|-------------|-----------------|
| M0: Auth Baseline | 2 | ✅ Refresh tokens working, tests pass |
| M1: Driver MVP | 6 | Driver app completes delivery offline-capable |
| M2: Dispatcher Ops | 10 | Bulk import, time-windows, incident workflow |
| M3: Production Ready | 14 | CI/CD, scaling docs, observability, load tested |
| M4: Advanced VRP | 18 | Time windows, shifts, traffic-aware |
| M5: Customer Portal | 20 | External tracking + POD |

---

## Resource Allocation (Suggested)

| Role | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|---------|
| Backend (Router) | 1.0 | 0.5 | 1.0 | 1.0 | 0.5 |
| Frontend (UI) | 0.5 | 0.5 | 1.0 | 0.5 | 1.0 |
| Mobile (Driver) | 0.5 | 1.0 | 0.5 | 0.5 | 0.5 |
| DevOps/QA | 0.25 | 0.25 | 0.5 | 1.0 | 0.5 |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Offline queue conflicts (concurrent edits) | Medium | High | Vector clocks / last-write-wins + server reconciliation |
| FCM token rotation not handled | Medium | High | Implement `onTokenRefresh` listener + re-register |
| OSRM rate limits / downtime | Medium | Medium | Cache matrix results, fallback to Haversine |
| PostGIS performance at scale (>100k telemetry/day) | Medium | High | Partition `driver_location_history` by month, BRIN index |
| Multi-tenancy schema change | Low | Very High | Plan org_id from start; use row-level security |
| Push notification reliability (Android Doze, iOS APNs) | High | Medium | FCM high-priority, background location fallback |

---

## Definition of Done (Per Item)

1. **Code complete** — Implementation matches spec
2. **Unit tests** — ≥80% coverage on new logic
3. **Integration test** — End-to-end verified in CI
4. **Documentation** — API spec updated, README updated
5. **Code review** — Approved by 1 other engineer
6. **Deployed to staging** — Verified in staging environment
7. **No critical/severe bugs** — Open issues ≤ P3

---

## Dependencies on External Decisions

| Decision | Impact | Needed By |
|----------|--------|-----------|
| Deployment target (K8s/ECS/VMs) | Docker/helm/compose structure | Phase 3 |
| Multi-tenancy requirement | Schema, auth, data isolation | Phase 4 |
| Map provider (OSM/Mapbox/Google) | Tile costs, SDK integration | Phase 1 |
| Push provider (FCM vs Expo vs OneSignal) | Driver app config | Phase 1 |
| Email provider (SendGrid/SES/etc) | Password reset, alerts | Phase 0 |
| Data retention policy | Partitioning, compliance | Phase 3 |

---

## Tracking

- **Project Board**: [GitHub Projects / Linear / Jira link]
- **Weekly Sync**: [Day/Time]
- **Demo Day**: End of each phase
- **Retrospective**: End of each phase