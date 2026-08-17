import { useMemo } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { useNotificationResponseHandler } from '../../lib/pushNotifications';
import { useForegroundTelemetryWatchdog } from '../../lib/locationTracking';
import { useTabBarMetrics } from '../../lib/tabBarMetrics';

// Two forms of the same five tabs, kept in one list so they cannot drift.
//
// `path` is what usePathname() returns, which omits group segments —
// "/assignments", not "/(app)/assignments". Matching against the href
// form meant every tab except Home scored -1 and the swipe silently did
// nothing there; Home only worked because of a special case for "/".
//
// Matching is exact, so a detail screen like /trip/159 or /documents
// lands on -1 and cannot be swiped off — which is what we want, since
// neither is a tab a driver should be able to slide between.
const TABS = [
  { path: '/', href: '/(app)' },
  { path: '/assignments', href: '/(app)/assignments' },
  { path: '/incidents', href: '/(app)/incidents' },
  { path: '/alerts', href: '/(app)/alerts' },
  { path: '/profile', href: '/(app)/profile' },
];

function TabIcon({ name, color, size }: { name: keyof typeof Ionicons.glyphMap; color: ColorValue; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function AppLayout() {
  const { token, isReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const tabBar = useTabBarMetrics();

  useNotificationResponseHandler();
  useForegroundTelemetryWatchdog(token);

  const currentRouteIndex = useMemo(() => TABS.findIndex((tab) => tab.path === pathname), [pathname]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // Gesture callbacks are worklets on the UI thread by default, and
        // the router is a plain JS function — calling it from there throws
        // "Tried to synchronously call a Remote Function". This has to run
        // on the JS thread, which is fine: it fires once, at the end of a
        // swipe, and does nothing per-frame.
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd((event) => {
          if (currentRouteIndex < 0) return;
          if (Math.abs(event.translationX) < 60 || Math.abs(event.translationY) > 40) return;

          const direction = event.translationX < 0 ? 1 : -1;
          const next = TABS[currentRouteIndex + direction];

          // navigate rather than replace, for the same reason as
          // lib/navigation.ts: replace rewrites the tab state and leaves
          // the back button with nowhere to go but out of the app.
          if (next) {
            router.navigate(next.href as never);
          }
        }),
    [currentRouteIndex, router]
  );

  if (!isReady) {
    return <View style={styles.root} />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    // The swipe wraps the whole navigator rather than sitting in a strip
    // above the tab bar. That strip was a 40px View with
    // pointerEvents="box-only", which swallowed every tap inside it — and
    // it landed exactly on the "Back to jobs" button at the foot of the
    // trip screen, which is why that button did nothing. Anything else
    // placed near the bottom of a screen would have died the same way.
    //
    // Wrapping is safe because the gesture already requires 20px of
    // horizontal movement to activate and fails on 18px of vertical: a tap
    // never activates it and passes straight through, and a scroll hands
    // off to the ScrollView.
    <GestureDetector gesture={swipeGesture}>
    <View style={styles.root}>
      <Tabs
        // Back from any tab lands on Home, and back from Home leaves the
        // app. Without this the navigator exits from whichever tab is
        // showing, so a driver two taps deep is one back button away from
        // being out of the app entirely — measured on device, back from
        // Jobs closed it.
        backBehavior="initialRoute"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: tabBar.totalHeight,
            paddingTop: tabBar.topPadding,
            paddingBottom: tabBar.bottomPadding,
            borderRadius: 0,
            backgroundColor: theme.colors.panel,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            borderWidth: 0,
          },
          tabBarLabelStyle: { ...theme.type.micro, fontFamily: theme.fonts.bodySemiBold },
          tabBarItemStyle: { paddingTop: 0 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <TabIcon name="grid-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="assignments"
          options={{
            title: 'Jobs',
            tabBarIcon: ({ color, size }) => <TabIcon name="briefcase-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="incidents"
          options={{
            title: 'Safety',
            tabBarIcon: ({ color, size }) => <TabIcon name="warning-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="alerts"
          options={{
            title: 'Alerts',
            tabBarIcon: ({ color, size }) => <TabIcon name="notifications-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => <TabIcon name="person-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen name="trip/[id]" options={{ href: null }} />
        <Tabs.Screen name="documents" options={{ href: null }} />
      </Tabs>
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
