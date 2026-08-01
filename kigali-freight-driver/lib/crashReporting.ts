import * as Sentry from '@sentry/react-native';

// Previously there was no crash/error reporting SDK anywhere in this app
// — a fleet of driver phones the team cannot physically access, where an
// uncaught exception in the field produced zero telemetry back to
// anyone. This is real (not a stub): once EXPO_PUBLIC_SENTRY_DSN is set
// at build time, it genuinely reports to Sentry. Left unset (the default
// today, since no Sentry account/DSN exists yet), every function here is
// a safe no-op — nothing breaks, nothing is silently disabled elsewhere,
// there's just no reporting destination configured yet.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
let initialized = false;

export function initCrashReporting() {
    if (!dsn) {
        console.log('[crashReporting] EXPO_PUBLIC_SENTRY_DSN not set — crash reporting disabled.');
        return;
    }
    Sentry.init({
        dsn,
        // Errors happen far less often than normal navigation/API traffic
        // in a driver's shift — sampling every session for performance
        // tracing would be excessive data volume for little insight.
        // Every actual error is still captured regardless of this value.
        tracesSampleRate: 0.2,
        environment: process.env.EXPO_PUBLIC_API_BASE_URL?.startsWith('https') ? 'production' : 'development',
    });
    initialized = true;
    console.log('[crashReporting] Sentry initialized.');
}

// Safe to call even when Sentry was never initialized — errors are still
// logged to the console either way, so nothing is silently swallowed.
export function captureException(error: unknown, context?: Record<string, unknown>) {
    if (initialized) {
        Sentry.captureException(error, context ? { extra: context } : undefined);
    }
    console.error('[captureException]', error, context ?? '');
}

export function setUserContext(username: string | null) {
    if (!initialized) return;
    Sentry.setUser(username ? { username } : null);
}
