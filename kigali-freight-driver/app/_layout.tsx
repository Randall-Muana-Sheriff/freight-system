import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Archivo_900Black } from '@expo-google-fonts/archivo';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { AuthProvider } from '../lib/auth';
import { theme } from '../lib/theme';
import { initCrashReporting } from '../lib/crashReporting';
import ErrorBoundary from '../components/ErrorBoundary';
import BrandEntry from '../components/BrandEntry';

// Held visible until the design system's real fonts (Archivo/Inter/IBM Plex
// Mono) are loaded — without this, the very first frame would flash in the
// OS default font before swapping, which reads as a glitch on a screen this
// typography-led.
SplashScreen.preventAutoHideAsync();

// Runs once at module load, before the first render — a no-op until
// EXPO_PUBLIC_SENTRY_DSN is set (see lib/crashReporting.ts).
initCrashReporting();

// The brand entry belongs to a cold start, not to this component's
// lifecycle: a remount from expo-router — or a fast refresh mid-shift —
// must land straight on the app rather than replaying the animation over
// a screen the driver was already using. Module scope outlives the
// component and is reset only by the process itself, which is exactly the
// span "once per launch" means.
let entryPlayed = false;

export default function RootLayout() {
  const [entryDone, setEntryDone] = useState(entryPlayed);
  const [fontsLoaded] = useFonts({
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
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
            {/* Laid over the app rather than shown before it, so the
                first screen is mounted, laid out and settled behind the
                entry — the reveal lands on a finished screen instead of
                on a spinner. */}
            {entryDone ? null : (
              <BrandEntry
                onDone={() => {
                  entryPlayed = true;
                  setEntryDone(true);
                }}
              />
            )}
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
