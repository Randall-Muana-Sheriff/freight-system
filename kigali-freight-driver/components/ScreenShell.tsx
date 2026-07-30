import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { RouteLines } from './RouteLines';
import { useTabBarMetrics } from '../lib/tabBarMetrics';

export function ScreenShell({
  children,
  padded = true,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const tabBar = useTabBarMetrics();

  return (
    <View style={styles.flex}>
      <RouteLines />
      {/* Bottom edge is handled manually via contentBottomPadding below (it
          needs to clear the docked tab bar, not just the safe area), so
          SafeAreaView only manages top/left/right here — applying both
          would double up the bottom inset on notch-free devices and still
          undershoot it on devices with a tall gesture-nav inset. */}
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[styles.content, padded && { ...styles.padded, paddingBottom: tabBar.contentBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flexGrow: 1 },
  padded: { paddingHorizontal: 20, paddingTop: 22 },
});
