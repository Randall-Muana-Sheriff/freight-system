import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { setDriverPin, loginDriverPin, logoutDriver, API_BASE, type DriverAuthTokens } from './api';
import {
  flushOfflineQueue,
  getOfflineQueueCount,
  getRejectedActions,
  retryRejectedAction,
  discardRejectedAction,
  sweepAgedRejections,
  type RejectedDriverAction,
} from './offlineQueue';
import { registerPushTokenWithBackend } from './pushNotifications';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from './locationTracking';
import { updateNativeLocationServiceToken } from './nativeLocationService';
import { fireAndForget } from './fireAndForget';
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
  // Work the server refused outright, which will never send however long the
  // driver waits. Kept apart from pendingSyncCount because the two mean
  // opposite things to a driver: pending resolves itself, rejected needs them.
  // It lives in the session rather than on one screen because the item most
  // likely to be in here is a proof-of-delivery photo, and the driver has to
  // find out wherever they happen to be looking.
  rejectedActions: RejectedDriverAction[];
  // Proactive (NetInfo), not the reactive isNetworkFailure() check in
  // api.ts — that one only learns a request failed after actually
  // attempting it. This is known ahead of time, so the UI can show a
  // persistent indicator instead of only reacting to a failed action.
  isOffline: boolean;
  biometricEnabled: boolean;
  // The two flow-completing calls — everything upstream of these (phone
  // entry, OTP, invite code) is stateless from the session's point of view
  // and lives entirely in components/auth/AuthFlow.tsx's own local state.
  completePinSetup: (otpSessionToken: string, pin: string, phone: string) => Promise<void>;
  loginWithPin: (otpSessionToken: string, pin: string, phone: string) => Promise<void>;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  retryRejected: (id: string) => Promise<void>;
  discardRejected: (id: string) => Promise<void>;
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
      promptMessage: 'Unlock Inzira',
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
  const [rejectedActions, setRejectedActions] = useState<RejectedDriverAction[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);

  const refreshPendingCount = async () => {
    const count = await getOfflineQueueCount();
    setPendingSyncCount(count);
    setRejectedActions(await getRejectedActions());
  };

  const retryRejected = async (id: string) => {
    await retryRejectedAction(id);
    await refreshPendingCount();
    // Straight back out to the server: the driver asked for this, and the
    // most likely reason they did is that they can see it has not arrived.
    if (token) await tryFlushOfflineQueue(token);
  };

  const discardRejected = async (id: string) => {
    await discardRejectedAction(id);
    await refreshPendingCount();
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
        fireAndForget(stopBackgroundLocationTracking(), 'auth: stop tracking after silent refresh failure');
        setPendingSyncCount(0);
      } else if (tokens.refreshToken) {
        // Hand the rotated pair to the native location service so it keeps
        // authenticating without having to run its own refresh — two
        // independent refreshers contending for the same single-use
        // refresh token is exactly the race to avoid.
        fireAndForget(
          updateNativeLocationServiceToken(tokens.token, tokens.refreshToken),
          'auth: hand rotated tokens to the native location service',
        );
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

      // Retire rejections old enough that nobody is coming back for them,
      // and release the photos they were holding. Deliberately a timer rather
      // than a deletion at the moment of refusal.
      await sweepAgedRejections();

      const current = getCachedTokens();
      setToken(activeToken);
      setRole(activeToken ? current.role : null);
      setUsername(activeToken ? current.username : null);
      await refreshPendingCount();

      if (activeToken) {
        await tryFlushOfflineQueue(activeToken);
        fireAndForget(registerPushTokenWithBackend(activeToken), 'auth: register push token on hydrate');
        fireAndForget(startBackgroundLocationTracking(), 'auth: start tracking on hydrate');
      }
      setIsReady(true);
    };

    fireAndForget(hydrate(), 'auth: hydrate session on mount');
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && token) {
        // addEventListener discards whatever the callback returns, so an
        // async one here means a failed flush is thrown away unseen.
        fireAndForget(tryFlushOfflineQueue(token), 'auth: flush offline queue on app foreground');
      }
    });

    return () => subscription.remove();
  }, [token]);

  // Proactive complement to the AppState effect above: that one only
  // catches "the app was backgrounded, then resumed" — a driver who stays
  // on the trip screen the whole time they're in a signal-dead zone would
  // otherwise not get their queue flushed until the next foreground event
  // or their next explicit action. This flushes the moment connectivity
  // actually returns, whether or not the app was ever backgrounded.
  // isInternetReachable can be null while NetInfo is still figuring it
  // out — treated as "assume reachable" (not offline) to avoid flashing a
  // false offline state on every screen transition.
  useEffect(() => {
    let previouslyOffline = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (previouslyOffline && !offline && token) {
        fireAndForget(tryFlushOfflineQueue(token), 'auth: flush offline queue on reconnect');
      }
      previouslyOffline = offline;
    });

    return () => unsubscribe();
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
    fireAndForget(registerPushTokenWithBackend(tokens.token), 'auth: register push token after sign-in');
    fireAndForget(startBackgroundLocationTracking(), 'auth: start tracking after sign-in');
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
    setRejectedActions([]);
  };

  const value = useMemo(
    () => ({
      token,
      role,
      username,
      isReady,
      pendingSyncCount,
      rejectedActions,
      retryRejected,
      discardRejected,
      isOffline,
      biometricEnabled,
      completePinSetup,
      loginWithPin,
      enableBiometric,
      disableBiometric,
      signOut,
    }),
    [token, role, username, isReady, pendingSyncCount, rejectedActions, isOffline, biometricEnabled]
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
