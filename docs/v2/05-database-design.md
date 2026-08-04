# Inzira v2.0 — Database Design

---

## Entity Relationship Diagram (Logical)

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│    users    │       │     orders       │       │  fleet_vehicles │
├─────────────┤       ├──────────────────┤       ├─────────────────┤
│ id (PK)     │◄──────│ assigned_to (FK) │       │ id (PK)         │
│ username    │       │ origin_hub_id(FK)│       │ plate_number    │
│ password_hash│       │ pickup_geom      │       │ vehicle_type    │
│ role        │       │ delivery_geom    │       │ current_driver_id│──┐
│ created_at  │       │ status           │       │ status          │  │
└─────────────┘       │ weight_kg        │       │ created_at      │  │
                      │ cargo_description│       └────────┬────────┘  │
                      │ created_at       │                │           │
                      │ updated_at       │                │           │
                      └────────┬─────────┘                │           │
                               │                          │           │
              ┌────────────────┼────────────────┐         │           │
              ▼                ▼                ▼         │           │
┌────────────────────┐ ┌───────────────┐ ┌──────────────┐  │           │
│ order_status_logs  │ │ geofence_alerts│ │ completed_routes│          │
├────────────────────┤ ├───────────────┤ ├──────────────┤  │           │
│ id (PK)            │ │ id (PK)       │ │ id (PK)      │  │           │
│ order_id (FK)      │ │ order_id(FK)  │ │ vehicle_id   │──┘           │
│ previous_status    │ │ driver_name   │ │ driver_name  │              │
│ new_status         │ │ event_type    │ │ geojson_path │              │
│ changed_by         │ │ description   │ │ aggregate_distance_km│        │
│ changed_at         │ │ distance_meters│ │ total_demand │              │
└────────────────────┘ │ created_at    │ │ status       │              │
                       └───────┬───────┘ │ created_at   │              │
                               │         └──────────────┘              │
              ┌────────────────┼────────────────┐                     │
              ▼                ▼                ▼                     │
┌────────────────────┐ ┌───────────────┐ ┌─────────────────┐         │
│ driver_locations   │ │driver_loc_hist.│ │    geofences    │         │
├────────────────────┤ ├───────────────┤ ├─────────────────┤         │
│ driver_name (PK)   │ │ id (PK)       │ │ id (PK)         │         │
│ lat, lng           │ │ driver_name   │ │ name (unique)   │         │
│ geom (Point)       │ │ lat, lng      │ │ speed_limit_kmh │         │
│ updated_at         │ │ geom (Point)  │ │ geom (Polygon)  │         │
└────────────────────┘ │ recorded_at   │ └─────────────────┘         │
                       └───────────────┘                               │
                                                                      │
                               ┌────────────────┐                     │
                               │    hubs        │                     │
                               ├────────────────┤                     │
                               │ id (PK)        │                     │
                               │ name, code     │                     │
                               │ coordinates    │                     │
                               └────────────────┘                     │
                                                                    │
                               ┌────────────────┐                     │
                               │ delivery_stops │                     │
                               ├────────────────┤                     │
                               │ id (PK)        │                     │
                               │ name           │                     │
                               │ lat, lng       │                     │
                               │ demand         │                     │
                               │ status         │                     │
                               └────────────────┘                     │
                                                                    │
                               ┌────────────────┐                     │
                               │  push_tokens   │                     │
                               ├────────────────┤                     │
                               │ id (PK)        │                     │
                               │ username       │                     │
                               │ fcm_token (UQ) │                     │
                               │ platform       │                     │
                               └────────────────┘                     │
                                                                    │
                               ┌────────────────┐                     │
                               │refresh_tokens  │                     │
                               ├────────────────┤                     │
                               │ id (PK)        │                     │
                               │ user_id (FK)   │─────────────────────┘
                               │ token_hash     │
                               │ user_agent     │
                               │ ip_address     │
                               │ expires_at     │
                               │ revoked_at     │
                               │ created_at     │
                               └────────────────┘
