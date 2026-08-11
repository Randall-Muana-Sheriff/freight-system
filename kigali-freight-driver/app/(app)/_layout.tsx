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

  const tabRoutes = ['/(app)', '/(app)/assignments', '/(app)/incidents', '/(app)/alerts', '/(app)/profile'];

  const currentRouteIndex = useMemo(() => {
    const normalizedPath = pathname === '/' ? '/(app)' : pathname;
    const index = tabRoutes.findIndex((route) => normalizedPath === route || normalizedPath.startsWith(route + '/'));
    return index;
  }, [pathname]);

  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-18, 18])
        .onEnd((event) => {
          if (currentRouteIndex < 0) return;
          if (Math.abs(event.translationX) < 60 || Math.abs(event.translationY) > 40) return;

          const direction = event.translationX < 0 ? 1 : -1;
          const nextIndex = currentRouteIndex + direction;
          const nextRoute = tabRoutes[nextIndex];

          if (nextRoute) {
            router.replace(nextRoute as never);
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
    <View style={styles.root}>
      <Tabs
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
      <GestureDetector gesture={swipeGesture}>
        <View pointerEvents="box-only" style={[styles.swipeZone, { bottom: tabBar.totalHeight }]} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  swipeZone: {
    // `bottom` is set inline per-device from useTabBarMetrics() so this
    // always sits directly above the floating tab bar and never overlaps
    // — and therefore never swallows — tab bar touches.
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
  },
});
