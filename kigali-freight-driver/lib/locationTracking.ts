import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from './api';

// Same key used by auth.tsx and tokenStore.ts — duplicated here to avoid a
// require cycle through tokenStore (which metro detects as a cycle because
// auth.tsx also imports from tokenStore and from this file).
const AUTH_TOKEN_KEY = 'kigali_freight_driver_token';

export const LOCATION_TASK_NAME = 'kigali-freight-driver-background-location';

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

  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  if (!token) {
    // Signed out since the task was registered — nothing to report against.
    return;
  }

  const { latitude, longitude, speed } = latest.coords;
  // GPS speed comes in meters/second; convert to km/h. Some devices report
  // a negative or null speed when stationary/no fix — omit it in that case
  // and let the backend fall back to its own estimate.
  const speedKmh = typeof speed === 'number' && speed >= 0 ? speed * 3.6 : undefined;

  try {
    await fetch(`${API_BASE}/api/fleet/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lat: latitude, lng: longitude, speedKmh }),
    });
  } catch (err) {
    // No network / backend unreachable — this ping is simply lost rather
    // than queued for retry. Unlike order status updates or incident
    // reports, a single missed GPS ping isn't worth the complexity of an
    // offline queue: another one follows within the tracking interval.
    console.warn('Failed to report background telemetry:', err);
  }
});

export async function startBackgroundLocationTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (alreadyStarted) return;

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
        notificationTitle: 'Kigali Freight Driver',
        notificationBody: 'Sharing your location with dispatch during your active shift.',
        notificationColor: '#0F6FFF',
      },
    });
  } catch (err) {
    // Seen in practice on a freshly-installed app: the native module can
    // throw (e.g. a NullPointerException reading its own SharedPreferences)
    // the very first time this runs after install, before Android has
    // finished setting up the app's private storage. This call is
    // fire-and-forget from every caller (sign-in, hydrate) specifically so
    // a location subsystem hiccup can never block login or crash the app —
    // surfacing the failure here, not throwing, is what makes that true.
    console.warn('Failed to start background location tracking:', err);
  }
}

export async function stopBackgroundLocationTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (!alreadyStarted) return;
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
}

// Diagnostic snapshot for a "why isn't my location showing up" screen —
// surfaces exactly what the background task can't: whether it's actually
// registered and what permission state it's running under, without relying
// on console output reaching a connected Metro session.
export async function getTrackingDiagnostics() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  return {
    hasStarted,
    foregroundStatus: foreground.status,
    backgroundStatus: background.status,
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
    const speedKmh = typeof speed === 'number' && speed >= 0 ? speed * 3.6 : undefined;

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
