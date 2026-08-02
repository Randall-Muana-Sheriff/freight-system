import { describe, it, expect, afterEach } from 'vitest';
import { getApiBase } from './runtimeConfig';

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
});
