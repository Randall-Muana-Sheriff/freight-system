# Inzira v2.0 — Coding Standards

---

## General Principles

1. **Consistency over cleverness** — Follow existing patterns in the codebase
2. **Explicit over implicit** — Types, errors, and contracts should be visible
3. **Fail fast** — Validate early, return clear errors
4. **Single responsibility** — One function, one purpose
5. **No silent failures** — Log, throw, or return error envelopes

---

## TypeScript / JavaScript

### Language Version
- **Node**: 20+ (ES2023)
- **TypeScript**: 5.5+ (strict mode)
- **React**: 19 (UI), 19.1 (Driver)
- **Target**: ES2022

### Naming Conventions

| Construct | Convention | Example |
|-----------|------------|---------|
| Variables/functions | `camelCase` | `getDriverAssignments` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_BATCH_SIZE` |
| Types/Interfaces | `PascalCase` | `TelemetryItem` |
| Enums | `PascalCase` singular | `OrderStatus` |
| Files (modules) | `kebab-case` | `telemetry-queue.js` |
| React Components | `PascalCase` | `FleetMap.jsx` |
| Test files | `*.test.js` / `*.test.tsx` | `auth.test.js` |

### TypeScript Rules (tsconfig.json — strict mode)

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

**Enforcement**:
- `npm run typecheck` in CI (Driver + UI)
- Zero `any` in new code (use `unknown` + type guards)

### Code Style (ESLint + Prettier)

```json
// .eslintrc.cjs (shared)
{
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "prefer-const": "error",
    "no-var": "error",
    "object-shorthand": "error",
    "prefer-arrow-callback": "error",
    "arrow-spacing": "error"
  }
}
```

**Formatter**: Prettier v3 (single quotes, trailing commas, 100 char line width)

---

## Backend (Router) Standards

### File Structure
```
controllers/{domain}Controller.js    # Request/response only
services/{domain}Service.js          # Business logic, singleton
routes/{domain}Routes.js             # Express router mounting
middleware/{concern}Middleware.js    # Cross-cutting
```

### Controller Pattern

```javascript
// Good: Thin controller, delegates to service
const createOrder = async (req, res, next) => {
  try {
    const { cargo_description, ...coords } = req.body;
    const order = await orderService.create({ cargo_description, ...coords });
    req.io.emit('order:created', order);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);  // Let error handler format response
  }
};
```

### Service Pattern

```javascript
// services/orderService.js
const orderService = {
  async create(data) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql`...`, [params]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};
module.exports = orderService;  // Singleton
```

### Error Handling

```javascript
// Custom error classes (extend Error)
class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) { super('VALIDATION_ERROR', message, 400); }
}

class NotFoundError extends AppError {
  constructor(resource) { super('NOT_FOUND', `${resource} not found`, 404); }
}

// Usage
if (!order) throw new NotFoundError('Order');

// Global error handler (middleware/errorHandler.js)
const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
  }
  logger.error(err);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
};
```

### Database

- **Pool**: `config/db.js` exports `pool` (pg.Pool)
- **Transactions**: Use `client.query('BEGIN')` / `COMMIT` / `ROLLBACK` explicitly
- **Queries**: Parameterized always — `client.query('SELECT * FROM orders WHERE id = $1', [id])`
- **PostGIS**: Use `ST_` functions, cast to `::geography` for meters
- **Migrations**: `bin/migrate.js` runs `.sql` files in `migrations/` in filename order

```sql
-- Migration naming: NN_descriptive_name.sql
-- 01_init_spatial_baseline.sql
-- 02_add_refresh_tokens.sql
```

### Environment Config (config/appConfig.js)

```javascript
// Zod schema validates ALL env at startup
export const appConfig = envSchema.parse(process.env);
// Throws on missing/invalid — fail fast
```

### Logging

```javascript
// config/logger.js → pino
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Usage
logger.info({ userId: req.user.userId, orderId }, 'Order assigned');
logger.error({ err }, 'Failed to assign order');
```

**Output**: JSON lines to stdout (structured for Loki/ELK)

---

## Frontend (UI) Standards

### File Structure
```
src/
├── components/        # Reusable UI components
├── context/           # React Context providers
├── hooks/             # Custom hooks
├── utils/             # Pure functions, API client
├── pages/             # Route-level components (if using router)
└── main.jsx           # Entry point
```

### Component Pattern

```jsx
// components/MetricCard.jsx
import { memo } from 'react';

