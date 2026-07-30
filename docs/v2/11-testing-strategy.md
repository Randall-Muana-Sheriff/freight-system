# Kigali Freight v2.0 — Testing Strategy

---

## Test Pyramid

```
         ┌─────────────┐
         │   E2E (5%)  │  Cross-app critical paths
        ├─────────────┤
       │  Integration  │  API contracts, DB, Socket.IO, external services
      │  (25%)        │
     ├───────────────┤
    │    Unit (70%)   │  Pure functions, hooks, utils, validators
   └─────────────────┘
```

**Target Coverage**:
- Unit: ≥80% lines on new code
- Integration: All mutating endpoints + critical read paths
- E2E: 5 core user journeys

---

## 1. Unit Testing

### Backend (Router) — Jest

**Location**: `tests/unit/`

**Targets**:
- `services/vrpOptimizer.js` — algorithm correctness
- `services/telemetryQueue.js` — batch logic, geofence detection
- `services/notificationService.js` — FCM payload construction
- `middleware/authMiddleware.js` — token parsing, role checks
- `middleware/rateLimit.js` — bucket logic
- `utils/*.js` — formatters, calculators, validators

**Configuration** (`jest.config.js`):
```javascript
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/unit/**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: { lines: 80, branches: 70, functions: 80 }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.js']
};
```

**Example** (`tests/unit/vrpOptimizer.test.js`):
```javascript
import { solve } from '../../services/vrpOptimizer.js';

describe('vrpOptimizer.solve', () => {
  const depot = { id: 'depot', lat: -1.95, lng: 30.06 };
  const vehicles = [{ id: 1, capacity: 100 }];
  const stops = [
    { id: 's1', lat: -1.94, lng: 30.07, demand: 30 },
    { id: 's2', lat: -1.93, lng: 30.08, demand: 40 }
  ];

  test('assigns stops within capacity', () => {
    const result = solve({ depot, vehicles, stops, vehicleCapacity: 100 });
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].totalLoad).toBeLessThanOrEqual(100);
  });

  test('splits across vehicles when over capacity', () => {
    const result = solve({ depot, vehicles: [{ id: 1, capacity: 50 }], stops, vehicleCapacity: 50 });
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
  });

  test('returns empty routes for no stops', () => {
    const result = solve({ depot, vehicles, stops: [], vehicleCapacity: 100 });
    expect(result.routes).toEqual([]);
  });
});
```

### Frontend (UI) — Vitest + React Testing Library

**Location**: `src/components/__tests__/`, `src/hooks/__tests__/`, `src/utils/__tests__/`

**Targets**:
- Pure components: `MetricCard`, `AssignmentCard`, `IncidentForm`
- Custom hooks: `useRoutes`, `useDebounce`, `useAuth`
- Utilities: `format.ts`, `api.js` (with MSW mocking)
- Context providers: `SocketContext` (with mock socket)

**Configuration** (`vitest.config.ts`):
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      thresholds: { lines: 70, branches: 60, functions: 70 }
    }
  }
});
```

**Example** (`src/components/__tests__/MetricCard.test.tsx`):
```tsx
import { render, screen } from '@testing-library/react';
import { MetricCard } from '../MetricCard';

