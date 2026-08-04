# Inzira v2.0 — Architectural Review & Rebuild Strategy

*Prepared as Senior Software Architect — July 2025*

---

## Executive Summary

The Inzira monorepo is a **logistics/fleet management system** with three interconnected applications. The codebase demonstrates solid domain knowledge (spatial queries, VRP, real-time telemetry) but suffers from **architectural drift, inconsistent patterns, and critical integration gaps**.

**Current Maturity:**
| App | Status | Readiness |
|-----|--------|-----------|
| Router (Backend) | ~70% feature-complete | **Staging-ready** with fixes |
| UI (Web Dashboard) | ~85% feature-complete | **Staging-ready** |
| Driver (Mobile) | ~35% feature-complete | **Prototype only** |

**Verdict:** Not production-ready. Requires 6-8 weeks of focused engineering to harden foundations, close integration loops, and establish CI/CD discipline.

---

## 1. Architectural Principles (Non-Negotiable)

If rebuilding from scratch, these principles would govern every decision:

| Principle | Rationale | Enforcement |
|-----------|-----------|-------------|
| **Contract-First Development** | 3 apps = 3 consumers of backend API | OpenAPI spec → generated clients → CI validation |
| **Single Source of Truth for Types** | Drift between TS (driver/UI) and JS (router) causes runtime bugs | Shared `freight-types` npm workspace package |
| **Offline-First by Default** | Driver app operates in spotty connectivity | All mutations queued locally → sync on reconnect |
| **Observability as a Feature** | Can't debug what you can't see | Structured logs, metrics, traces, SLOs from day 1 |
| **Database as the Source of Truth** | PostGIS is the superpower; don't hide it | Spatial logic in SQL, not application code |
| **Security by Default** | Fleet data = PII + operational Critical Infra | RBAC, rate limits, input validation, secret rotation |

---

## 2. Recommended Tech Stack (V2 Baseline)

| Layer | Current | Recommended | Why |
|-------|---------|-------------|-----|
| **Runtime** | Node 20 | Node 22 LTS | Performance, native fetch, test runner |
| **API Framework** | Express | **Fastify** or **Hono** | 2-3x throughput, built-in validation, TypeScript-first |
| **Language** | JS (router), TS (UI/driver) | **TypeScript everywhere** | Eliminate contract drift |
| **Validation** | Ad-hoc / partial | **Zod** (shared schemas) | Single source of truth for request/response |
| **ORM/Query Builder** | Raw `pg` pool | **Kysely** or **Drizzle** | Type-safe SQL, migration generation |
| **Real-time** | Socket.IO | **Socket.IO v4** (keep) + Redis adapter | Works, but document event contracts |
| **Auth** | Custom JWT + refresh | **Same pattern** but with JWKS rotation | Don't reinvent; harden current |
| **Database** | Postgres 16 + PostGIS | **Same** + **pg_partman** | Partition telemetry by month |
| **Queue** | In-memory + Redis list | **BullMQ** (Redis) | Retries, dead-letter, observability |
| **Frontend State** | React Context + custom hooks | **TanStack Query** + **Zustand** | Server/client state separation |
| **Mobile Navigation** | Expo Router | **Keep** | File-based, solid |
| **Testing** | Jest (router only) | **Vitest** (unit) + **Playwright** (E2E) + **Detox** (mobile) | Fast, modern, cross-platform |
| **CI/CD** | GitHub Actions (partial) | **Full matrix** + **Preview deployments** | Gate on types, tests, contracts |
| **Documentation** | Markdown in `/docs` | **OpenAPI + Storybook + ADRs** | Executable, not decorative |

---

## 3. Repository Structure (Monorepo with Workspaces)

