import { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { AuthProvider } from '../lib/auth';
import { theme } from '../lib/theme';
import { initCrashReporting } from '../lib/crashReporting';
import ErrorBoundary from '../components/ErrorBoundary';

// Held visible until the design system's real fonts (Outfit/DM Sans/DM
// Mono) are loaded — without this, the very first frame would flash in the
// OS default font before swapping, which reads as a glitch on a screen this
// typography-led.
SplashScreen.preventAutoHideAsync();

// Runs once at module load, before the first render — a no-op until
// EXPO_PUBLIC_SENTRY_DSN is set (see lib/crashReporting.ts).
initCrashReporting();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_800ExtraBold,
    Outfit_900Black,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  // Android edge-to-edge draws app content over/under the system bars —
  // any screen whose root view doesn't reach the exact true screen edge
  // lets the OS's own default (light) window background show through as a
  // visible strip. Setting the native root background once here means any
  // such gap shows the correct dark navy instead of white, regardless of
  // which screen or layout quirk causes it.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.bg);
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <AuthProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
