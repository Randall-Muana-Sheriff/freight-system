// Default for local `npm run dev` (no container, so docker-entrypoint.sh
// never runs to overwrite this file) — leaving it empty makes
// src/utils/runtimeConfig.js fall back to the Vite build-time env var,
// same as before this file existed at all.
window.__RUNTIME_CONFIG__ = {};