```
freight/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Matrix: lint, typecheck, test, contract-check
│       ├── cd-staging.yml      # Auto-deploy main → staging
│       └── cd-production.yml   # Manual promote staging → prod
├── packages/
│   ├── freight-types/          # Shared Zod schemas + TS types (npm: @freight/types)
│   │   ├── schemas/
│   │   │   ├── auth.ts
│   │   │   ├── orders.ts
│   │   │   ├── telemetry.ts
│   │   │   └── ...
│   │   └── package.json
│   ├── freight-api-client/     # Generated from OpenAPI (npm: @freight/api-client)
│   │   ├── src/
│   │   └── package.json
│   └── freight-config/         # Shared ESLint, TSConfig, Prettier
│       ├── eslint.config.js
│       ├── tsconfig.base.json
│       └── package.json
├── apps/
│   ├── router/                 # Backend API (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # Route plugins (one per domain)
│   │   │   ├── services/       # Business logic (singletons)
│   │   │   ├── plugins/        # Fastify plugins (auth, metrics, etc.)
│   │   │   ├── db/             # Kysely + migrations
│   │   │   └── index.ts        # App factory
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── contracts/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── ui/                     # Web Dashboard (React + Vite + TanStack Query)
│   │   ├── src/
│   │   │   ├── features/       # Domain-driven folders
│   │   │   │   ├── auth/
│   │   │   │   ├── fleet/
│   │   │   │   ├── orders/
│   │   │   │   ├── routes/
│   │   │   │   ├── geofences/
│   │   │   │   └── admin/
│   │   │   ├── shared/         # Hooks, components, utils
│   │   │   └── app.tsx         # Routes + providers
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── driver/                 # Mobile App (Expo + React Native)
│       ├── app/                # Expo Router screens
│       │   ├── (auth)/
│       │   └── (app)/
│       ├── src/
│       │   ├── features/       # Mirrors UI features where possible
│       │   ├── shared/         # Hooks, components, utils
│       │   └── lib/            # Platform-specific (location, push, offline)
│       ├── tests/
│       ├── eas.json
│       └── package.json
├── docker-compose.yml          # Full local stack (Postgres+PostGIS, Redis, Router, UI)
├── turbo.json                  # Turborepo config for caching
├── package.json                # Root workspace
└── README.md
```

---

## 4. Domain Architecture (Backend)

### 4.1 Module Boundaries (Fastify Plugins)

```
src/
├── plugins/
│   ├── auth.ts              # JWT verification, role guards, refresh rotation
│   ├── rate-limit.ts        # Redis token bucket (configurable per route)
│   ├── metrics.ts           # Prometheus (auto-instrumented)
│   ├── cors.ts              # Origin allowlist
│   ├── request-id.ts        # X-Request-Id propagation
│   └── error-handler.ts     # Standardized error envelopes
├── routes/
│   ├── auth.ts              # POST /signup, /login, /refresh, /logout, /logout-all
│   ├── orders.ts            # CRUD + pooling + assign + status + history
│   ├── fleet.ts             # Telemetry ingest + live sheet + history + analytics
│   ├── routes.ts            # VRP optimize + save + commit + list
│   ├── geofences.ts         # CRUD + import (GeoJSON/KML)
│   ├── dispatch.ts          # OSRM matrix + driver ranking
│   ├── incidents.ts         # Report + acknowledge + escalate
│   ├── stops.ts             # Depot/stop CRUD
│   ├── vehicles.ts          # Fleet registry + assignment
│   ├── users.ts             # Admin: CRUD + roles + sessions
│   ├── notifications.ts     # FCM token registration
│   └── health.ts            # GET /health, /ready, /metrics
├── services/
│   ├── telemetry-queue.ts   # BullMQ job processor (ingest → persist → geofence check)
│   ├── vrp-solver.ts        # Pure TS: nearest-neighbor + 2-opt + capacity + time windows
│   ├── push-notifications.ts # FCM wrapper (send, retry, token hygiene)
│   ├── external-alerts.ts   # Telegram/webhook with deduplication + retry
│   ├── audit.ts             # Structured audit logging
│   └── socket.ts            # Socket.IO server (rooms, auth, events)
├── db/
│   ├── client.ts            # Kysely instance + pooled connections
│   ├── migrations/          # Numbered SQL files (generated by Kysely)
│   └── schema/              # Type-safe schema definitions
└── index.ts                 # createApp() factory for testing
```

