export function validateSignupPayload(req, res, next) {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_USERNAME',
                message: 'Username must be 3 to 50 characters long.',
            },
        });
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_PASSWORD',
                message: 'Password must be at least 8 characters long.',
            },
        });
    }

    // Note: signup no longer accepts a client-supplied `role` — every
    // self-registered account is a 'driver' (see authController.js). Role
    // elevation is admin-only, via PATCH /api/admin/users/:id/role.
    next();
}

export function validateLoginPayload(req, res, next) {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 50) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_USERNAME',
                message: 'Username must be 3 to 50 characters long.',
            },
        });
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'AUTH_INVALID_PASSWORD',
                message: 'Password must be at least 8 characters long.',
            },
        });
    }

    next();
}