const MetricCard = memo(function MetricCard({ label, value, unit, trend }) {
  return (
    <div className="metric-card">
      <span className="label">{label}</span>
      <span className="value">{value} <span className="unit">{unit}</span></span>
      {trend && <TrendIndicator direction={trend} />}
    </div>
  );
});

export default MetricCard;
```

### State Management

- **Server state**: TanStack Query (React Query) pattern via `useRoutes`, `useOrders` hooks
- **Client state**: `useState` / `useReducer` in components
- **Global state**: React Context (`SocketContext`, `AuthContext`)
- **No Redux/Zustand** — keep it simple

### API Client (src/utils/api.js)

```javascript
// Centralized fetch wrapper with auth handling
const api = {
  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('accessToken');
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401 || res.status === 403) {
      handleUnauthorized();  // Clear storage, redirect to login
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Request failed');
    return data.data;
  }
};

// Usage
export const createOrder = (order) => api.request('POST', '/api/orders', order);
```

### Socket.IO

```jsx
// context/SocketContext.jsx
const socket = useMemo(() => io(API_BASE, {
  auth: { token: `Bearer ${accessToken}` },
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10
}), [accessToken]);

// Event handlers
useEffect(() => {
  socket.on('geofence:violation', handleViolation);
  return () => socket.off('geofence:violation', handleViolation);
}, []);
```

### Styling

- **Tailwind CSS v4** — utility-first
- **No custom CSS files** — use Tailwind classes
- **Dark mode**: `class` strategy — `<html class="dark">` toggled via context
- **Component classes**: `clsx` / `tailwind-merge` for conditional classes

---

## Mobile (Driver) Standards

### File Structure
```
app/
├── (auth)/           # Auth stack
│   └── login.tsx
├── (app)/            # Authenticated stack
│   ├── index.tsx     # Dashboard
│   ├── assignments.tsx
│   ├── trip/[id].tsx
│   └── incidents.tsx
├── _layout.tsx       # Root layout
lib/
├── api.ts            # API client
├── auth.tsx          # AuthProvider + hooks
├── offlineQueue.ts   # Mutation queue
├── locationTracking.ts
└── pushNotifications.ts
components/           # Reusable UI
```

### TypeScript

```typescript
// lib/api.ts — Strict types for API contracts
export interface Order {
  id: number;
  cargo_description: string;
  status: OrderStatus;
  // ...
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

type ApiResult<T> = ApiResponse<T> | ApiError;
```

### Async Storage (SecureStore)

```typescript
// lib/auth.tsx
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'kf_access_token';
const REFRESH_KEY = 'kf_refresh_token';

export const setTokens = async (access: string, refresh: string) => {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh)
  ]);
};
```

### Offline-First Pattern

```typescript
// lib/offlineQueue.ts
interface QueuedMutation {
  id: string;
  type: 'status_update' | 'incident_report';
  payload: unknown;
  timestamp: number;
  retries: number;
}

export const enqueue = async (mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retries'>) => {
  const queue = await getQueue();
  queue.push({ ...mutation, id: crypto.randomUUID(), timestamp: Date.now(), retries: 0 });
  await saveQueue(queue);
};

export const flushQueue = async () => {
  const queue = await getQueue();
  for (const item of queue) {
    try {
      await apiRequest(item.type, item.payload);
      await removeFromQueue(item.id);
    } catch (e) {
      if (++item.retries > MAX_RETRIES) await removeFromQueue(item.id);
      else await updateQueue(item);
    }
  }
};
```

### React Native Conventions

- **Navigation**: Expo Router (file-based)
- **State**: React Context + `useReducer` for auth
- **Side effects**: `useEffect` with cleanup
- **Platform**: `Platform.select` for iOS/Android differences
- **Permissions**: Request at point of use, handle denial gracefully

---

## Git & Commit Standards

### Branch Naming
```
feature/{area}-{short-desc}    # feature/driver-offline-queue
fix/{area}-{short-desc}        # fix/auth-refresh-token-rotation
chore/{area}-{short-desc}      # chore/docker-compose-add
docs/{area}-{short-desc}       # docs/api-spec-update
```

### Commit Format (Conventional Commits)
```
<type>(<scope>): <subject>

