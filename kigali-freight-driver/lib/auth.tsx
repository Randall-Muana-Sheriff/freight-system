import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { loginDriver, logoutDriver, registerDriver, API_BASE } from './api';
import { flushOfflineQueue, getOfflineQueueCount } from './offlineQueue';
import { registerPushTokenWithBackend } from './pushNotifications';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from './locationTracking';
import {
  hydrateTokenStore,
  setTokens as persistTokens,
  clearTokens as clearPersistedTokens,
  onTokensChanged,
  refreshAccessToken,
  getCachedTokens,
  AUTH_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_ROLE_KEY,
  AUTH_USER_KEY,
} from './tokenStore';

type AuthState = {
  token: string | null;
  role: string | null;
  username: string | null;
  isReady: boolean;
  pendingSyncCount: number;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export { AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, AUTH_ROLE_KEY, AUTH_USER_KEY };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const refreshPendingCount = async () => {
    const count = await getOfflineQueueCount();
    setPendingSyncCount(count);
  };

  const tryFlushOfflineQueue = async (currentToken: string | null) => {
    if (!currentToken) return;
    try {
      await flushOfflineQueue(currentToken);
      await refreshPendingCount();
    } catch {
      // Ignore flush failures here; the queue is retried on the next app
      // foreground event or sign-in so a transient failure shouldn't block
      // hydration or surface as a sign-in error.
    }
  };

  // Keeps React state in sync with tokenStore even when a refresh happens
  // silently inside apiFetch, deep inside some unrelated screen's request -
  // without this, the UI would keep holding the now-stale access token in
  // its own state until the next full app reload.
  useEffect(() => {
    const unsubscribe = onTokensChanged((tokens) => {
      setToken(tokens.token);
      setRole(tokens.role);
      setUsername(tokens.username);
      if (!tokens.token) {
        // A silent refresh failure (refresh token itself expired/revoked)
        // clears the store - mirror that as a real, visible sign-out
        // rather than leaving the UI in a half-authenticated limbo state.
        stopBackgroundLocationTracking();
        setPendingSyncCount(0);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      const stored = await hydrateTokenStore();

      // A stored access token from a previous session is almost always
      // stale by the time the app reopens (15-minute lifetime) - proactively
      // refresh on cold start rather than waiting for the first API call to
      // 401 and self-heal, so the very first screen render already has a
      // valid token.
      let activeToken = stored.token;
      if (stored.refreshToken) {
        const refreshed = await refreshAccessToken(API_BASE);
        if (refreshed) activeToken = refreshed;
      }

      const current = getCachedTokens();
      setToken(activeToken);
      setRole(current.role);
      setUsername(current.username);
      await refreshPendingCount();

      if (activeToken) {
        await tryFlushOfflineQueue(activeToken);
        registerPushTokenWithBackend(activeToken);
        startBackgroundLocationTracking();
      }
      setIsReady(true);
    };

    hydrate();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active' && token) {
        await tryFlushOfflineQueue(token);
      }
    });

    return () => subscription.remove();
  }, [token]);

  const signIn = async (nextUsername: string, password: string) => {
    const result = await loginDriver(nextUsername, password);
    await persistTokens({
      token: result.token,
      refreshToken: result.refreshToken,
      role: result.role || 'driver',
      username: nextUsername,
    });
    setToken(result.token);
    setRole(result.role || 'driver');
    setUsername(nextUsername);
    await refreshPendingCount();
    await tryFlushOfflineQueue(result.token);
    registerPushTokenWithBackend(result.token);
    startBackgroundLocationTracking();
  };

  // Registration returns the same token pair as login, so a new driver is
  // signed in immediately rather than being sent back to a login screen
  // right after creating their account.
  const signUp = async (nextUsername: string, password: string) => {
    const result = await registerDriver(nextUsername, password);
    await persistTokens({
      token: result.token,
      refreshToken: result.refreshToken,
      role: result.role || 'driver',
      username: nextUsername,
    });
    setToken(result.token);
    setRole(result.role || 'driver');
    setUsername(nextUsername);
    await refreshPendingCount();
    await tryFlushOfflineQueue(result.token);
    registerPushTokenWithBackend(result.token);
    startBackgroundLocationTracking();
  };

  const signOut = async () => {
    await stopBackgroundLocationTracking();
    const { refreshToken } = getCachedTokens();
    await logoutDriver(refreshToken);
    await clearPersistedTokens();
    setToken(null);
    setRole(null);
    setUsername(null);
    setPendingSyncCount(0);
  };

  const value = useMemo(
    () => ({ token, role, username, isReady, pendingSyncCount, signIn, signUp, signOut }),
    [token, role, username, isReady, pendingSyncCount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
