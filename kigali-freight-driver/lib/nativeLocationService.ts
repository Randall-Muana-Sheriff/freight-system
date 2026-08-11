import { NativeModules, Platform } from 'react-native';

// Bridge to the native Android foreground service (see
// plugins/native-location/LocationForegroundService.kt.template).
//
// It exists because expo-location's background task proved unreliable on
// real devices: the periodic registration is sometimes never created at
// the OS level at all, silently, while the app still reports tracking as
// active. The native service polls location on its own timer using the
// one-shot API that never failed in testing, and keeps running with the
// app closed.
//
// iOS has no equivalent here — startBackgroundLocationTracking() keeps
// using expo-location there, where this failure mode wasn't observed.
const { InziraLocationService } = NativeModules as {
  InziraLocationService?: {
    start: (apiBase: string, accessToken: string, refreshToken: string) => Promise<boolean>;
    updateToken: (accessToken: string, refreshToken: string) => Promise<boolean>;
    stop: () => Promise<boolean>;
  };
};

// False on iOS, and on any Android build made before the config plugin was
// added — callers fall back to the expo-location path rather than assuming
// the module is there.
export const isNativeLocationServiceAvailable =
  Platform.OS === 'android' && !!InziraLocationService;

export async function startNativeLocationService(
  apiBase: string,
  accessToken: string,
  refreshToken: string
): Promise<boolean> {
  if (!InziraLocationService) return false;
  try {
    await InziraLocationService.start(apiBase, accessToken, refreshToken);
    return true;
  } catch (err) {
    console.warn('Failed to start native location service:', err);
    return false;
  }
}

// Keeps the service's stored credentials in step with the JS side after a
// foreground refresh, so the service rarely has to refresh on its own.
export async function updateNativeLocationServiceToken(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  if (!InziraLocationService) return;
  try {
    await InziraLocationService.updateToken(accessToken, refreshToken);
  } catch (err) {
    console.warn('Failed to update native location service token:', err);
  }
}

export async function stopNativeLocationService(): Promise<void> {
  if (!InziraLocationService) return;
  try {
    await InziraLocationService.stop();
  } catch (err) {
    console.warn('Failed to stop native location service:', err);
  }
}