<body>

<footer>
```

| Type | Meaning |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change without behavior change |
| `docs` | Documentation only |
| `chore` | Maintenance, deps, build |
| `test` | Adding tests |
| `perf` | Performance improvement |

**Examples**:
```
feat(auth): add refresh token rotation with revocation

Implements JWT access token (2h) + bcrypt-hashed refresh token (30d)
with single-use rotation. Updates authController, migrations, tests.

Closes #12

fix(router): handle revoked refresh token on /auth/refresh

Returns 401 AUTH_REFRESH_INVALID instead of 500 when token
not found or already revoked.

feat(driver): add offline queue for status updates + incidents

Writes mutations to AsyncStorage, flushes on AppState active + NetInfo.
```

---

## Testing Standards

### Backend (Jest)

```javascript
// tests/integration.test.js
describe('Auth flow', () => {
  let agent;

  beforeAll(() => { agent = request.agent(app); });

  test('signup → login → refresh → logout', async () => {
    const signup = await agent.post('/api/auth/signup').send({ username: 'u', password: 'p' });
    expect(signup.body.success).toBe(true);
    expect(signup.body.data).toHaveProperty('accessToken');
    expect(signup.body.data).toHaveProperty('refreshToken');

    const login = await agent.post('/api/auth/login').send({ username: 'u', password: 'p' });
    const { refreshToken } = login.body.data;

    const refresh = await agent.post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.body.data.accessToken).not.toBe(login.body.data.accessToken);

    await agent.post('/api/auth/logout').send({ refreshToken });
    const retry = await agent.post('/api/auth/refresh').send({ refreshToken });
    expect(retry.body.error.code).toBe('AUTH_REFRESH_INVALID');
  });
});
```

**Rules**:
- Test **behavior**, not implementation
- Use test database (CI spins up Postgres+PostGIS)
- Clean state between tests (`TRUNCATE ... CASCADE` in `beforeEach`)
- Cover happy path + 1 error case per endpoint

### Frontend (Vitest + React Testing Library)

```tsx
// src/components/__tests__/MetricCard.test.tsx
import { render, screen } from '@testing-library/react';
import MetricCard from '../MetricCard';

test('renders label, value, and unit', () => {
  render(<MetricCard label="Orders" value={42} unit="pending" />);
  expect(screen.getByText('Orders')).toBeInTheDocument();
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.getByText('pending')).toBeInTheDocument();
});
```

### Mobile (Jest + React Native Testing Library)

```typescript
// app/(app)/__tests__/assignments.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import Assignments from '../assignments';

test('shows assignment list after login', async () => {
  const { getByText } = render(<Assignments />);
  await waitFor(() => expect(getByText('Loading...')).toBeTruthy());
  // Mock API response → expect list items
});
```

---

## Documentation Standards

### Code Comments
- **JSDoc** for all exported functions/classes
- **Inline** only for non-obvious logic
- **TODO/FIXME** with GitHub issue reference: `// TODO(#123): handle edge case`

```javascript
/**
 * Calculates ETA in minutes using Haversine distance at avg speed.
 * @param {Object} params - From driver location to destination
 * @param {number} params.driverLat - Driver latitude
 * @param {number} params.driverLng - Driver longitude
 * @param {number} params.destLat - Destination latitude
 * @param {number} params.destLng - Destination longitude
 * @param {number} [params.speedKmh=30] - Average speed assumption
 * @returns {number} ETA in minutes (minimum 1)
 */
export function calculateEta({ driverLat, driverLng, destLat, destLng, speedKmh = 30 }) {
  // ...
}
```

