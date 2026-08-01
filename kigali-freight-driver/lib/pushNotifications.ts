import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { registerPushToken } from './api';

// Show notifications with an alert/sound while the app is foregrounded too
// (by default Expo suppresses them when the app is active).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Dispatch alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

// Requests permission and returns the device's native FCM/APNs push token
// (not an Expo push token — the backend sends directly via Firebase Admin).
// Returns null if permission is denied or this isn't a physical device
// (push tokens aren't available on simulators/emulators).
export async function getDevicePushToken(): Promise<{ token: string; platform: string } | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device — skipping registration.');
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const { data } = await Notifications.getDevicePushTokenAsync();
    return { token: data, platform: Platform.OS };
  } catch (err) {
    console.warn('Failed to obtain push token:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function registerPushTokenWithBackend(jwt: string) {
  const result = await getDevicePushToken();
  if (!result) return;

  try {
    await registerPushToken(jwt, result.token, result.platform);
  } catch (err) {
    // Best-effort — a failed push registration shouldn't block anything
    // else in the app (login, viewing assignments, etc.).
    console.warn('Failed to register push token with backend:', err instanceof Error ? err.message : err);
  }
}

// Navigates to the relevant screen when the driver taps a notification.
// Call this once near the app root (after the router is mounted).
export function useNotificationResponseHandler() {
  const router = useRouter();
  const subscriptionRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    subscriptionRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; orderIds?: string } | undefined;
      if (data?.type === 'order-assigned') {
        router.push('/(app)/assignments' as never);
      } else if (data?.type === 'document-status') {
        // Sent on both approval and rejection (see updateDocumentStatus in
        // driverDocumentController.js) — either way, the documents screen
        // is where the driver sees which one it was and what to do next.
        router.push('/(app)/documents' as never);
      }
    });

    return () => {
      subscriptionRef.current?.remove();
    };
  }, [router]);
}
