import 'dotenv/config';
import net from 'net';

// Node 18.13+ defaults to racing IPv4/IPv6 connection attempts in parallel
// ("Happy Eyeballs"/autoSelectFamily) for any dual-stack host. Inside this
// project's Docker bridge networks, that races against an IPv6 route that
// exists in DNS but isn't actually reachable (ENETUNREACH) — for most
// hosts the fallback to IPv4 is fast enough not to matter, but for at
// least oauth2.googleapis.com (needed for Firebase Admin's push
// notifications) it reliably hangs the whole request instead of falling
// back. Disabling the race restores the pre-18.13 behavior of just using
// the first resolved address directly, which is what actually works here
// — confirmed via raw net/tls connections succeeding while the racing
// http(s) client hung indefinitely on the same host from the same
// container. Must run before any module below opens its own HTTP(S)
// client (Firebase Admin, etc.), hence living at the very top of entry.
net.setDefaultAutoSelectFamily(false);

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { appConfig } from './config/appConfig.js';
import { isRedisEnabled, createRedisDuplicate, closeRedisClients } from './config/redisClient.js';
import systemRoutes from './routes/systemRoutes.js';
import { requestContext } from './middleware/requestContext.js';
import { metricsMiddleware, observeSocketEvent } from './middleware/metrics.js';
import { createTelemetryQueue, FLEET_STATE_KEY } from './services/telemetryQueue.js';
import { hashGetAll } from './services/sharedState.js';

import pool from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import driverAuthRoutes from './routes/driverAuthRoutes.js';
import geofenceRoutes from './routes/geofenceRoutes.js';
import dispatchRoutes from './routes/dispatchRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import fleetRoutes from './routes/fleetRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import stopRouter from './routes/stopRoutes.js';
import incidentRoutes from './routes/incidentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import hubRoutes from './routes/hubRoutes.js';
import driverDocumentRoutes from './routes/driverDocumentRoutes.js';
import safetyChecklistRoutes from './routes/safetyChecklistRoutes.js';
import geocodeRoutes from './routes/geocodeRoutes.js';
import smsRoutes from './routes/smsRoutes.js';

const app = express();
const allowedOrigins = appConfig.corsOrigins;

// This is a JSON API (not an HTML-serving app), so disable helmet's CSP —
// it has no effect on API responses and only complicates configuring the
// separate frontend's own CSP.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })
);
app.use(requestContext);
app.use(metricsMiddleware);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: res.locals.requestDurationMs || undefined,
      })
    );
  });
  next();
});

const JWT_SECRET = appConfig.jwtSecret;
const TELEGRAM_BOT_TOKEN = appConfig.telegramBotToken;
const TELEGRAM_CHAT_ID = appConfig.telegramChatId;
const ALERT_WEBHOOK_URL = appConfig.alertWebhookUrl;
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === __filename;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

// Tracked so shutdownServices() can close them; the adapter doesn't own
// these connections, so nothing else closes them for us.
let redisAdapterClients = [];

// In a multi-instance deployment (REDIS_URL set), attach the Redis adapter so
// io.emit() fans out to sockets connected to *any* instance, not just this
// process. Without Redis, Socket.IO falls back to its default in-memory
// adapter, which only works correctly for a single instance.
if (isRedisEnabled()) {
  const [pubClient, subClient] = await Promise.all([createRedisDuplicate(), createRedisDuplicate()]);
  if (pubClient && subClient) {
    redisAdapterClients = [pubClient, subClient];
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔗 Socket.IO Redis adapter attached — safe to run multiple instances.');
  }
}

async function dispatchExternalAlert(message) {
  console.log(`[INCIDENT TELEMETRY]: ${message}`);
  try {
    if (ALERT_WEBHOOK_URL) {
      await fetch(ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'inzira-router', message }),
      });
      return;
    }

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('❌ Notification dispatch failed:', err.message);
  }
}

// Route modules — replaces what used to be duplicated inline in this file.
// See controllers/ and routes/ for the actual handler logic.
app.use('/', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth/driver', driverAuthRoutes);
app.use('/api/geofences', geofenceRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api', adminRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/stops', stopRouter);
app.use('/api/incidents', incidentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/hubs', hubRoutes);
app.use('/api/driver-documents', driverDocumentRoutes);
app.use('/api/driver-safety-checklist', safetyChecklistRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/sms', smsRoutes);

// Anything that reaches here escaped every controller's own try/catch —
// a malformed JSON body, a multer error thrown before a route handler
// runs, a synchronous throw in middleware. Without this, Express's own
// default handler takes over and — since nothing in this app ever reads
// NODE_ENV to disable it — returns a full HTML page with a stack trace,
// file paths, and dependency versions to the client. This backstops that:
// always a safe, generic JSON error, full detail only logged server-side
// with the request ID already generated by requestContext so it can be
// correlated with the structured access log for the same request.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(`❌ Unhandled error [${req.requestId || 'no-request-id'}]:`, err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV !== 'production' ? err.message : 'Internal server error.',
      requestId: req.requestId,
    },
  });
});