describe('MetricCard', () => {
  test('renders label, value, unit', () => {
    render(<MetricCard label="Active Drivers" value={12} unit="online" />);
    expect(screen.getByText('Active Drivers')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  test('applies warning variant class', () => {
    render(<MetricCard label="Stale" value={3} variant="warning" />);
    expect(screen.getByText('Stale').closest('div')).toHaveClass('border-yellow-500');
  });
});
```

### Mobile (Driver) — Jest + React Native Testing Library

**Location**: `app/**/__tests__/`, `lib/__tests__/`, `components/__tests__/`

**Targets**:
- `lib/auth.tsx` — token storage, login/logout flow
- `lib/api.ts` — request/response interceptors
- `lib/offlineQueue.ts` — enqueue, flush, persistence
- `lib/pushNotifications.ts` — token registration, handlers
- Screens: `assignments`, `trip/[id]`, `incidents`
- Components: `AssignmentCard`, `IncidentForm`, `MetricCard`

**Configuration** (`jest.config.js`):
```javascript
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^lib/(.*)$': '<rootDir>/lib/$1'
  },
  coverageThreshold: { global: { lines: 60, branches: 50, functions: 60 } }
};
```

**Example** (`lib/__tests__/offlineQueue.test.ts`):
```typescript
import { offlineQueue } from '../offlineQueue';
import * as AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage');

describe('offlineQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  test('enqueues and persists', async () => {
    await offlineQueue.enqueue('status_update', { orderId: 1, status: 'PICKED_UP' });
    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('status_update');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@offline_queue',
      expect.stringContaining('status_update')
    );
  });

  test('flushQueue calls API for each item', async () => {
    const mockApi = jest.fn().mockResolvedValue({ success: true });
    jest.mock('../api', () => ({ api: { patch: mockApi } }));

    await offlineQueue.enqueue('status_update', { orderId: 1, status: 'DELIVERED' });
    await offlineQueue.flushQueue();

    expect(mockApi).toHaveBeenCalledWith('/api/orders/1/status', { status: 'DELIVERED' });
    const queue = await offlineQueue.getQueue();
    expect(queue).toHaveLength(0);
  });
});
```

---

## 2. Integration Testing

### Backend — Jest + Supertest + Testcontainers

**Location**: `tests/integration.test.js` (existing)

**Infrastructure**:
```yaml
# .github/workflows/router-ci.yml
services:
  postgres:
    image: postgis/postgis:16-3.4
    env: { POSTGRES_DB: kigali_freight_test, POSTGRES_PASSWORD: test }
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

**Test Database Setup** (`tests/setup/integration.js`):
```javascript
import pg from 'pg';
import { migrate } from '../bin/migrate.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await migrate(); // Runs all migrations on test DB
});

afterAll(async () => {
  await pool.end();
});

// Helper: clean tables between tests
export async function cleanDatabase() {
  await pool.query(`
    TRUNCATE orders, order_status_logs, driver_locations, driver_location_history,
           geofences, geofence_alerts, completed_routes, refresh_tokens, users,
           vehicles, delivery_stops, push_tokens, audit_logs
    RESTART IDENTITY CASCADE;
  `);
}
```

**Test Structure** (per feature):
```javascript
describe('Orders API', () => {
  let agent;
  let dispatcherToken;
  let driverToken;

  beforeAll(async () => {
    agent = request.agent(app);
    // Create users via API
    await agent.post('/api/auth/signup').send({ username: 'disp1', password: 'pass123' }); // role=driver
    // Manually promote to dispatcher in DB
    await pool.query("UPDATE users SET role='dispatcher' WHERE username='disp1'");
    dispatcherToken = (await agent.post('/api/auth/login').send({ username: 'disp1', password: 'pass123' })).body.data.accessToken;

    await agent.post('/api/auth/signup').send({ username: 'drv1', password: 'pass123' });
    driverToken = (await agent.post('/api/auth/login').send({ username: 'drv1', password: 'pass123' })).body.data.accessToken;
  });

  beforeEach(cleanDatabase);

  describe('POST /api/orders', () => {
    test('dispatcher can create order', async () => {
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ cargo_description: 'Test', weight_kg: 100, origin_hub_name: 'HQ', pickup_lng: 30.06, pickup_lat: -1.95, delivery_lng: 30.1, delivery_lat: -2.0 });
      expect(res.status).toBe(201);
      expect(res.body.data.order.status).toBe('PENDING');
    });

    test('driver cannot create order', async () => {
      const res = await agent.post('/api/orders')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ ... });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/orders/assign', () => {
    test('assigns orders to driver atomically', async () => {
      // Create orders
      const o1 = await createOrder(agent, dispatcherToken, { ... });
      const o2 = await createOrder(agent, dispatcherToken, { ... });

      const res = await agent.post('/api/orders/assign')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ orderIds: [o1.id, o2.id], driverName: 'drv1' });

      expect(res.status).toBe(200);
      expect(res.body.data.dispatchedCount).toBe(2);

      // Verify status transition logged
      const history = await agent.get(`/api/orders/${o1.id}/history`).set('Authorization', `Bearer ${dispatcherToken}`);
      expect(history.body.data).toContainEqual(expect.objectContaining({ new_status: 'ASSIGNED' }));
    });
  });
});
```