### 4.2 Data Flow Contracts

**Telemetry Ingest (Critical Path):**
```
Driver App (HTTP/Socket) 
  → POST /api/fleet/telemetry (authenticated, rate-limited)
  → BullMQ job (async, idempotent)
  → Transaction:
      1. UPSERT driver_locations (current position)
      2. INSERT INTO driver_location_history (breadcrumb)
      3. PostGIS: ST_Contains(geofences.geom, point)
      4. IF violation → INSERT geofence_alerts + emit Socket + external alert
  → ACK to driver (200 OK)
```

**Order Assignment (Transactional):**
```
Dispatcher POST /api/orders/assign
  → SELECT FOR UPDATE orders WHERE id IN (...) AND status = 'PENDING'
  → UPDATE orders SET status='ASSIGNED', driver_id=... 
  → INSERT order_status_logs (PENDING→ASSIGNED)
  → INSERT audit_logs (ORDER_ASSIGNED)
  → Socket: emit order:dispatched to driver room
  → FCM: sendPushToUser(driver, {type: 'order_assigned'})
  → 200 OK
```

---

## 5. Database Design (PostGIS-First)

### 5.1 Core Tables (Normalized)

```sql
-- Users & Auth
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username CITEXT UNIQUE NOT NULL,
    email CITEXT UNIQUE,
    password_hash TEXT NOT NULL,        -- bcrypt cost 12
    roles TEXT[] NOT NULL DEFAULT '{driver}', -- RBAC via array
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,           -- SHA-256 hex
    user_agent TEXT,
    ip INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON refresh_tokens (user_id, revoked_at) WHERE revoked_at IS NULL;

-- Orders (Core Domain)
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    cargo_description TEXT NOT NULL,
    weight_kg NUMERIC(10,2) NOT NULL,
    status order_status NOT NULL DEFAULT 'PENDING',
    origin_hub_name TEXT NOT NULL,
    pickup_geom GEOGRAPHY(POINT, 4326) NOT NULL,
    delivery_geom GEOGRAPHY(POINT, 4326) NOT NULL,
    driver_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON orders USING GIST (pickup_geom);
CREATE INDEX ON orders USING GIST (delivery_geom);
CREATE INDEX ON orders (status, driver_id) WHERE status IN ('ASSIGNED','PICKED_UP','IN_TRANSIT','ARRIVED');

-- Telemetry (Partitioned by Month)
CREATE TABLE driver_location_history (
    id BIGSERIAL,
    driver_id BIGINT NOT NULL REFERENCES users(id),
    geom GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh NUMERIC(6,2),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);

-- Monthly partitions via pg_partman (auto-managed)

-- Current position (single row per driver)
CREATE TABLE driver_locations (
    driver_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    geom GEOGRAPHY(POINT, 4326) NOT NULL,
    speed_kmh NUMERIC(6,2),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON driver_locations USING GIST (geom);

-- Geofences
CREATE TABLE geofences (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    geom GEOGRAPHY(POLYGON, 4326) NOT NULL,
    speed_limit_kmh INT DEFAULT 60,
    vehicle_speed_overrides JSONB DEFAULT '{}', -- {"vehicle_id": speed}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON geofences USING GIST (geom);

-- VRP Routes
CREATE TABLE completed_routes (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id BIGINT REFERENCES vehicles(id),
    driver_id BIGINT REFERENCES users(id),
    geojson_path GEOGRAPHY(LINESTRING, 4326) NOT NULL,
    aggregate_distance_km NUMERIC(10,2) NOT NULL,
    total_demand INT NOT NULL,
    status route_status NOT NULL DEFAULT 'SNAPSHOT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit (Immutable)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    action_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON audit_logs (user_id, created_at DESC);
```

### 5.2 Migration Strategy

