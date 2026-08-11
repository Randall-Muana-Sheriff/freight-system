import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './api';
import { refreshAccessToken, AUTH_TOKEN_KEY, getCachedTokens } from './tokenStore';
import {
  isNativeLocationServiceAvailable,
  startNativeLocationService,
  stopNativeLocationService,
} from './nativeLocationService';

export const LOCATION_TASK_NAME = 'kigali-freight-driver-background-location';

// Phone GPS derives speed from Doppler shift / consecutive fixes, which has
// a real noise floor — a phone sitting dead still on a table routinely
// reports 1-7 km/h of phantom "speed" from that jitter alone, worse indoors
// where multipath reflections degrade the fix further. A stationary truck
// never legitimately reads under this threshold while moving, so clamping
// anything below it to 0 removes the noise without hiding real movement.
const STATIONARY_SPEED_DEADBAND_KMH = 5;

// Matches the background task's own timeInterval so the dispatcher map
// sees the same cadence whether the feed is coming from the OS-scheduled
// task or the foreground watchdog below.
const FOREGROUND_WATCHDOG_INTERVAL_MS = 15000;

function toStableSpeedKmh(speed: number | null | undefined): number | undefined {
  if (typeof speed !== 'number' || speed < 0) return undefined;
  const kmh = speed * 3.6;
  return kmh < STATIONARY_SPEED_DEADBAND_KMH ? 0 : kmh;
}

type LocationTaskData = {
  locations: Array<{
    coords: {
      latitude: number;
      longitude: number;
      speed: number | null; // meters per second, from GPS
    };
  }>;
};

