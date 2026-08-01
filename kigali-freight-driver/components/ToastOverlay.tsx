import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

const AUTO_DISMISS_MS = 3200;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 220;

// A brief, floating notice for transient/non-blocking messages (missing a
// permission, "saved for later while offline") — unlike InlineBanner, this
// overlays the screen instead of pushing content down (so nothing shifts
// when it appears or disappears), and clears itself automatically instead
// of needing a manual dismiss. Reserved for messages that don't need to
// block the driver or be explicitly acknowledged; a real failure the driver
// needs to notice and possibly retry should stay an InlineBanner.
export function ToastOverlay({
  message,
  icon,
  onHide,
}: {
  message: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  onHide: () => void;
}) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(() => onHide());
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 12, opacity }]}>
      <View style={styles.toast}>
        <Ionicons name={icon} size={16} color={theme.colors.warning} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface3,
    borderWidth: 1,
    borderColor: `${theme.colors.warning}55`,
    maxWidth: 440,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  message: { flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 18, fontFamily: theme.fonts.body },
});
