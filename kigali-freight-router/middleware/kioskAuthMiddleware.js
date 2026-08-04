import jwt from 'jsonwebtoken';
import { fail } from '../utils/httpResponse.js';
import { verifyKioskToken } from '../services/kioskAuthService.js';

// Drop-in replacement for authMiddleware(allowedRoles) on the handful of
// read-only routes a kiosk device also needs. It can't just add 'kiosk'
// to authMiddleware's own allow-list because a kiosk token needs a DB
// revocation check (see verifyKioskToken) — a revoked device's JWT would
// otherwise still pass plain signature verification forever, since it's
// deliberately issued with no expiry. Every other role keeps behaving
// exactly like authMiddleware, unchanged.
export const withKioskAccess = (allowedRoles = []) => {
    const normalizedAllowedRoles = allowedRoles.map((role) => String(role).toLowerCase());

    return async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return fail(res, { status: 401, code: 'AUTH_TOKEN_MISSING', message: 'Access denied. Security token is missing.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return fail(res, { status: 403, code: 'AUTH_INVALID_TOKEN', message: 'Session expired or invalid token.' });
        }

        if (String(decoded.role || '').toLowerCase() === 'kiosk') {
            if (!normalizedAllowedRoles.includes('kiosk')) {
                return fail(res, { status: 403, code: 'AUTH_FORBIDDEN', message: 'Access forbidden. Insufficient clearance level.' });
            }
            const kioskUser = await verifyKioskToken(token);
            if (!kioskUser) {
                return fail(res, { status: 403, code: 'AUTH_INVALID_TOKEN', message: 'Session expired or invalid token.' });
            }
            req.user = kioskUser;
            return next();
        }

        req.user = decoded;
        if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(String(decoded.role || '').toLowerCase())) {
            return fail(res, { status: 403, code: 'AUTH_FORBIDDEN', message: 'Access forbidden. Insufficient clearance level.' });
        }
        next();
    };
};