### README (Per App)
```
# inzira-router
## Quick Start
## Environment Variables
## API Reference (link to 06-api-spec.md)
## Running Tests
## Docker
```

### Architecture Decision Records (ADR)
```
docs/adr/
├── 001-use-postgis-for-spatial.md
├── 002-jwt-refresh-token-rotation.md
├── 003-offline-first-driver-app.md
└── 004-tailwind-v4-for-ui.md
```

---

## Security Standards

### Input Validation
- **Never trust client input** — validate on server
- Use Zod schemas on all mutating endpoints
- Sanitize HTML if ever rendered (DOMPurify)

### Authentication
- JWT: HS256, 2h expiry, `userId`, `username`, `role`
- Refresh: bcrypt hash (cost 10), 30d, single-use rotation
- Passwords: bcrypt cost 10, min 8 chars

### Headers (Helmet)
```javascript
app.use(helmet({
  contentSecurityPolicy: false,  // API — no CSP needed
  crossOriginEmbedderPolicy: false
}));
```

### Rate Limiting
- Auth: 10 req / 15 min / IP
- Global: 20 req / 15 min / IP
- Store: Redis (prod) / Memory (dev)

### CORS
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true
}));
```

### Secrets
- **Never commit** `.env`, `google-services.json`, `serviceAccount.json`
- Use GitHub Actions secrets / Kubernetes secrets / Doppler

---

## Performance Guidelines

### Database
- Index on `driver_locations.geom` (GIST)
- Index on `driver_location_history (driver_name, recorded_at)`
- Partition `driver_location_history` by month (future)
- Use `EXPLAIN ANALYZE` on slow queries

### Socket.IO
- Redis adapter for horizontal scaling
- Emit to rooms, not broadcast
- Throttle high-frequency events (telemetry → queue, not direct emit)

### Frontend
- `React.memo` for list items
- Virtualize long lists (`react-window`)
- Debounce map interactions (300ms)

### Mobile
- `useMemo` / `useCallback` for expensive renders
- `FlatList` with `getItemLayout` for assignments
- Background tasks: minimal work, batch uploads

---

## Dependency Management

### Update Policy
- **Patch**: Auto-merge via Dependabot (tests pass)
- **Minor**: Review changelog, test locally, merge
- **Major**: Plan migration, allocate sprint time

### Audit
```bash
npm audit --audit-level=high  # CI gate
```

### Allowed Registries
- npmjs.org (primary)
- GitHub Packages (private deps)

---

## CI/CD Gates

### Router
```yaml
# .github/workflows/router-ci.yml
- npm ci
- npm run lint
- npm run typecheck
- npm run test:integration  # Postgres+PostGIS+Redis services
- npm audit --audit-level=high
- docker build
```

### UI
```yaml
- npm ci
- npm run lint
- npm run typecheck
- npm run build
- docker build
```

### Driver
```yaml
- npm ci
- npm run lint
- npm run typecheck
- npm run test
- eas build --profile preview
```

---

## Code Review Checklist

- [ ] Types correct (no `any`, proper generics)
- [ ] Errors handled (try/catch, error boundaries)
- [ ] Tests added/updated (unit + integration)
- [ ] No console.log / debugger left in
- [ ] Performance considered (N+1 queries, re-renders)
- [ ] Security reviewed (validation, auth, secrets)
- [ ] Documentation updated (API spec, README, ADR if needed)
- [ ] Migration included if schema changed
- [ ] Changelog entry (if user-facing)

---

## Tooling Commands

### Router
```bash
npm run dev              # nodemon server.js
npm run test             # jest --runInBand
npm run test:integration # jest --testPathPattern=integration
npm run migrate          # node bin/migrate.js
npm run migrate:status   # node bin/migrate.js status
npm run load:test        # node ops/load-test.js
```

### UI
```bash
npm run dev              # vite
npm run build            # tsc + vite build
npm run lint             # eslint src --ext js,jsx
npm run typecheck        # tsc --noEmit
```

### Driver
```bash
npm run dev              # expo start
npm run lint             # expo lint
npm run typecheck        # tsc --noEmit
npm run test             # jest
eas build --profile preview
```