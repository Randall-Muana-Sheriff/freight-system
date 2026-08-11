import { Router } from 'express';
import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';
import { buildMetricsText, register } from '../middleware/metrics.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { dispatchExternalAlert, ALERT_CATEGORY } from '../services/alertDispatchService.js';

const router = Router();

// The dashboard's React ErrorBoundary is the only thing that can observe a
// render crash — and by the time it fires, whatever auth state existed may
// itself be part of what broke. Deliberately unauthenticated for that
// reason (matching /dispatch-contact below), rate-limited by IP instead so
// a crash-loop can't flood Telegram.
const clientErrorLimit = rateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: 'client-error-report' });

router.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'ok',
            service: 'inzira-router',
            uptimeSeconds: Math.round(process.uptime()),
        },
    });
});

router.get('/ready', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            success: true,
            data: {
                status: 'ready',
                database: 'ok',
            },
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: {
                code: 'READINESS_CHECK_FAILED',
                message: 'Database readiness check failed.',
            },
        });
    }
});

// Unauthenticated on purpose: the driver app needs this on its pre-login
// PIN screens, before any session token exists, and it's just a phone
// number — nothing sensitive enough to warrant gating it behind auth.
router.get('/dispatch-contact', async (req, res) => {
    const result = await pool.query('SELECT dispatch_phone_number FROM system_settings WHERE id = 1');
    res.json({
        success: true,
        data: { phoneNumber: result.rows[0]?.dispatch_phone_number || null },
    });
});

// POST /client-errors — reported by the dashboard's ErrorBoundary the
// moment a render crash happens. Distinct from the process-level
// uncaughtException handler in server.js: this catches crashes in the
// *browser*, which the backend otherwise has no way of ever learning
// about — a white-screened dispatcher used to be visible to nobody but
// the person staring at it.
router.post('/client-errors', clientErrorLimit, async (req, res) => {
    const { message, componentStack, source } = req.body || {};
    const safeMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : 'Unknown error';
    const safeSource = typeof source === 'string' && source.trim() ? source.trim().slice(0, 100) : 'dashboard';

    dispatchExternalAlert(
        `💥 *DASHBOARD CRASHED* 💥\n\n*Source:* ${safeSource}\n*Error:* ${safeMessage}\n*Timestamp:* ${new Date().toISOString()}`,
        ALERT_CATEGORY.SYSTEM
    );

    if (typeof componentStack === 'string' && componentStack) {
        console.error('Dashboard crash reported:', safeMessage, '\n', componentStack.slice(0, 2000));
    } else {
        console.error('Dashboard crash reported:', safeMessage);
    }

    res.json({ success: true, data: { received: true } });
});

router.get('/metrics', async (req, res) => {
    // Scraped by machines (Prometheus), not signed-in users, so this checks
    // a static bearer token rather than the usual JWT authMiddleware. No
    // token configured means metrics are closed, not open-by-default.
    const authHeader = req.headers['authorization'] || '';
    const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!appConfig.metricsToken || providedToken !== appConfig.metricsToken) {
        return res.status(404).end();
    }

    res.setHeader('Content-Type', register.contentType);
    res.send(await buildMetricsText());
});

export default router;