**Coverage Targets**:
- All mutating endpoints (POST/PATCH/DELETE)
- Role-based access control (403 on wrong role)
- Validation errors (400 on bad payload)
- Business logic: assignment atomicity, status transitions, spatial queries
- Socket.IO event emission (using `socket.io-client` in tests)

### Frontend — MSW (Mock Service Worker)

**Setup** (`src/tests/msw/`):
```typescript
// handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/auth/login', () => HttpResponse.json({
    success: true,
    data: { accessToken: 'test-access', refreshToken: 'test-refresh', role: 'dispatcher' }
  })),
  http.get('/api/orders/active', () => HttpResponse.json({
    success: true,
    data: [{ id: 1, cargo_description: 'Test', status: 'PENDING', ... }]
  })),
  // ...
];

// browser.ts
import { setupWorker } from 'msw/browser';
export const worker = setupWorker(...handlers);
```

**Usage in Tests**:
```tsx
// src/components/__tests__/OrderList.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { worker } from '../../tests/msw/browser';
import OrderList from '../OrderList';

beforeAll(() => worker.start());
afterEach(() => worker.resetHandlers());
afterAll(() => worker.stop());

test('loads and displays orders', async () => {
  render(<OrderList />);
  await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument());
});
```

---

## 3. End-to-End Testing

### Framework: Playwright

**Location**: `tests/e2e/`

**Critical Journeys** (5 scenarios):

| # | Journey | Description |
|---|---------|-------------|
| E2E-01 | Dispatcher creates order → assigns to driver → driver completes | Full order lifecycle |
| E2E-02 | Driver receives push on assign → taps → navigates to assignment | Push + deep link |
| E2E-03 | Driver enters geofence → violation detected → UI shows alert | Geofence real-time |
| E2E-04 | Driver goes offline → updates status → reconnects → syncs | Offline queue |
| E2E-05 | Admin creates dispatcher → dispatcher logs in → manages fleet | Auth hierarchy |

**Configuration** (`playwright.config.ts`):
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173', // UI dev server
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:3000/health', timeout: 30000, cwd: '../kigali-freight-router' },
    { command: 'npm run dev', url: 'http://localhost:5173', timeout: 30000, cwd: '../kigali-freight-ui' },
    // Driver app runs on Expo — use separate E2E with Appium or Detox
  ],
});
```

**Example** (`tests/e2e/order-lifecycle.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';

test('E2E-01: Full order lifecycle', async ({ page }) => {
  // 1. Login as dispatcher
  await page.goto('/login');
  await page.fill('input[name="username"]', 'dispatcher');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');

  // 2. Create order
  await page.click('text=Create Order');
  await page.fill('input[name="cargo_description"]', 'E2E Test Cargo');
  await page.fill('input[name="weight_kg"]', '500');
  await page.fill('input[name="origin_hub_name"]', 'Kigali Hub');
  // Click map for pickup/delivery...
  await page.click('button:has-text("Submit")');
  await expect(page.locator('text=E2E Test Cargo')).toBeVisible();

  // 3. Assign to driver
  await page.click('text=Assign');
  await page.fill('input[name="driverName"]', 'test_driver');
  await page.click('button:has-text("Assign")');
  await expect(page.locator('text=Assigned to test_driver')).toBeVisible();

  // 4. Verify driver sees assignment (separate browser context)
  const driverPage = await page.context().newPage();
  await driverPage.goto('http://localhost:8081'); // Expo web or use Appium
  // ... driver completes steps
});
```

### Mobile E2E: Detox (for React Native)

**Configuration** (`.detoxrc.json`):
```json
{
  "testRunner": "jest",
  "specs": "tests/e2e/detox/**/*.test.ts",
  "devices": {
    "ios.simulator": {
      "type": "ios.simulator",
      "device": { "type": "iPhone 15" }
    },
    "android.emulator": {
      "type": "android.emulator",
      "avdName": "pixel_7_api_34"
    }
  },
  "apps": {
    "ios.debug": { "type": "ios.app", "path": "build/ios/Debug.app" },
    "android.debug": { "type": "android.apk", "path": "android/app/build/outputs/apk/debug/app-debug.apk" }
  }
}
```

**Example** (`tests/e2e/detox/offline-sync.test.ts`):
```typescript
import { device, element, by, expect } from 'detox';

