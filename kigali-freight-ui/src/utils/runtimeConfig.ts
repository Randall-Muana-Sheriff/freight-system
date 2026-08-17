// Two possible sources for config that varies by deployment, checked in
// this order:
//  1. window.__RUNTIME_CONFIG__ — set by /config.js, which
//     docker-entrypoint.sh generates from the container's real env vars
//     at startup. This is what lets one built Docker image be deployed to
//     staging/prod/etc. without a rebuild.
//  2. import.meta.env.VITE_* — Vite's own build-time env, inlined into
//     the JS bundle. This is all `npm run dev` ever has (no container, no
//     /config.js), and is also what a plain `vite build` outside Docker
//     produces.
interface RuntimeConfig {
    API_BASE_URL?: string;
    // The host the staff board is canonically served from — Caddy's
    // APP_DOMAIN. Absent in local development and in any deployment that
    // has no staff subdomain, which is why every caller has to have a
    // path-based fallback rather than assuming a subdomain exists.
    APP_DOMAIN?: string;
}

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

function readRuntimeConfig(): RuntimeConfig {
    if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
        return window.__RUNTIME_CONFIG__;
    }
    return {};
}

export function getApiBase(): string {
    const runtime = readRuntimeConfig();
    return runtime.API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
}

// Empty string when no staff host is configured, which is the normal case
// on localhost. Callers treat that as "stay on this origin" rather than
// guessing a subdomain — a wrong guess here would send the whole team to a
// hostname that does not resolve.
export function getStaffDomain(): string {
    const runtime = readRuntimeConfig();
    return runtime.APP_DOMAIN || import.meta.env.VITE_APP_DOMAIN || '';
}
