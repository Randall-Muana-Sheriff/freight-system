import * as Sentry from '@sentry/react';
import { getSentryDsn } from './runtimeConfig';

// Browser-side error reporting for the dispatcher board and the public site.
//
// The board already reports render crashes: ErrorBoundary POSTs to the
// router's /client-errors, which fires a Telegram alert. That stays — it is
// how a person finds out within seconds that a dispatcher is looking at a
// white screen. What it cannot see is everything outside a React render: a
// failed fetch, a rejected promise in an event handler, a TypeError in a
// callback. Those never reach an error boundary, so until now they were
// visible only in a console nobody has open.
//
// A no-op when no DSN is configured — local development and anyone who
// clones this public repository get no reporting destination.
//
// Read at call time, not at module load: the DSN arrives on
// window.__RUNTIME_CONFIG__ from /config.js, which the container generates
// at startup, and a module-scope read can run before that script has
// executed.
let started = false;

export function initBrowserReporting() {
    const dsn = getSentryDsn();
    if (!dsn || started) return;

    Sentry.init({
        dsn,
        release: (import.meta.env.VITE_GIT_COMMIT as string) || undefined,
        environment: import.meta.env.PROD ? 'production' : 'development',

        // This board shows customer names, phone numbers and delivery
        // addresses on screen. Session Replay and default PII would carry
        // all of it to a third party, which is not what the privacy policy
        // describes and not what a customer agreed to. Errors only.
        sendDefaultPii: false,
        integrations: [],

        tracesSampleRate: 0,

        beforeSend(event) {
            return scrub(event) as typeof event;
        },
    });
    started = true;
}

// Redaction rules mirroring kigali-freight-router/utils/redaction.js, which
// carries the tests for them. Kept as a copy rather than a shared package:
// the two run in different runtimes behind different bundlers, and putting
// this on the critical path of both builds to save thirty lines is a poor
// trade. If you change one, change the other — the router's test file is
// the specification.
const EXACT = /^(pin|otp|token|secret|password|passwd|authorization|auth|cookie|session|apikey|dsn|jwt)$/;
const CREDENTIAL = /(password|passwd|secret|token|apikey|otpcode|pincode|accesscode|verificationcode|trackingcode)/;
const PERSONAL = /(phone|phonenumber|msisdn|address|latitude|longitude)$/;
const COORD = /(^|[a-z0-9])(lat|lng|lon)$/;
const PHONE_SHAPE = /(\+?250|\b0)7[0-9]{8}\b/g;

function isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase().replace(/[_\-\s]/g, '');
    return EXACT.test(k) || CREDENTIAL.test(k) || PERSONAL.test(k) || COORD.test(k);
}

function scrub(node: unknown, depth = 0): unknown {
    if (depth > 8 || node === null || node === undefined) return node;
    if (typeof node === 'string') return node.replace(PHONE_SHAPE, '[phone]');
    if (Array.isArray(node)) return node.map((v) => scrub(v, depth + 1));
    if (typeof node !== 'object') return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        out[key] = isSensitiveKey(key) ? '[redacted]' : scrub(value, depth + 1);
    }
    return out;
}

// Used by ErrorBoundary so a render crash lands in both places: Telegram for
// the immediate shout, Sentry for the stack trace and the count.
export function reportToSentry(error: unknown, componentStack?: string) {
    if (!started) return;
    Sentry.captureException(error, componentStack ? { extra: { componentStack } } : undefined);
}