describe('Offline Sync', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true, newInstance: true });
  });

  it('queues status update offline and flushes on reconnect', async () => {
    await device.disableNetworkSync();
    await element(by.id('assignment-item')).tap();
    await element(by.id('status-picked_up')).tap();
    await element(by.id('confirm-status')).tap();
    await expect(element(by.text('Pending sync'))).toBeVisible();

    await device.enableNetworkSync();
    await device.sendToHome();
    await device.launchApp({ newInstance: false });
    await expect(element(by.text('Pending sync'))).not.toBeVisible();
  });
});
```

---

## 4. Contract Testing

### API Contract (OpenAPI)

**Generated from**: Route handlers + Zod schemas

**Tool**: `swagger-jsdoc` + `swagger-ui-express`

**CI Gate**:
```bash
# Generate spec
npx swagger-jsdoc -d swaggerDef.js -o docs/openapi.json

# Validate against schema
npx @redocly/cli lint docs/openapi.json

# Compare with previous (breaking change detection)
npx @apidevtools/swagger-diff@latest docs/openapi.prev.json docs/openapi.json
```

### Socket.IO Event Contract

**Documentation**: `docs/api/socket-events.md` (auto-generated from `socketService.js`)

**Test**: Integration tests verify event payloads match expected TypeScript interfaces.

---

## 5. Performance & Load Testing

### Router Load Test (`ops/load-test.js`)

**Scenarios**:
- 100 concurrent drivers sending telemetry every 5s
- 50 dispatchers creating/assigning orders
- 10k geofence checks/sec

**Metrics Collected**:
- HTTP latency (p50, p95, p99)
- Socket.IO event throughput
- DB connection pool usage
- Telemetry queue lag
- Memory/CPU

**CI Gate**:
```bash
# Run for 5 min
LOAD_TEST_TOKEN=<token> npm run load:test -- --duration=300s --drivers=100

# Assert p95 < 200ms, error rate < 0.1%
```

### Database Performance

**Queries to Monitor**:
- `driver_locations` upsert (telemetry ingest)
- `driver_location_history` insert (breadcrumbs)
- KNN nearest driver (`<->` operator)
- Geofence `ST_Contains` check
- VRP solver execution time

**Tools**:
- `pg_stat_statements` + `pgBadger`
- `EXPLAIN ANALYZE` in integration tests for spatial queries

---

## 6. Test Data Management

### Factories (Backend)

```javascript
// tests/factories.js
import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';

export async function createUser(overrides = {}) {
  const passwordHash = await bcrypt.hash('password123', 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *`,
    [overrides.username || `user_${Date.now()}`, passwordHash, overrides.role || 'driver']
  );
  return rows[0];
}

export async function createOrder(overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO orders (cargo_description, weight_kg, status, origin_hub_name, pickup, delivery)
     VALUES ($1, $2, $3, $4, ST_MakePoint($5, $6)::geography, ST_MakePoint($7, $8)::geography)
     RETURNING *`,
    [
      overrides.cargo || 'Test Cargo',
      overrides.weight || 100,
      overrides.status || 'PENDING',
      overrides.hub || 'Hub A',
      overrides.pickupLng || 30.06,
      overrides.pickupLat || -1.95,
      overrides.deliveryLng || 30.10,
      overrides.deliveryLat || -2.00
    ]
  );
  return rows[0];
}

export async function loginAs(agent, username, password = 'password123') {
  const res = await agent.post('/api/auth/login').send({ username, password });
  return res.body.data.accessToken;
}
```

### Fixtures (Frontend)

```typescript
// src/tests/fixtures/orders.ts
export const mockOrders = [
  { id: 1, cargo_description: 'Cement', status: 'PENDING', weight_kg: 5000, origin_hub_name: 'North Hub', pickup_lng: 30.05, pickup_lat: -1.94, delivery_lng: 30.12, delivery_lat: -2.01 },
  { id: 2, cargo_description: 'Steel', status: 'ASSIGNED', weight_kg: 3000, origin_hub_name: 'South Hub', pickup_lng: 30.08, pickup_lat: -1.97, delivery_lng: 30.15, delivery_lat: -2.05 }
];

