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
    } = options;

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
