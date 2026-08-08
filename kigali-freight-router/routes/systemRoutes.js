import { Router } from 'express';
import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';
import { buildMetricsText, register } from '../middleware/metrics.js';

const router = Router();

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