| Tool | Usage |
|------|-------|
| **Kysely Migration API** | Generate `.sql` from TypeScript schema changes |
| **pg_partman** | Auto-create monthly partitions for `driver_location_history` |
| **pg_cron** | Nightly partition maintenance + data retention (1yr hot, 5yr cold) |
| **CI Gate** | `kysely migrate` must pass on PR; no manual SQL in prod |

---

## 6. Authentication & Authorization (Hardened)

### 6.1 Token Design

| Token | TTL | Storage | Rotation |
|-------|-----|---------|----------|
| Access (JWT) | 15 min | Memory only (no localStorage) | Silent refresh via refresh token |
| Refresh | 30 days | HttpOnly Secure cookie (web) / SecureStore (mobile) | Single-use: rotate on every `/refresh` |
| Device ID | 1 year | Same as refresh | Bound to refresh token row |

### 6.2 Role Model (RBAC + ABAC)

```typescript
// Roles are additive arrays, not single enum
type Role = 'admin' | 'dispatcher' | 'driver' | 'viewer';

// Permission checks
const can = (user: User, action: Permission, resource?: Resource): boolean => {
    // Admin bypass
    if (user.roles.includes('admin')) return true;
    
    // Explicit grants
    const grants: Record<Role, Permission[]> = {
        admin: ['*'],
        dispatcher: ['order:*', 'route:*', 'fleet:read', 'geofence:*', 'user:read', 'vehicle:*'],
        driver: ['order:read:own', 'order:status:own', 'incident:create', 'telemetry:write:own'],
        viewer: ['fleet:read', 'order:read', 'route:read'],
    };
    
    // Resource ownership check (ABAC)
    if (resource && action.endsWith(':own')) {
        return grants[user.roles[0]]?.includes(action.replace(':own', '')) 
            && resource.ownerId === user.id;
    }
    
    return user.roles.some(r => grants[r]?.includes(action) || grants[r]?.includes('*'));
};
```

### 6.3 Public Signup Policy

- **Only `driver` role allowed** via public `POST /auth/signup`
- **Admin/Dispatcher creation** → `POST /api/users` (admin only, requires MFA)
- **Seeded global admin** → Migration reads `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` from env; creates on first deploy only

---

## 7. Real-time Architecture (Socket.IO)

### 7.1 Connection & Auth

```typescript
// Server: authenticate on connect
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.data.user = payload; // { userId, username, roles }
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

// Rooms: user:{userId}, driver:{username}, role:dispatcher
io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.userId}`);
    if (socket.data.user.roles.includes('driver')) {
        socket.join(`driver:${socket.data.user.username}`);
    }
    if (socket.data.user.roles.includes('dispatcher')) {
        socket.join('role:dispatcher');
    }
});
```

### 7.2 Event Contracts (Typed via shared package)

```typescript
// Server → Client
interface ServerEvents {
    'fleet:snapshot': DriverTelemetry[];
    'driver:location-update': DriverTelemetry;
    'geofence:violation': GeofenceViolationEvent;
    'geofence:exit': GeofenceExitEvent;
    'order:created': Order;
    'order:dispatched': { driverName: string; orders: Order[]; timestamp: string };
    'order:status-updated': { orderId: number; status: OrderStatus };
    'route:updated': CompletedRoute;
    'stop:updated': DeliveryStop | { id: number; deleted: true };
}

// Client → Server
interface ClientEvents {
    'driver:telemetry-push': { lat: number; lng: number; speedKmh?: number };
    'driver:status': { orderId: number; status: OrderStatus };
}
```

---

## 8. Offline-First Mobile Architecture

### 8.1 Mutation Queue (Driver App)

```typescript
// lib/offlineQueue.ts
interface QueuedMutation {
    id: string;                    // ULID
    type: 'order:status' | 'incident:create' | 'telemetry:batch';
    payload: unknown;
    createdAt: number;             // epoch ms
    retryCount: number;
    lastError?: string;
}

