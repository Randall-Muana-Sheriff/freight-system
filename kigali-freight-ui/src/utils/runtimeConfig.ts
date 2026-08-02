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
