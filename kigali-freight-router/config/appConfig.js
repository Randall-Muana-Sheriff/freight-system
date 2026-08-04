import dotenv from 'dotenv';

dotenv.config();

function required(name) {
    const value = process.env[name];
    if (!value || !String(value).trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return String(value).trim();
}

function optional(name, fallback = '') {
    const value = process.env[name];
    return value === undefined ? fallback : String(value).trim();
}

function parsePort(value, fallback) {
    const parsed = Number.parseInt(value ?? `${fallback}`, 10);
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port value for ${value ?? fallback}`);
    }
    return parsed;
}

function parseOrigins(value, fallback) {
    return String(value ?? fallback)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function parseBooleanFlag(value) {
    return String(value ?? '0').trim() === '1';
}

export const appConfig = {
    port: parsePort(process.env.PORT, 5000),
    corsOrigins: parseOrigins(process.env.CORS_ORIGIN, 'http://localhost:5173,http://127.0.0.1:5173'),
    db: {
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        host: required('DB_HOST'),
        port: parsePort(process.env.DB_PORT, 5432),
        database: required('DB_DATABASE'),
    },
    jwtSecret: required('JWT_SECRET'),
    // Bcrypt work factor for password/PIN hashing. Was hardcoded to 10
    // everywhere it's used, with no way to raise it as hardware gets
    // faster short of a code change; now a single env-driven value shared
    // by every hash site (authController, driverAuthController,
    // adminController, bin/migrate.js).
    bcryptCost: parseInt(optional('BCRYPT_COST', '10'), 10) || 10,
    // Optional: static bearer token required on GET /metrics (Prometheus
    // scrape configs use a static token, not a short-lived user JWT). When
    // unset, /metrics is closed rather than left open by default.
    metricsToken: optional('METRICS_TOKEN'),
    simulatorSharedSecret: optional('SIMULATOR_SHARED_SECRET'),
    telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
    telegramChatId: optional('TELEGRAM_CHAT_ID'),
    alertWebhookUrl: optional('ALERT_WEBHOOK_URL'),
    allowDestructiveBaseline: parseBooleanFlag(process.env.ALLOW_DESTRUCTIVE_BASELINE),
    // Optional: when set, enables horizontal scaling (shared rate-limit state,
    // shared live-fleet/geofence state, a durable telemetry queue, and the
    // Socket.IO cross-instance adapter). Falls back to safe in-process,
    // single-instance behavior when unset (local dev / tests).
    redisUrl: optional('REDIS_URL'),
    // Optional: absolute path to a Firebase service account JSON file. When
    // set, enables server-side push notifications (order assignments, etc.)
    // via Firebase Cloud Messaging. Push sending is a no-op (logged, not
    // fatal) when unset.
    firebaseServiceAccountPath: optional('FIREBASE_SERVICE_ACCOUNT_PATH'),
    // Optional: Anthropic API key, shared across every AI-assisted feature
    // (document analysis first, more to follow) so each one doesn't need
    // its own credential. Each feature using this must independently
    // no-op (not crash, not block the real action it's attached to) when
    // this is unset — see documentAnalysisService.js.
    anthropicApiKey: optional('ANTHROPIC_API_KEY'),
    // Optional shared secret appended as a query param on the delivery-
    // report callback URL configured in Africa's Talking's dashboard
    // (Settings -> Callback URLs), e.g. .../api/sms/delivery-report?token=X
    // — the callback has no built-in auth otherwise, so without this
    // anyone who found the URL could POST fabricated delivery reports.
    // Left unset, the endpoint still works (delivery visibility matters
    // more than losing it entirely over a missing secret) but logs a
    // warning on every call.
    atDeliveryReportSecret: optional('AT_DELIVERY_REPORT_SECRET'),
    // Optional: Cloudflare R2 (S3-compatible) credentials for storing
    // proof-of-delivery photos. Delivery confirmation photo upload is a
    // no-op (returns a clear error) when unset, rather than crashing.
    r2: {
        accountId: optional('R2_ACCOUNT_ID'),
        // Optional: overrides the derived https://<accountId>.r2.cloudflarestorage.com
        // endpoint — set this to point at a local S3-compatible store (e.g.
        // MinIO) for dev instead of real Cloudflare R2.
        endpoint: optional('R2_ENDPOINT'),
        accessKeyId: optional('R2_ACCESS_KEY_ID'),
        secretAccessKey: optional('R2_SECRET_ACCESS_KEY'),
        bucketName: optional('R2_BUCKET_NAME'),
        publicUrlBase: optional('R2_PUBLIC_URL_BASE'),
    },
    // Optional: encrypts TOTP secrets at rest (services/totpService.js).
    // Deliberately NOT required() like JWT_SECRET — this is an opt-in
    // feature (nobody has MFA enabled until they turn it on themselves),
    // so an existing deployment without this set yet must keep booting
    // normally. The MFA enroll endpoint returns a clear error instead of
    // silently proceeding when this is unset, rather than the whole
    // server refusing to start over a feature nobody's using yet.
    totpEncryptionKey: optional('TOTP_ENCRYPTION_KEY'),
};