// Storage: MMKV (faster than AsyncStorage)
// Flush strategy: exponential backoff (1s, 2s, 4s, 8s, max 60s)
// Trigger: AppState foreground + NetInfo connected + queue not empty
```

### 8.2 Background Telemetry (Expo TaskManager)

```typescript
// Continues tracking when app is backgrounded/killed
// Posts to /api/fleet/telemetry via fetch (no Socket.IO in background)
// Battery: 15s interval, 25m distance filter, high accuracy
// Fallback: if no network, queue locally → flush on next wake
```

---

## 9. VRP Solver (Production-Grade)

### 9.1 Current State → Target

| Feature | Current | Target |
|---------|---------|--------|
| Algorithm | Nearest-neighbor + 2-opt | **HGS-CVRP** (Hybrid Genetic Search) or OR-Tools |
| Capacity | ✅ | ✅ |
| Time Windows | ❌ | ✅ (hard + soft with penalty) |
| Driver Shifts | ❌ | ✅ |
| Multi-Depot | ❌ | ✅ |
| Traffic-Aware | ❌ (Haversine) | **OSRM / Valhalla** matrix |
| Pickup-Delivery Pairs | ❌ | ✅ (PDPTW) |
| Objective | Distance only | **Configurable**: distance, time, fuel, balance |

### 9.2 Implementation Approach

```
Option A: OR-Tools (C++ via Node addon) — Best solver, heavier deploy
Option B: HGS-CVRP (Rust → WASM) — Fast, portable, good enough
Option C: jsprit (Java) via microservice — Mature, separate service

Recommendation: **Option B** — Compile HGS to WASM, call from Node worker thread.
- No native dependencies
- Sub-second solves for 100 stops
- Runs in Cloudflare Workers / Lambda / Fly.io
```

---

## 10. Testing Strategy (Mandatory Gates)

### 10.1 Pyramid (Enforced in CI)

```
                    ┌─────────────┐
                    │  E2E (3%)   │  5 critical journeys (Playwright + Detox)
                   ├─────────────┤
                  │ Integration  │  All mutating endpoints + critical reads (Vitest)
                 │  (22%)       │
                ├───────────────┤
               │   Unit (75%)  │  Pure functions, hooks, validators, services
              └─────────────────┘
