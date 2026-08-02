import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, setUnauthorizedHandler, API_BASE } from './api';

function mockFetchOnce(response: unknown) {
    global.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(body),
    };
}

describe('apiFetch', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setUnauthorizedHandler(null);
    });

    it('unwraps the {success, data} envelope', async () => {
        mockFetchOnce(jsonResponse(200, { success: true, data: { id: 1, name: 'Nyabugogo' } }));
        const result = await apiFetch('/api/hubs');
        expect(result).toEqual({ id: 1, name: 'Nyabugogo' });
    });

    it('attaches an Authorization header when a token is passed', async () => {
        mockFetchOnce(jsonResponse(200, { success: true, data: [] }));
        await apiFetch('/api/vehicles', { token: 'abc123' });
        const [, options] = vi.mocked(global.fetch).mock.calls[0];
        expect((options as RequestInit).headers).toMatchObject({ Authorization: 'Bearer abc123' });
    });

    it('omits the Authorization header when no token is passed', async () => {
        mockFetchOnce(jsonResponse(200, { success: true, data: [] }));
        await apiFetch('/api/health');
        const [, options] = vi.mocked(global.fetch).mock.calls[0];
        expect((options as RequestInit).headers).not.toHaveProperty('Authorization');
    });

    it('throws with the server-provided message on a non-2xx response', async () => {
        mockFetchOnce(jsonResponse(400, { success: false, error: { message: 'Weight must be a positive number of kilograms.' } }));
        await expect(apiFetch('/api/orders', { method: 'POST', body: {} })).rejects.toThrow(
            'Weight must be a positive number of kilograms.'
        );
    });

    it('falls back to a generic message when the server sends none', async () => {
        mockFetchOnce({
            ok: false,
            status: 500,
            headers: { get: () => 'text/plain' },
            json: () => Promise.reject(new Error('not json')),
        });
        await expect(apiFetch('/api/orders')).rejects.toThrow('Request failed with status 500');
    });

    it('fires the registered unauthorized handler on a 401', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        mockFetchOnce(jsonResponse(401, { success: false, error: { message: 'Token expired.' } }));
        await expect(apiFetch('/api/orders')).rejects.toThrow();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('fires the registered unauthorized handler on a 403', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        mockFetchOnce(jsonResponse(403, { success: false, error: { message: 'Forbidden.' } }));
        await expect(apiFetch('/api/audit-logs')).rejects.toThrow();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not fire the unauthorized handler on other error statuses', async () => {
        const handler = vi.fn();
        setUnauthorizedHandler(handler);
        mockFetchOnce(jsonResponse(500, { success: false, error: { message: 'Server error.' } }));
        await expect(apiFetch('/api/orders')).rejects.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('treats a 202 with no body as an accepted-but-empty response', async () => {
        mockFetchOnce({ ok: true, status: 202, headers: { get: () => 'text/plain' }, json: () => Promise.resolve(null) });
        const result = await apiFetch('/api/geocode/search');
        expect(result).toEqual({ accepted: true });
    });

    it('prefixes requests with the configured API base URL', async () => {
        mockFetchOnce(jsonResponse(200, { success: true, data: [] }));
        await apiFetch('/api/vehicles');
        const [url] = vi.mocked(global.fetch).mock.calls[0];
        expect(url).toBe(`${API_BASE}/api/vehicles`);
    });
});