// This must be defined at module scope (not inside a component or hook) —
// Expo's TaskManager re-registers this callback whenever the app process is
// woken up to handle a background location update, including cases where
// the app was fully killed and the OS is launching it just for this task.
// Because of that, we can't rely on React context (useAuth()) being
// available here — we read the auth token directly from SecureStore using
// the same key auth.tsx writes to.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as LocationTaskData;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  let token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (!token) {
    // Signed out since the task was registered — nothing to report against.
    return;
  }

  const { latitude, longitude, speed } = latest.coords;
  const speedKmh = toStableSpeedKmh(speed);

  const postTelemetry = (bearerToken: string) =>
    fetch(`${API_BASE}/api/fleet/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ lat: latitude, lng: longitude, speedKmh }),
    });

  try {
    // The 15-minute access token expiring mid-shift is routine, not an
    // error — this task ran on a raw fetch with no refresh path at all,
    // so once the token expired every single ping silently failed
    // (backend returns 403, not 401, for an expired JWT) until the driver
    // happened to reopen the app and something else triggered a refresh.
    // The marker going stale on the dispatcher map an hour into a shift,
    // despite the phone genuinely being online the whole time, traced
    // straight back to this.
    //
    // refreshAccessToken() is the SAME single-flight-guarded function the
    // rest of the app uses (via apiFetch) — this used to be a separate,
    // independent implementation, which meant a foreground refresh and a
    // background one could race on the same single-use refresh token: the
    // loser was left holding a token that could never work again, and kept
    // retrying every 15s forever, hammering /api/auth/refresh hard enough
    // to trip the login rate limit. Sharing one guarded implementation
    // makes that race structurally impossible instead of just backing off
    // after the fact.
    let response = await postTelemetry(token);
    if (response.status === 401 || response.status === 403) {
      const refreshed = await refreshAccessToken(API_BASE);
      if (refreshed) {
        token = refreshed;
        response = await postTelemetry(token);
      }
    }
    if (!response.ok) {
      console.warn('Background telemetry rejected:', response.status);
    }
  } catch (err) {
    // No network / backend unreachable — this ping is simply lost rather
    // than queued for retry. Unlike order status updates or incident
    // reports, a single missed GPS ping isn't worth the complexity of an
    // offline queue: another one follows within the tracking interval.
    console.warn('Failed to report background telemetry:', err);
  }
});

// Android only. Separated out because the native service has its own
// lifecycle independent of the expo-location task — it must still be
// (re)started when the task is already registered, which is the normal
// case on every app relaunch. Starting it is idempotent: onStartCommand
// no-ops if the timer is already running.
async function startNativeServiceIfPossible() {
  if (!isNativeLocationServiceAvailable) return;
  const { token, refreshToken } = getCachedTokens();
  if (!token || !refreshToken) return;
  await startNativeLocationService(API_BASE, token, refreshToken);
}

export async function startBackgroundLocationTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) {
    // Permissions were necessarily granted when the task was first
    // registered, so the native service is safe to start straight away.
    await startNativeServiceIfPossible();
    return;
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    console.warn('Foreground location permission not granted — cannot start tracking.');
    return;
  }

  // Background permission must be requested after foreground is already
  // granted — this is a hard platform requirement on both iOS and Android.
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    console.warn('Background location permission not granted — tracking will only work while the app is open.');
    // Fall through anyway: startLocationUpdatesAsync still works in the
    // foreground even without background permission, it just stops once
    // the app is backgrounded/killed instead of continuing.
  }

  await attemptStartLocationUpdates();

  // Runs alongside the expo-location task, not instead of it: the task is
  // what iOS uses, and on Android it costs nothing when it does fire. Both
  // post to the same endpoint and the combined worst case stays inside the
  // telemetry rate limit.
  await startNativeServiceIfPossible();
}

// Seen in practice on a freshly-installed app AND on a cold launch right
// after a phone reboot: the native module can throw a NullPointerException
// reading its own SharedPreferences the first time this runs, because
// Android hasn't finished attaching the module's application context yet.
// It's a brief startup race, not a real permission or registration
// failure — retrying after a short pause reliably succeeds once the module
// finishes initializing, instead of silently leaving tracking off for the
// rest of the session.
async function attemptStartLocationUpdates(retriesLeft = 2): Promise<void> {
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000, // 15s — frequent enough for a live dispatcher map without draining the battery
      // 0, not a distance filter: a driver parked at a hub or stuck in
      // traffic hasn't moved, but is still very much online — a nonzero
      // value here means the OS simply never fires a callback while
      // stationary, no matter how long the wait, which the dispatcher
      // dashboard's "stale after 2min" check then misreads as offline.
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true, // iOS: the blue status bar pill while tracking in background
      foregroundService: {
        notificationTitle: 'Inzira Driver',
        notificationBody: 'Sharing your location with dispatch during your active shift.',
        notificationColor: '#0F6FFF',
      },
    });
  } catch (err) {
    if (retriesLeft > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return attemptStartLocationUpdates(retriesLeft - 1);
    }
    // This call is fire-and-forget from every caller (sign-in, hydrate)
    // specifically so a location subsystem hiccup can never block login or
    // crash the app — surfacing the failure here, not throwing, is what
    // makes that true.
    console.warn('Failed to start background location tracking:', err);
  }
}

export async function stopBackgroundLocationTracking() {
  // Unconditionally — and first. The native service must stop even when
  // the expo-location task was never running (the early return below), or
  // ending a shift would leave it reporting a driver who has clocked off.
  await stopNativeLocationService();

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (!alreadyStarted) return;
  try {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (err) {
    // Same native SharedPreferences startup race as
    // attemptStartLocationUpdates can hit this too — e.g. onTokensChanged
    // firing an initial "no token yet" event while hydrate() is still
    // loading the stored token, before anything was really running. This
    // is called fire-and-forget in several places (auth.tsx), so it must
    // never throw an unhandled rejection.
    console.warn('Failed to stop background location tracking:', err);
  }
}

// A 15s foreground poll that duplicates what the background task is
// *supposed* to do, using the one code path that proved completely
// reliable: a direct one-shot getCurrentPositionAsync().
//
// Why this exists: the background task registered via
// startLocationUpdatesAsync() hands scheduling to Android's
// FusedLocationProviderClient, and on at least some devices it silently
// never fires — sometimes the periodic registration isn't even created at
// the OS level (confirmed via `adb shell dumpsys location`), with no error
// observable from JS, while the app's own diagnostics still read
// "Active". Across hours of testing, that path produced anywhere from
// clean 18-minute runs to total silence, unpredictably; a one-shot
// request in the same conditions succeeded every single time.
//
// This deliberately does NOT replace the background task — it runs
// alongside it, so a driver with the app open gets a dependable feed, and
// the background task still covers the app-closed case for whatever it
// does manage to deliver. Combined worst case is 2 posts/15s = 120 per
// 15min, inside the telemetry endpoint's 150/15min limit.
export function useForegroundTelemetryWatchdog(token: string | null) {
  useEffect(() => {
    if (!token) return;
    // Redundant wherever the native foreground service runs — that service
    // covers the foreground case too, and running both put two posts on
    // the wire every 15s (~120 per 15min against a 150 limit) for no gain.
    // This stays as the fallback for iOS and for any Android build made
    // before the native module existed.
    if (isNativeLocationServiceAvailable) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      // Only while actually on shift — the shift toggle is what registers
      // the background task, so this mirrors it rather than inventing a
      // second, separate notion of "tracking is on".
      const onShift = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      if (!onShift || cancelled) return;

      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;

        const { latitude, longitude, speed } = position.coords;
        const body = JSON.stringify({ lat: latitude, lng: longitude, speedKmh: toStableSpeedKmh(speed) });
        const post = (bearer: string) =>
          fetch(`${API_BASE}/api/fleet/telemetry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
            body,
          });

        let response = await post(token);
        // Same 401-or-403 handling as the background task: the backend
        // returns 403 for an expired JWT, not 401.
        if (response.status === 401 || response.status === 403) {
          const refreshed = await refreshAccessToken(API_BASE);
          if (refreshed && !cancelled) {
            response = await post(refreshed);
          }
        }
        if (!response.ok && response.status !== 429) {
          console.warn('Foreground telemetry rejected:', response.status);
        }
      } catch {
        // Offline or no fix available right now — the next tick retries in
        // 15s, same "a single lost ping isn't worth queueing" tradeoff the
        // background task already makes.
      }
    };

    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, FOREGROUND_WATCHDOG_INTERVAL_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    // Paused while backgrounded: this is explicitly the foreground safety
    // net, and letting it keep firing would just burn battery racing a
    // background task that the OS may or may not also be running.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    if (AppState.currentState === 'active') start();

    return () => {
      cancelled = true;
      stop();
      subscription.remove();
    };
  }, [token]);
}