```

### 10.2 Gates (PR cannot merge without)

| Gate | Tool | Threshold |
|------|------|-----------|
| TypeScript | `tsc --noEmit` | Zero errors |
| Lint | ESLint + Prettier | Zero warnings |
| Unit Tests | Vitest | ≥80% lines, ≥70% branches |
| Integration Tests | Vitest + Testcontainers | All endpoints |
| Contract Tests | `openapi-validator` | Spec matches implementation |
| E2E Smoke | Playwright (Web) + Detox (Mobile) | 5 journeys |
| Security Audit | `npm audit --audit-level=high` | Zero high/critical |
| Bundle Size | `vite-bundle-analyzer` | <500KB gzipped (UI) |

---

## 11. Observability Stack

### 10.1 Metrics (Prometheus + Grafana)

| Category | Key Metrics |
|----------|-------------|
| **HTTP** | `http_requests_total{method,path,status}`, `http_request_duration_seconds{quantile}` |
| **WebSocket** | `ws_connections_active`, `ws_messages_sent_total{event}`, `ws_room_members{room}` |
| **Telemetry Queue** | `telemetry_jobs_enqueued_total`, `telemetry_job_duration_seconds`, `telemetry_job_failed_total` |
| **Database** | `pg_connections_active`, `pg_query_duration_seconds`, `pg_partition_count` |
| **Business** | `orders_created_total`, `orders_completed_total`, `avg_delivery_time_minutes`, `geofence_violations_total` |
| **Auth** | `auth_login_total{result}`, `auth_refresh_total{result}`, `auth_rate_limited_total` |

### 10.2 Logging (Structured JSON → Loki)

```json
{
  "timestamp": "2025-07-19T10:23:45.123Z",
  "level": "info",
  "service": "router",
  "traceId": "abc123",
  "spanId": "def456",
  "message": "Order assigned",
  "context": {
    "orderId": 42,
    "driverId": 7,
    "orderCount": 3,
    "durationMs": 12
  }
}
```

### 10.3 Tracing (OpenTelemetry → Tempo/Jaeger)

- **Auto-instrument**: HTTP, DB, Redis, BullMQ
- **Manual spans**: VRP solve, geofence check, external alerts
- **Propagation**: `traceparent` header through Socket.IO, FCM, webhooks

### 10.4 SLOs (Service Level Objectives)

| Service | SLI | SLO | Alert |
|---------|-----|-----|-------|
| API | 99th percentile latency | <500ms | PagerDuty |
| API | Error rate (5xx) | <0.1% | PagerDuty |
| Telemetry Ingest | End-to-end latency | <2s | Slack |
| Push Delivery | FCM success rate | >99% | Slack |
| Socket.IO | Connection success | >99.9% | PagerDuty |

---

## 12. Deployment & Infrastructure

### 12.1 Target: Kubernetes (EKS/GKE) or Fly.io

```
┌─────────────────────────────────────────────────────┐
│                    Ingress (NGINX)                   │
│                  TLS Termination                     │
└───────────┬───────────────┬────────────────┬────────┘
            │               │                │
    ┌───────▼───────┐ ┌─────▼─────┐ ┌────────▼────────┐
    │   Router      │ │    UI     │ │  Socket.IO      │
    │  Deployment   │ │ Deployment│ │  Deployment     │
    │  (3+ replicas)│ │ (2+ rep)  │ │ (2+ rep, sticky)│
    └───────┬───────┘ └───────────┘ └────────┬────────┘
            │                                │
    ┌───────▼────────────────────────────────▼────────┐
    │              Redis Cluster (3 master)           │
    │         (Socket adapter, BullMQ, Rate limit)    │
    └─────────────────────────────────────────────────┘
            │
    ┌───────▼─────────────────────────────────────────┐
    │           Cloud SQL (Postgres + PostGIS)        │
    │              Primary + Read Replica             │
    │         pg_partman + pg_cron enabled            │
    └─────────────────────────────────────────────────┘
