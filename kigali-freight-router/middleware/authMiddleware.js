import jwt from 'jsonwebtoken';
import { fail } from '../utils/httpResponse.js';

export const authMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        // Look for the Authorization header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Splits "Bearer <token>"

        if (!token) {
            return fail(res, {
                status: 401,
                code: 'AUTH_TOKEN_MISSING',
                message: 'Access denied. Security token is missing.',
            });
        }

        try {
            // Verify token legitimacy against our secret key
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded; // Attach the user profile data directly to the request object

            const normalizedUserRole = String(req.user.role || '').toLowerCase();
            const normalizedAllowedRoles = allowedRoles.map((role) => String(role).toLowerCase());

            // Check if user's role matches the endpoint privileges
            if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedUserRole)) {
                return fail(res, {
                    status: 403,
                    code: 'AUTH_FORBIDDEN',
                    message: 'Access forbidden. Insufficient clearance level.',
                });
            }

            next(); // Everything looks good, pass control to the controller
        } catch (error) {
            // 401, not 403. These are different answers and this endpoint was
            // giving the same one to both.
            //
            // 401 means "I do not know who you are — authenticate and come
            // back". 403 means "I know exactly who you are, and no". An
            // expired token is the first; a driver reaching an admin route is
            // the second. Returning 403 for both forced every client to
            // discriminate on the error code to decide whether refreshing was
            // worth trying, and both of ours simply retried on either — so a
            // genuine refusal burned a single-use refresh-token rotation and
            // then failed again identically.
            //
            // With this split a client can follow the plain rule: refresh on
            // 401, never on 403.
            return fail(res, {
                status: 401,
                code: 'AUTH_INVALID_TOKEN',
                message: 'Session expired or invalid token.',
            });
        }
    };
};