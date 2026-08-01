import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { setDriverPin, loginDriverPin, logoutDriver, API_BASE, type DriverAuthTokens } from './api';
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
  getBiometricEnabled,
  setBiometricEnabled as persistBiometricEnabled,
  setRememberedPhone,
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
  biometricEnabled: boolean;
  // The two flow-completing calls — everything upstream of these (phone
  // entry, OTP, invite code) is stateless from the session's point of view
  // and lives entirely in components/auth/AuthFlow.tsx's own local state.
  completePinSetup: (otpSessionToken: string, pin: string, phone: string) => Promise<void>;
  loginWithPin: (otpSessionToken: string, pin: string, phone: string) => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  signOut: () => Promise<void>;
};

export { AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, AUTH_ROLE_KEY, AUTH_USER_KEY };

const AuthContext = createContext<AuthState | null>(null);

// SECURITY POLICY (deliberate, not a bug — read before "fixing" this):
// Biometric unlock is purely local — it never talks to the backend. It just
// gates whether the app is allowed to silently restore a still-valid
// session on cold start (below), by standing in front of the refresh-token
// exchange that already happens unconditionally today. It FAILS OPEN on
// any unexpected hardware/API error (missing hardware, no enrolled
// biometric, the native module not being present in this build, a native
// exception) rather than locking a driver out of their own session.
//
// Why this is an acceptable risk, not an oversight: biometric here is a
// convenience layer on top of an already-secure PIN-based session — a
// device without working biometric hardware/enrollment falls back to
// exactly the security posture every driver already has by default (a
// valid refresh token silently restores the session, same as if
// biometric-gating were never enabled at all). It does not weaken the PIN
// itself, the OTP flow, or server-side session validity. The alternative
// (fail CLOSED) would force a driver into a full phone -> OTP -> PIN
// re-login every time this native call throws, on hardware/OS
// combinations the team doesn't fully control — an availability cost paid
// on every affected device, for a security property (biometric
// specifically, as opposed to PIN) that was opt-in and cosmetic to begin
// with. Revisit this only as a conscious policy change, not a "fix."
//
// Imported dynamically (not at module scope) on purpose: expo-local-
// authentication is a native module, and a dev-client build made before it
// was added won't have it compiled in. A static top-level import throws
// during module evaluation — outside any try/catch — which would crash the
// entire app on launch (this file is imported by the root layout). A
// dynamic import here defers that failure until this function actually
// runs, where the catch below can handle it.
async function confirmBiometric(): Promise<boolean> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hasHardware || !isEnrolled) return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Kigali Freight',
      cancelLabel: 'Use PIN instead',
    });
    return result.success;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

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
      const biometricOn = await getBiometricEnabled();
      setBiometricEnabledState(biometricOn);

      let activeToken: string | null = null;

      if (stored.refreshToken) {
        // A stored access token from a previous session is almost always
        // stale by the time the app reopens (15-minute lifetime) -
        // proactively refresh on cold start rather than waiting for the
        // first API call to fail and self-heal. When biometric unlock is
        // on, that refresh only happens after it succeeds — otherwise the
        // still-valid refresh token would make biometric pure theater.
        const allowedToRestore = biometricOn ? await confirmBiometric() : true;
        if (allowedToRestore) {
          activeToken = stored.token;
          const refreshed = await refreshAccessToken(API_BASE);
          if (refreshed) activeToken = refreshed;
        }
      }

      const current = getCachedTokens();
      setToken(activeToken);
      setRole(activeToken ? current.role : null);
      setUsername(activeToken ? current.username : null);
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

  // Shared by both flow-completing steps below — from here on, a driver's
  // `username` (for every existing FK/JWT that already keys off it) is
  // their phone number, exactly as the backend's invite endpoint set it up.
  const finalizeSession = async (phone: string, tokens: DriverAuthTokens) => {
    await persistTokens({
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      role: tokens.role || 'driver',
      username: phone,
    });
    await setRememberedPhone(phone);
    setToken(tokens.token);
    setRole(tokens.role || 'driver');
    setUsername(phone);
    await refreshPendingCount();
    await tryFlushOfflineQueue(tokens.token);
    registerPushTokenWithBackend(tokens.token);
    startBackgroundLocationTracking();
  };

  const completePinSetup = async (otpSessionToken: string, pin: string, phone: string) => {
    const tokens = await setDriverPin(otpSessionToken, pin);
    await finalizeSession(phone, tokens);
  };

  const loginWithPin = async (otpSessionToken: string, pin: string, phone: string) => {
    const tokens = await loginDriverPin(otpSessionToken, pin);
    await finalizeSession(phone, tokens);
  };

  const enableBiometric = async () => {
    await persistBiometricEnabled(true);
    setBiometricEnabledState(true);
  };

  const disableBiometric = async () => {
    await persistBiometricEnabled(false);
    setBiometricEnabledState(false);
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
    () => ({
      token,
      role,
      username,
      isReady,
      pendingSyncCount,
      biometricEnabled,
      completePinSetup,
      loginWithPin,
      enableBiometric,
      disableBiometric,
      signOut,
    }),
    [token, role, username, isReady, pendingSyncCount, biometricEnabled]
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