```

### 12.2 Environment Strategy

| Env | Purpose | Deploy Trigger |
|-----|---------|----------------|
| **Preview** | PR-specific (router + UI) | Every PR |
| **Staging** | Full stack integration | Merge to `main` |
| **Production** | Live traffic | Manual promote (tagged release) |

### 12.3 Secrets Management

- **Vault / AWS Secrets Manager / GCP Secret Manager**
- **Injected at pod startup** (not baked in images)
- **Rotation**: JWT keys every 90 days, DB passwords every 30 days

---

## 13. Immediate Action Plan (Next 8 Weeks)

### Week 1-2: Foundation Hardening
- [ ] Move to monorepo with Turborepo + workspaces
- [ ] Create `freight-types` package with Zod schemas for all API contracts
- [ ] Generate OpenAPI spec from route handlers → publish `@freight/api-client`
- [ ] Migrate router to Fastify + TypeScript + Kysely (parallel to Express)
- [ ] Add `docker-compose.yml` for full local stack
- [ ] CI: lint, typecheck, unit tests, contract validation on every PR

### Week 3-4: Auth & Integration Closure
- [ ] Harden refresh tokens: JWKS rotation, device binding, anomaly detection
- [ ] Seed global admin migration + admin-only user creation endpoint
- [ ] Driver app: store/use refresh token, auto-refresh on 401
- [ ] Driver app: foreground Socket.IO telemetry + background HTTP telemetry
- [ ] Driver app: offline queue flush on reconnect (tested)
- [ ] Push: FCM on order assign → driver notification (E2E verified)

### Week 5-6: Feature Completion
- [ ] Order cancel + reason codes
- [ ] Bulk CSV order import (dispatcher)
- [ ] Incident acknowledgment + photo attachment
- [ ] Geofence import (GeoJSON/KML) + per-vehicle speed overrides
- [ ] VRP: time windows + shift limits (HGS-WASM solver)
- [ ] UI: geofence violation toast, notification center, dark mode

### Week 7-8: Production Readiness
- [ ] Load test (1000 simulated drivers, 5min soak)
- [ ] Partition `driver_location_history` + retention policy
- [ ] Centralized logging (Pino → Loki) + Grafana dashboards
- [ ] OpenTelemetry tracing + SLO alerts
- [ ] Security pentest + dependency audit
- [ ] Disaster recovery drill (backup/restore, failover)
- [ ] Documentation: API reference, runbooks, ADRs

---

## 14. Technical Debt Register (Do Not Ignore)

| ID | Debt | Impact | Effort | Owner |
|----|------|--------|--------|-------|
| TD-001 | Raw SQL in controllers | SQL injection risk, untestable | 1w | Backend |
| TD-002 | `geofence_alerts` reused for incidents | Schema confusion, query complexity | 3d | Backend |
| TD-003 | No request ID propagation | Cannot trace cross-service calls | 2d | Backend |
| TD-004 | UI uses `localStorage` for tokens | XSS vulnerability | 3d | Frontend |
| TD-005 | Driver app no E2E tests | Regression risk on mobile | 1w | Mobile |
| TD-006 | Single Redis = SPOF for Socket.IO | Horizontal scaling broken | 2d | Infra |
| TD-007 | No DB migration rollback strategy | Cannot revert bad deploy | 2d | Backend |
| TD-008 | FCM token cleanup not automated | Stale tokens → failed pushes | 2d | Backend |
| TD-009 | Haversine distance in VRP | Inaccurate ETAs in city | 1w | Backend |
| TD-010 | No API versioning strategy | Breaking changes = downtime | 3d | All |

---

## 15. Team Structure (If Scaling)

| Squad | Ownership | Size |
|-------|-----------|------|
| **Platform** | Infra, CI/CD, observability, shared libs | 2-3 |
| **Backend (Router)** | API, domain logic, DB, real-time | 3-4 |
| **Frontend (UI)** | Dashboard, maps, admin panels | 2-3 |
| **Mobile (Driver)** | Offline-first, location, push, camera | 2-3 |
| **QA/Automation** | E2E frameworks, contract tests, load tests | 1-2 |

---

## 16. Decision Log (ADRs to Write)

| ADR | Title | Status |
|-----|-------|--------|
| 001 | Use PostGIS for all spatial queries | ✅ Implicit |
| 002 | JWT + refresh token rotation with revocation | ✅ Implemented |
| 003 | Monorepo with Turborepo + npm workspaces | **Proposed** |
| 004 | Contract-first: OpenAPI → generated clients | **Proposed** |
| 005 | Offline-first driver app with MMKV queue | **Proposed** |
| 006 | VRP solver: HGS-CVRP compiled to WASM | **Proposed** |
| 007 | Partitioned telemetry tables with pg_partman | **Proposed** |
| 008 | Role model: additive string arrays (RBAC+ABAC) | **Proposed** |
| 009 | Secrets: external vault, not env files | **Proposed** |
| 010 | Observability: OTel + Prometheus + Loki + Tempo | **Proposed** |

---

## 17. Closing Assessment

**The current codebase is a strong prototype with production-worthy domain logic** (spatial pooling, VRP, geofence detection, audit trails). The team clearly understands the problem space.

**The gaps are almost entirely architectural/operational:**
1. No contract enforcement between 3 apps
2. No CI/CD discipline (mobile untested, no E2E)
3. Observability is metrics-only (no logs, traces, SLOs)
4. Database schema evolved without migration tooling
5. Auth works but isn't hardened (rotation, device binding, anomaly detection)
6. Mobile is 65% missing (offline, background, POD, navigation)

**With 8 weeks of focused engineering on foundations** (not features), this becomes a **maintainable, scalable, production-grade platform**. The domain logic is the hard part — it's already there. The engineering hygiene is what's missing.

---

*End of Architectural Review*