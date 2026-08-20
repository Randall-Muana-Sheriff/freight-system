import * as Sentry from '@sentry/node';

// Controllers report server faults by calling fail(res, { status: 500 }),
// which writes a response and returns — it never throws. Express's error
// middleware therefore never sees it, and neither did Sentry: all 94 of
// this codebase's 5xx paths were invisible, which is most of the ways this
// service can actually fail. Only a crash of the whole process, or an error
// thrown outside a controller's own try/catch, ever got reported.
//
// Capturing here rather than at 94 call sites means no controller has to
// remember to do it, and a new one added next month is covered by default.
// Pass `cause` (the caught error) to get its real stack; without it the
// report still carries the code, message, route, method and request id,
// which is usually enough to find the fault.
function reportServerFailure({ status, code, message, cause, res }) {
    Sentry.withScope((scope) => {
        // Group by error code, not by stack. Without this, every failure
        // routed through this one function shares a stack that points at
        // this file, and Sentry folds unrelated faults into one issue.
        scope.setFingerprint(['{{ default }}', code || 'INTERNAL_ERROR']);
        scope.setTag('error_code', code || 'INTERNAL_ERROR');
        scope.setTag('http_status', String(status));

        const req = res?.req;
        if (req) {
            // The route pattern, never the populated path — /api/orders/:id
            // rather than /api/orders/8142, so one broken endpoint is one
            // issue instead of one per order. It also keeps identifiers out
            // of the title.
            scope.setTag('route', req.route?.path || req.baseUrl || 'unknown');
            scope.setTag('method', req.method);
            if (req.requestId) scope.setTag('request_id', req.requestId);
        }

        Sentry.captureException(
            cause instanceof Error ? cause : new Error(`${code || 'INTERNAL_ERROR'}: ${message}`)
        );
    });
}

export function ok(res, data, options = {}) {
    const { status = 200, meta } = options;
    const payload = { success: true, data };
    if (meta !== undefined) payload.meta = meta;
    return res.status(status).json(payload);
}

export function fail(res, options = {}) {
    const {
        status = 500,
        message = 'Internal server error.',
        code = 'INTERNAL_ERROR',
        details,
        // Optional: the caught error, purely so the report carries a real
        // stack. Nothing breaks when a call site omits it.
        cause,
    } = options;

    // 5xx only. A 400 or a 404 is the client being told no, which is the
    // system working; reporting those would bury the real faults.
    if (status >= 500) {
        reportServerFailure({ status, code, message, cause, res });
    }

    const payload = {
        success: false,
        error: {
            code,
            message,
        },
    };

    if (details !== undefined) payload.error.details = details;
    return res.status(status).json(payload);
}

// Returns a message SAFE to send to an API client. This used to prefer the
// raw error.message over the caller's fallback — the opposite of what
// every call site actually wants — which leaked internal Postgres/library
// error text (constraint names, column names, connection details) into
// client-facing JSON responses across ~40 call sites. Now the fallback is
// what ships to the client; the real error detail is only appended in
// non-production (NODE_ENV unset/"development"/"test"), for local
// debugging convenience, and is always also available server-side via
// whatever console.error/logger call sits next to this in each catch
// block.
export function errorMessage(error, fallback) {
    if (!error) return fallback;
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && error.message) {
        return `${fallback} (${error.message})`;
    }
    return fallback;
}