// A process that keeps running after an unhandled rejection/exception is
// in an unknown state — better to log with full context and exit so the
// container orchestrator restarts it cleanly, per Node's own guidance,
// than to silently keep serving requests from a corrupted process.
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception, shutting down:', error.stack || error.message);
  process.exit(1);
});

const telemetryQueue = createTelemetryQueue({
  pool,
  io,
  dispatchExternalAlert,
});

io.use((socket, next) => {
  const tokenHeader = socket.handshake.auth?.token;
  const handshakeUsername = socket.handshake.auth?.username;
  const simulatorSecret = socket.handshake.auth?.simulatorSecret;

  // Simulator nodes may skip JWT auth only when a shared secret is configured
  // and the caller presents it. Disabled by default (no SIMULATOR_SHARED_SECRET set).
  if (
    appConfig.simulatorSharedSecret &&
    handshakeUsername &&
    handshakeUsername.startsWith('sim_driver') &&
    simulatorSecret === appConfig.simulatorSharedSecret
  ) {
    socket.user = { username: handshakeUsername, role: 'dispatcher' };
    socket.isSimulator = true;
    return next();
  }

  if (!tokenHeader) return next(new Error('Telemetry token missing.'));
  const token = tokenHeader.includes(' ') ? tokenHeader.split(' ')[1] : tokenHeader;
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Signature invalid.'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', async (socket) => {
  observeSocketEvent('connection');
  const fleetSnapshot = await hashGetAll(FLEET_STATE_KEY);
  socket.emit('fleet:snapshot', Object.values(fleetSnapshot));
  socket.on('driver:telemetry-push', async (data) => {
    observeSocketEvent('driver:telemetry-push');

    // Only real drivers (or the explicitly-opted-in simulator bypass) may
    // report telemetry — a dispatcher/admin session has no business pushing
    // vehicle positions.
    if (!socket.isSimulator && socket.user?.role !== 'driver') return;

    if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number' || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) {
      return;
    }

    // Identity always comes from the verified session, never the payload —
    // otherwise any authenticated driver could report telemetry under a
    // different driver's name (see the same rule in fleetController.js's
    // REST equivalent). The simulator is the one exception: its socket
    // identity (sim_driver_N) is deliberately not its display name, and
    // it's already gated behind an explicit, off-by-default shared secret.
    const driverName = socket.isSimulator
      ? (typeof data.driverName === 'string' && data.driverName.trim() ? data.driverName.trim() : socket.user.username)
      : socket.user.username;
    const { lat, lng } = data;
    const timestamp = new Date().toISOString();
    const currentVelocityKmh = Math.floor(Math.random() * (85 - 40 + 1)) + 40;
    try {
      await telemetryQueue.enqueue({ driverName, lat, lng, timestamp, currentVelocityKmh });
    } catch (dbErr) {
      console.error('❌ DATABASE ERROR:', dbErr);
    }
  });
  socket.on('disconnect', () => {
    observeSocketEvent('disconnect');
  });
});

function startServer(port = appConfig.port) {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve(server);
      return;
    }

    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      console.log(`🚀 Secured Core Telemetry Routing Engine online on port ${port}`);
      resolve(server);
    });
  });
}

if (isMainModule) {
  startServer().catch((error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  });

  // Graceful shutdown: stop accepting new work, flush the telemetry queue,
  // close Redis connections and the DB pool, then exit. Container
  // orchestrators (Kubernetes, ECS, etc.) send SIGTERM on scale-down/deploy;
  // without this, in-flight telemetry could be dropped and connections
  // would be left dangling.
  const handleShutdownSignal = (signal) => {
    console.log(`🛡️ Received ${signal}, shutting down gracefully...`);
    shutdownServices()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('❌ Error during graceful shutdown:', error.message);
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
}

async function shutdownServices() {
  await telemetryQueue.shutdown();
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.all(redisAdapterClients.map((client) => client.quit().catch(() => {})));
  await closeRedisClients();
  await pool.end();
}

export { app, server, io, telemetryQueue, startServer, shutdownServices };