```

---

## Table Definitions (Current Schema)

### `users`
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'dispatcher',  -- enum: admin, dispatcher, driver
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Note: add_users.sql originally had name, email columns but they're not used
```

### `refresh_tokens`
```sql
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,              -- bcrypt hash of raw token
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,         -- NOW() + 30 days
    revoked_at TIMESTAMP,                  -- NULL = active
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at)
WHERE revoked_at IS NULL;  -- Partial index for active tokens
```

### `hubs`
```sql
CREATE TABLE hubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    coordinates GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hubs_coordinates ON hubs USING GIST(coordinates);
-- Seeded: Nyabugogo (KGL-NYB), Kimironko (KGL-KMR), Gikondo (KGL-GKD)
```

### `orders`
```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    cargo_description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    weight_kg NUMERIC(10, 2) NOT NULL,
    origin_hub_id INT REFERENCES hubs(id) ON DELETE RESTRICT,
    pickup_coordinates GEOMETRY(Point, 4326) NOT NULL,
    delivery_coordinates GEOMETRY(Point, 4326) NOT NULL,
    -- Added by add_full_schema.sql:
    assigned_to VARCHAR(255),              -- driver username (not FK)
    origin_hub_name VARCHAR(255),
    pickup_lng DOUBLE PRECISION,
    pickup_lat DOUBLE PRECISION,
    delivery_lng DOUBLE PRECISION,
    delivery_lat DOUBLE PRECISION,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pickup_geom GEOMETRY(Point, 4326),
    delivery_geom GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_pickup ON orders USING GIST(pickup_coordinates);
CREATE INDEX idx_orders_delivery ON orders USING GIST(delivery_coordinates);
-- Functional indexes for geography casts:
-- CREATE INDEX idx_orders_pickup_geog ON orders USING GIST((pickup_geom::geography));
-- CREATE INDEX idx_orders_delivery_geog ON orders USING GIST((delivery_geom::geography));
```

### `order_status_logs`
```sql
CREATE TABLE order_status_logs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,              -- username or email
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_logs_order_id ON order_status_logs(order_id);
```

### `geofences`
```sql
CREATE TABLE geofences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    speed_limit_kmh INTEGER NOT NULL DEFAULT 60,
    geom GEOMETRY(Polygon, 4326) NOT NULL
    -- created_at not present (missing audit column)
);

CREATE INDEX idx_geofences_geom ON geofences USING GIST(geom);
```

### `geofence_alerts`
```sql
CREATE TABLE geofence_alerts (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    driver_name TEXT NOT NULL,
    event_type TEXT NOT NULL,              -- BOUNDARY_BREACH, SPEED_VIOLATION, ZONE_EXIT, MANUAL_INCIDENT, ARRIVED_AT_DESTINATION
    description TEXT NOT NULL,
    distance_meters NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geofence_alerts_order_id ON geofence_alerts(order_id);
CREATE INDEX idx_geofence_alerts_event_type ON geofence_alerts(event_type);
CREATE INDEX idx_geofence_alerts_driver_created ON geofence_alerts(driver_name, created_at DESC);
```

### `driver_locations` (current position — upsert)
```sql
CREATE TABLE driver_locations (
    id SERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL UNIQUE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_locations_geom ON driver_locations USING GIST(geom);
```

### `driver_location_history` (breadcrumbs — append-only)
```sql
CREATE TABLE driver_location_history (
    id SERIAL PRIMARY KEY,
    driver_name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_location_history_driver_time ON driver_location_history(driver_name, recorded_at DESC);
CREATE INDEX idx_driver_location_history_geom ON driver_location_history USING GIST(geom);
```

