import * as SecureStore from 'expo-secure-store';

export const AUTH_TOKEN_KEY = 'kigali_freight_driver_token';
export const AUTH_REFRESH_TOKEN_KEY = 'kigali_freight_driver_refresh_token';
export const AUTH_ROLE_KEY = 'kigali_freight_driver_role';
export const AUTH_USER_KEY = 'kigali_freight_driver_username';

export type TokenSet = {
  token: string | null;
  refreshToken: string | null;
  role: string | null;
  username: string | null;
};

// In-memory cache so apiFetch can read/write synchronously without an
// awkward await on every single request - SecureStore is still the source
// of truth on cold start (see hydrate()), this is just a fast mirror of it.
let cache: TokenSet = { token: null, refreshToken: null, role: null, username: null };

// apiFetch (in api.ts) needs to trigger a refresh from deep inside a fetch
// call, entirely outside React's render cycle - this pub-sub is how that
// change gets back to auth.tsx's React state without a circular import
// between api.ts and auth.tsx.
type Listener = (tokens: TokenSet) => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener(cache));
}

export function onTokensChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function hydrateTokenStore(): Promise<TokenSet> {
  const [token, refreshToken, role, username] = await Promise.all([
    SecureStore.getItemAsync(AUTH_TOKEN_KEY),
    SecureStore.getItemAsync(AUTH_REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(AUTH_ROLE_KEY),
    SecureStore.getItemAsync(AUTH_USER_KEY),
  ]);
  cache = { token, refreshToken, role, username };
  return cache;
}

export async function setTokens(next: { token: string; refreshToken: string; role: string; username: string }) {
  cache = { ...next };
  await Promise.all([
    SecureStore.setItemAsync(AUTH_TOKEN_KEY, next.token),
    SecureStore.setItemAsync(AUTH_REFRESH_TOKEN_KEY, next.refreshToken),
    SecureStore.setItemAsync(AUTH_ROLE_KEY, next.role),
    SecureStore.setItemAsync(AUTH_USER_KEY, next.username),
  ]);
  notify();
}

// Updates just the access/refresh token pair after a silent refresh,
// leaving role/username untouched.
async function setRefreshedTokens(token: string, refreshToken: string) {
  cache = { ...cache, token, refreshToken };
  await Promise.all([
    SecureStore.setItemAsync(AUTH_TOKEN_KEY, token),
    SecureStore.setItemAsync(AUTH_REFRESH_TOKEN_KEY, refreshToken),
  ]);
  notify();
}

export async function clearTokens() {
  cache = { token: null, refreshToken: null, role: null, username: null };
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_TOKEN_KEY),
    SecureStore.deleteItemAsync(AUTH_REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(AUTH_ROLE_KEY),
    SecureStore.deleteItemAsync(AUTH_USER_KEY),
  ]);
  notify();
}

export function getCachedTokens(): TokenSet {
  return cache;
}

// Prevents concurrent requests that all 401 at once from each independently
// kicking off their own refresh call - they share one in-flight promise.
let refreshInFlight: Promise<string | null> | null = null;

// Exchanges the stored refresh token for a new access token. Returns the
// new access token, or null if the refresh token itself is no longer
// valid (expired/revoked) - callers should treat null as "force sign out."
export async function refreshAccessToken(apiBase: string): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const currentRefreshToken = cache.refreshToken;
    if (!currentRefreshToken) return null;

    // Runs on every cold start whenever a refresh token is stored — a
    // hanging (not just failing) network request here would leave the app
    // stuck on the boot loading screen forever, since nothing downstream
    // ever calls setIsReady(true). Same 10s-timeout pattern as api.ts.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await clearTokens();
        return null;
      }

      const payload = await response.json();
      const data = payload?.data ?? payload;
      if (!data?.token || !data?.refreshToken) {
        await clearTokens();
        return null;
      }

      await setRefreshedTokens(data.token, data.refreshToken);
      return data.token;
    } catch {
      // Network failure (or our own timeout) during refresh: don't clear
      // tokens - this might be a transient connectivity blip, not an
      // actually-invalid session. The caller's original request will still
      // fail, which is correct; we just don't want a flaky network to force
      // a real sign-out.
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
