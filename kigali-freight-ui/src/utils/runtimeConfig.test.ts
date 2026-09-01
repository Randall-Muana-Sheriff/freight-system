import { describe, it, expect, afterEach } from 'vitest';
import { getApiBase, getCartoApiKey } from './runtimeConfig';

describe('getApiBase', () => {
    afterEach(() => {
        delete window.__RUNTIME_CONFIG__;
    });

    it('prefers window.__RUNTIME_CONFIG__ when present (the deployed-container path)', () => {
        window.__RUNTIME_CONFIG__ = { API_BASE_URL: 'https://api.example.com' };
        expect(getApiBase()).toBe('https://api.example.com');
    });

    it('falls back to the Vite build-time env var when runtime config is empty (local `npm run dev`)', () => {
        window.__RUNTIME_CONFIG__ = {};
        expect(getApiBase()).toBe(import.meta.env.VITE_API_BASE_URL);
    });

    it('falls back to the Vite build-time env var when window.__RUNTIME_CONFIG__ is entirely absent', () => {
        expect(getApiBase()).toBe(import.meta.env.VITE_API_BASE_URL);
    });

    // Three precedence tests existed and no normalisation test, so a trailing
    // slash produced "https://api.example.com//api/orders" with the whole
    // suite green. api.test.ts could not catch it either: it compared the URL
    // apiFetch built against the same API_BASE constant apiFetch built it
    // from, so both sides moved together.
    it('strips a trailing slash, which every caller would otherwise double', () => {
        window.__RUNTIME_CONFIG__ = { API_BASE_URL: 'https://api.example.com/' };
        expect(getApiBase()).toBe('https://api.example.com');
    });

    it('strips more than one, since a config file is hand-edited', () => {
        window.__RUNTIME_CONFIG__ = { API_BASE_URL: 'https://api.example.com///' };
        expect(getApiBase()).toBe('https://api.example.com');
    });

    it('leaves a base with a path prefix intact apart from the slash', () => {
        window.__RUNTIME_CONFIG__ = { API_BASE_URL: 'https://example.com/gateway/' };
        expect(getApiBase()).toBe('https://example.com/gateway');
    });
});

describe('getCartoApiKey', () => {
    afterEach(() => {
        delete window.__RUNTIME_CONFIG__;
    });

    it('reads the runtime config key used by the Docker entrypoint', () => {
        window.__RUNTIME_CONFIG__ = { CARTO_API_KEY: 'cb1_test_key' };
        expect(getCartoApiKey()).toBe('cb1_test_key');
    });

    it('is empty when unset, so Streets can fall back instead of watermarking', () => {
        window.__RUNTIME_CONFIG__ = {};
        expect(getCartoApiKey()).toBe('');
    });
});