### `fleet_vehicles`
```sql
CREATE TABLE fleet_vehicles (
    id SERIAL PRIMARY KEY,
    plate_number TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    current_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK added by add_users.sql:
-- ALTER TABLE fleet_vehicles ADD CONSTRAINT fk_fleet_driver
--   FOREIGN KEY (current_driver_id) REFERENCES users(id) ON DELETE SET NULL;
```

### `completed_routes`
```sql
CREATE TABLE completed_routes (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL,
    driver_name TEXT NOT NULL,
    geojson_path JSONB NOT NULL DEFAULT '[]'::jsonb,  -- LineString geometry
    aggregate_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_demand INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMMITTED',         -- SNAPSHOT | COMMITTED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `delivery_stops`
```sql
CREATE TABLE delivery_stops (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    demand INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_stops_status ON delivery_stops(status);
```

### `push_tokens`
```sql
CREATE TABLE push_tokens (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    fcm_token TEXT NOT NULL UNIQUE,
    platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_username ON push_tokens(username);
```

### `system_audit_logs`
```sql
CREATE TABLE system_audit_logs (
    id SERIAL PRIMARY KEY,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_system_audit_logs_created_at ON system_audit_logs(created_at DESC);
```

---

## Migration History (Ordered)

| Order | File | Description | Destructive |
|-------|------|-------------|-------------|
| 1 | `init_spatial_baseline.sql` | PostGIS extension, `hubs`, `orders` (core) | No |
| 2 | `add_full_schema.sql` | Adds geometry cols, `completed_routes`, `order_status_logs`, `driver_locations`, `driver_location_history`, `geofence_alerts`, `fleet_vehicles`, `delivery_stops`, `system_audit_logs` | No |
| 3 | `add_geofence_speed_limit.sql` | Adds `speed_limit_kmh` to `geofences` | No |
| 4 | `add_users.sql` | Creates `user_role` enum, `users` table, FK on `fleet_vehicles` | No |
| 5 | `consolidate_roles.sql` | Updates `manager`/`merchant` → `dispatcher` | No |
| 6 | `add_refresh_tokens.sql` | Creates `refresh_tokens` table + indexes | No |
| 7 | `add_push_tokens.sql` | Creates `push_tokens` table + index | No |
| Legacy | `init_spatial.sql` | Old destructive baseline (skipped by default) | Yes (opt-in) |

---

## Index Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `hubs` | `idx_hubs_coordinates` | GIST | Spatial lookup by coordinate |
| `orders` | `idx_orders_pickup` | GIST | Find orders near pickup point |
| `orders` | `idx_orders_delivery` | GIST | Find orders near delivery point |
| `orders` | *(missing)* | GIST | `(pickup_geom::geography)` for `ST_DWithin` pooling |
| `orders` | *(missing)* | GIST | `(delivery_geom::geography)` for `ST_DWithin` pooling |
| `geofences` | `idx_geofences_geom` | GIST | `ST_Contains(geom, point)` on telemetry |
| `driver_locations` | `idx_driver_locations_geom` | GIST | KNN `<->` nearest driver queries |
| `driver_location_history` | `idx_driver_location_history_driver_time` | B-tree | Time-range breadcrumbs per driver |
| `driver_location_history` | `idx_driver_location_history_geom` | GIST | Spatial queries on history |
| `geofence_alerts` | `idx_geofence_alerts_order_id` | B-tree | Join to orders |
| `geofence_alerts` | `idx_geofence_alerts_event_type` | B-tree | Filter by violation type |
| `geofence_alerts` | `idx_geofence_alerts_driver_created` | B-tree | Driver timeline |
| `push_tokens` | `idx_push_tokens_username` | B-tree | Get tokens for user |
| `refresh_tokens` | `idx_refresh_tokens_user_id` | B-tree | Find tokens by user |
| `refresh_tokens` | `idx_refresh_tokens_expires_at` | B-tree | Cleanup expired |
| `refresh_tokens` | `idx_refresh_tokens_revoked_at` | Partial B-tree | Active tokens only |
| `system_audit_logs` | `idx_system_audit_logs_created_at` | B-tree | Recent logs pagination |
| `delivery_stops` | `idx_delivery_stops_status` | B-tree | List pending stops |

---

## Missing / Recommended Indexes

```sql
-- For pooling query (ST_DWithin on geography cast)
CREATE INDEX idx_orders_pickup_geog ON orders USING GIST((pickup_geom::geography));
CREATE INDEX idx_orders_delivery_geog ON orders USING GIST((delivery_geom::geography));

-- For telemetry-sheet spatial join (orders ↔ driver_locations)
-- Already covered by idx_driver_locations_geom + orders pickup geom

-- For fleet performance query (geofence_alerts join orders)
CREATE INDEX idx_geofence_alerts_order_created ON geofence_alerts(order_id, created_at);

-- For token cleanup cron
CREATE INDEX idx_refresh_tokens_cleanup ON refresh_tokens(revoked_at, expires_at)
WHERE revoked_at IS NOT NULL OR expires_at < NOW();
```

---

## Data Retention & Partitioning (Future)

| Table | Growth Rate | Retention Policy | Partitioning Strategy |
|-------|-------------|------------------|----------------------|
| `driver_location_history` | ~1 row/driver/15s = ~5.7M/day @ 100 drivers | 90 days | `pg_partman` monthly on `recorded_at` |
| `geofence_alerts` | ~10-100/day | 1 year | Monthly on `created_at` |
| `system_audit_logs` | ~100-1000/day | 2 years | Monthly on `created_at` |
| `order_status_logs` | ~5-10/order | 1 year | Monthly on `changed_at` |
| `refresh_tokens` | ~1/login | 30 days (TTL) | Self-cleaning via `expires_at` + cron |
| `completed_routes` | ~10-50/day | 2 years | Monthly on `created_at` |

---

## Constraints & Business Rules (Enforced in DB)

| Constraint | Table | Enforcement |
|------------|-------|-------------|
| `role ∈ {admin,dispatcher,driver}` | `users` | `user_role` enum |
| `status ∈ {PENDING,ASSIGNED,PICKED_UP,IN_TRANSIT,ARRIVED,DELIVERED,CANCELLED}` | `orders` | Application-level (no CHECK constraint) |
| `speed_limit_kmh ≥ 0` | `geofences` | Application-level |
| `driver_name` unique current location | `driver_locations` | `UNIQUE` constraint |
| `fcm_token` globally unique | `push_tokens` | `UNIQUE` constraint |
| `refresh_token` expires_at > NOW() for valid | `refresh_tokens` | Application query filter |
| `order_id` cascade delete → logs/alerts | `order_status_logs`, `geofence_alerts` | `ON DELETE CASCADE/SET NULL` |
| `current_driver_id` SET NULL on user delete | `fleet_vehicles` | `ON DELETE SET NULL` |

---

## Known Schema Issues

| Issue | Table(s) | Impact | Fix |
|-------|----------|--------|-----|
| `orders.assigned_to` is `VARCHAR` not FK to `users` | `orders` | No referential integrity; orphaned assignments possible | Add FK or trigger validation |
| `geofences` missing `created_at` | `geofences` | No audit trail for geofence creation | Add column + backfill |
| `orders` has duplicate geometry columns (`pickup_coordinates` + `pickup_geom`) | `orders` | Confusion; `pickup_geom` is authoritative | Deprecate `pickup_coordinates` |
| `user_role` enum created in `add_users.sql` but `init_spatial.sql` doesn't have it | Migration order | Fresh DB fails if `init_spatial.sql` runs first | Guard with `DO $$` block |
| `refresh_tokens` no FK to `users` with `ON DELETE CASCADE` | `refresh_tokens` | Has it — correct | — |
| No `updated_at` trigger on `geofences` | `geofences` | Manual update needed | Add trigger |
| `push_tokens` no TTL/cleanup for inactive users | `push_tokens` | Stale tokens accumulate | Cron job |

---

## Query Patterns & Optimization Notes

### 1. Live Fleet Status (`GET /api/fleet/telemetry-sheet`)
```sql
-- Current: spatial join orders → driver_locations (active orders only)
-- Optimize: materialized view refreshed every 30s, or
--           separate `active_driver_locations` table with only non-stale entries
SELECT o.id, o.cargo_description, o.assigned_to,
       dl.lat, dl.lng,
       ST_DistanceSphere(dl.geom, o.delivery_geom) AS distance_meters,
       EXTRACT(EPOCH FROM (NOW() - dl.updated_at)) AS telemetry_age_seconds
FROM orders o
JOIN driver_locations dl ON o.assigned_to = dl.driver_name
WHERE o.status = 'ASSIGNED';
```

### 2. Pooling (`GET /api/orders/pooling`)
```sql
-- Current: ST_DWithin on geography cast (no functional index)
-- Add indexes on (pickup_geom::geography) and (delivery_geom::geography)
```

### 3. Nearest Drivers (`GET /api/orders/:id/nearest-drivers`)
```sql
-- Uses KNN operator <-> on driver_locations.geom
-- Very fast with GIST index; returns in <10ms
```

### 4. Breadcrumbs (`GET /api/fleet/history/:driverName`)
```sql
-- Uses ST_MakeLine + ST_Simplify (RDP) in CTE
-- Tolerance 0.0001° ≈ 11m at Kigali latitude
-- Runs in ~200ms for 4h of data
```

### 5. Fleet Performance (`GET /api/fleet/analytics/performance`)
```sql
-- Joins orders → geofence_alerts on order_id + event_type='ARRIVED_AT_DESTINATION'
-- Add index on geofence_alerts(order_id, event_type, created_at)
```

---

## Redis Keys (Shared State)

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `kigali:telemetry:queue` | List | None (consumed) | Durable telemetry ingestion queue |
| `kigali:fleet:live-state` | Hash | None | Current driver state `{driverName: {lat,lng,velocityKmh,lastSeen}}` |
| `kigali:fleet:driver-breaches` | Hash | None | Active geofence violations `{driverName: {zoneName, type, description}}` |
| `ratelimit:<prefix>:<ip>` | String | `windowMs` | Rate limit counters (auth, global) |

---

## Backup & Recovery (Not Yet Implemented)

### Required Scripts
```bash
# Daily logical backup (schema + data)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_DATABASE \
  --no-owner --no-privileges --format=custom \
  > /backups/kigali_freight_$(date +%F).dump

# Point-in-time recovery (WAL archiving)
# Configure: archive_mode=on, archive_command='cp %p /wal_archive/%f'
```

### Recovery Time Objectives
| Scenario | RTO | RPO |
|----------|-----|-----|
| Single table corruption | <15 min | 0 (logical backup) |
| Full DB loss | <1 hour | 24h (daily dump) |
| Point-in-time | <30 min | <5 min (WAL archive) |

---

## Naming Conventions

| Object | Convention | Example |
|--------|------------|---------|
| Tables | snake_case, plural | `driver_locations` |
| Columns | snake_case | `driver_name`, `updated_at` |
| Primary Keys | `id` (SERIAL) | `id` |
| Foreign Keys | `<table>_id` | `origin_hub_id`, `current_driver_id` |
| Indexes | `idx_<table>_<column(s)>` | `idx_driver_locations_geom` |
| Partial Indexes | `idx_<table>_<column>_<condition>` | `idx_refresh_tokens_revoked_at` |
| Enums | singular, snake_case | `user_role` |
| Redis Keys | `kigali:<domain>:<entity>` | `kigali:fleet:live-state` |
| Socket Events | `domain:action` | `driver:location-update`, `geofence:violation` |

---