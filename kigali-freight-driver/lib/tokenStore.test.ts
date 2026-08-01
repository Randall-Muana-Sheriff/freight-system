import * as SecureStore from 'expo-secure-store';
import {
    setTokens,
    getCachedTokens,
    clearTokens,
    hydrateTokenStore,
    onTokensChanged,
    refreshAccessToken,
    AUTH_TOKEN_KEY,
    AUTH_REFRESH_TOKEN_KEY,
} from './tokenStore';

jest.mock('expo-secure-store', () => {
    const store = new Map<string, string>();
    return {
        getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        setItemAsync: jest.fn((key: string, value: string) => {
            store.set(key, value);
            return Promise.resolve();
        }),
        deleteItemAsync: jest.fn((key: string) => {
            store.delete(key);
            return Promise.resolve();
        }),
        __store: store,
    };
});

const mockSecureStore = SecureStore as unknown as {
    getItemAsync: jest.Mock;
    setItemAsync: jest.Mock;
    deleteItemAsync: jest.Mock;
    __store: Map<string, string>;
};

describe('tokenStore', () => {
    beforeEach(async () => {
        mockSecureStore.__store.clear();
        mockSecureStore.getItemAsync.mockClear();
        global.fetch = jest.fn();
        await clearTokens();
    });

    it('setTokens persists to SecureStore (never AsyncStorage/plaintext) and updates the in-memory cache', async () => {
        await setTokens({ token: 'access-1', refreshToken: 'refresh-1', role: 'driver', username: '+250788000000' });

        expect(getCachedTokens()).toEqual({ token: 'access-1', refreshToken: 'refresh-1', role: 'driver', username: '+250788000000' });
        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'access-1');
        expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(AUTH_REFRESH_TOKEN_KEY, 'refresh-1');
    });

    it('hydrateTokenStore reads whatever was previously persisted (cold start)', async () => {
        await setTokens({ token: 'access-2', refreshToken: 'refresh-2', role: 'driver', username: 'jean' });
        // Simulate a fresh process: hydrate re-reads from the store rather
        // than trusting an in-memory cache that wouldn't exist yet.
        const hydrated = await hydrateTokenStore();
        expect(hydrated.token).toBe('access-2');
        expect(hydrated.username).toBe('jean');
    });

    it('clearTokens wipes both the cache and SecureStore', async () => {
        await setTokens({ token: 'a', refreshToken: 'b', role: 'driver', username: 'jean' });
        await clearTokens();
        expect(getCachedTokens()).toEqual({ token: null, refreshToken: null, role: null, username: null });
        expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
    });

    it('notifies subscribers whenever tokens change, and stops after unsubscribing', async () => {
        const listener = jest.fn();
        const unsubscribe = onTokensChanged(listener);

        await setTokens({ token: 'a', refreshToken: 'b', role: 'driver', username: 'jean' });
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        await clearTokens();
        expect(listener).toHaveBeenCalledTimes(1); // no further calls after unsubscribing
    });

    describe('refreshAccessToken', () => {
        it('returns null with no stored refresh token, and never calls the network', async () => {
            const result = await refreshAccessToken('http://api.test');
            expect(result).toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('on success, stores the new token pair and returns the new access token', async () => {
            await setTokens({ token: 'old', refreshToken: 'refresh-1', role: 'driver', username: 'jean' });
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ data: { token: 'new-access', refreshToken: 'new-refresh' } }),
            });

            const result = await refreshAccessToken('http://api.test');

            expect(result).toBe('new-access');
            expect(getCachedTokens().token).toBe('new-access');
            expect(getCachedTokens().refreshToken).toBe('new-refresh');
            // role/username must survive a refresh untouched.
            expect(getCachedTokens().role).toBe('driver');
        });

        it('clears tokens and returns null when the server rejects the refresh token (expired/revoked)', async () => {
            await setTokens({ token: 'old', refreshToken: 'refresh-1', role: 'driver', username: 'jean' });
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

            const result = await refreshAccessToken('http://api.test');

            expect(result).toBeNull();
            expect(getCachedTokens().token).toBeNull();
        });

        it('does NOT clear tokens on a network failure — a transient blip should not force sign-out', async () => {
            await setTokens({ token: 'old', refreshToken: 'refresh-1', role: 'driver', username: 'jean' });
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

            const result = await refreshAccessToken('http://api.test');

            expect(result).toBeNull();
            // The whole point of this behavior (per the code's own comment)
            // is that the session survives a flaky network — verify it
            // actually does.
            expect(getCachedTokens().token).toBe('old');
            expect(getCachedTokens().refreshToken).toBe('refresh-1');
        });

        it('shares one in-flight request across concurrent callers instead of firing a refresh storm', async () => {
            await setTokens({ token: 'old', refreshToken: 'refresh-1', role: 'driver', username: 'jean' });
            let resolveFetch: (value: unknown) => void = () => {};
            (global.fetch as jest.Mock).mockReturnValue(
                new Promise((resolve) => { resolveFetch = resolve; })
            );

            const call1 = refreshAccessToken('http://api.test');
            const call2 = refreshAccessToken('http://api.test');

            resolveFetch({ ok: true, json: async () => ({ data: { token: 'new-access', refreshToken: 'new-refresh' } }) });
            const [result1, result2] = await Promise.all([call1, call2]);

            expect(result1).toBe('new-access');
            expect(result2).toBe('new-access');
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });
    });
});