// Diagnostic snapshot for a "why isn't my location showing up" screen —
// surfaces exactly what the background task can't: whether it's actually
// registered and what permission state it's running under, without relying
// on console output reaching a connected Metro session.
export async function getTrackingDiagnostics() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  // Distinct from both permission checks above: a driver can grant "Allow
  // all the time" and still have the device's GPS/Location toggle itself
  // switched off at the OS level (Settings, not app permissions) — in that
  // state `hasStarted` stays true and both permissions read "granted," so
  // without this check tracking looks completely healthy in the app while
  // silently sending nothing, which is exactly what happened here: it took
  // a manual check of the phone's system settings to find it.
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
  return {
    hasStarted,
    foregroundStatus: foreground.status,
    backgroundStatus: background.status,
    servicesEnabled,
  };
}

// Takes one immediate GPS reading and reports it right now, independent of
// the 15s/25m background task — for confirming the whole path (permission →
// GPS fix → network → backend) works, without waiting on the task's own
// timing/movement thresholds.
export async function sendTestLocationPing(
  token: string
): Promise<{ ok: true; lat: number; lng: number } | { ok: false; error: string }> {
  try {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      return { ok: false, error: 'Location permission is not granted.' };
    }

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude, speed } = position.coords;
    const speedKmh = toStableSpeedKmh(speed);

    const response = await fetch(`${API_BASE}/api/fleet/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: latitude, lng: longitude, speedKmh }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { ok: false, error: body?.error?.message || `Server rejected the ping (status ${response.status}).` };
    }

    return { ok: true, lat: latitude, lng: longitude };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error while sending the test ping.' };
  }
}