export const mockGeofences = [
  { id: 1, name: 'Kigali CBD', speedLimitKmh: 40, geojson: { type: 'Polygon', coordinates: [[[30.05,-1.94],[30.07,-1.94],[30.07,-1.96],[30.05,-1.96],[30.05,-1.94]]] } }
];
```

---

## 7. CI/CD Integration

### GitHub Actions Workflows

#### Router (`.github/workflows/router-ci.yml`)
```yaml
name: Router CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env: { POSTGRES_DB: kigali_freight_test, POSTGRES_PASSWORD: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:integration
      - run: npm audit --audit-level=high
      - name: Build Docker
        run: docker build -t kigali-freight-router .
```

#### UI (`.github/workflows/ui-ci.yml`)
```yaml
name: UI CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run
      - run: npm run build
      - name: Build Docker
        run: docker build -t kigali-freight-ui --build-arg VITE_API_BASE_URL=http://localhost:3000 .
```

#### Driver (`.github/workflows/driver-ci.yml`) — **NEW**
```yaml
name: Driver CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --ci
  build-preview:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with: { eas-version: 'latest', token: ${{ secrets.EXPO_TOKEN } } }
      - run: eas build --profile preview --platform android --non-interactive
      - run: eas build --profile preview --platform ios --non-interactive
```

---

## 8. Quality Gates

### Pre-Commit (Husky)
```json
// .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```
```json
// package.json (each app)
"lint-staged": {
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css}": ["prettier --write"]
}
```

### PR Checks
- [ ] All CI jobs pass
- [ ] Coverage ≥ thresholds (or justified)
- [ ] No new `npm audit` high/critical
- [ ] API spec updated if endpoints changed
- [ ] Migration included if schema changed
- [ ] Changelog entry added

### Release Criteria
- All P0/P1 tests pass
- Load test: p95 < 200ms, error rate < 0.1%
- Security scan clean
- Documentation deployed
- Rollback plan documented

---

## 9. Test Maintenance

### Flaky Test Protocol
1. Quarantine: Move to `tests/quarantine/` with `@flaky` tag
2. Investigate: Root cause within 48h
3. Fix or delete — no flaky tests in main branch > 1 week

### Test Data Cleanup
- Integration: `TRUNCATE ... CASCADE` in `beforeEach`
- E2E: Separate test users (`e2e_dispatcher_<timestamp>`) → cleanup job nightly

### Coverage Reports
- Uploaded to Codecov/Code Climate on CI
- PR comment with diff coverage

---

## 10. Tooling Summary

| Layer | Framework | Runner | Coverage | Mocking |
|-------|-----------|--------|----------|---------|
| Backend Unit | Jest | `npm test` | Built-in | `jest.mock()` |
| Backend Integration | Jest + Supertest | `npm run test:integration` | Built-in | Test DB |
| Frontend Unit | Vitest + RTL | `npm test` | Built-in | MSW |
| Frontend E2E | Playwright | `npx playwright test` | N/A | MSW / Real API |
| Mobile Unit | Jest + RNTL | `npm test` | Built-in | `jest.mock()` |
| Mobile E2E | Detox | `npm run e2e` | N/A | Real app |

---

## 11. Getting Started (New Developer)

```bash
# Backend
cd kigali-freight-router
npm ci
npm run migrate        # Sets up local DB
npm run test           # Unit tests
npm run test:integration # Integration tests (needs Docker)

# Frontend
cd kigali-freight-ui
npm ci
npm run dev            # Starts Vite + MSW
npm run test           # Vitest watch mode

# Mobile
cd kigali-freight-driver
npm ci
npm run dev            # Expo start
npm run test           # Jest watch mode
npm run e2e            # Detox (needs simulator/emulator)
```

---

## 12. Future Improvements

- [ ] Visual regression testing (Chromatic/Playwright snapshots)
- [ ] Chaos engineering (Litmus/Gremlin) for resilience
- [ ] Property-based testing (fast-check) for VRP solver
- [ ] Mutation testing (Stryker) for critical logic
- [ ] API fuzzing (Schemathesis) for edge cases