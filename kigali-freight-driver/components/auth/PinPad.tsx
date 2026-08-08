import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// Fire-and-forget, and dynamically imported for the same reason
// BiometricPrompt.tsx dynamically imports expo-local-authentication: a
// dev-client build made before this native module was added would
// otherwise crash the whole app just from this file being evaluated.
// Haptics are pure feel, never a correctness signal, so a failure here
// (module missing, unsupported hardware) is silently swallowed.
function haptic(kind: 'tap' | 'error') {
  import('expo-haptics')
    .then((Haptics) => {
      if (kind === 'tap') {
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    })
    .catch(() => {});
}

// The numpad + dot-indicator widget shared by PIN set/confirm/login — no
// submit button anywhere, it auto-completes the instant the 4th digit is
// entered. Mismatch handling (the red flash + shake) lives here, driven by
// the `error` prop the caller passes down for one render before clearing
// the value itself.
export function PinPad({
  length = 4,
  value,
  onChange,
  onComplete,
  error,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  error?: boolean;
}) {
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!error) return;
    haptic('error');
    // A short left-right wobble — the same beat as iOS's "incorrect
    // passcode" shake — reads as "wrong" on its own, faster than waiting
    // for someone to consciously notice the dots turned red.
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [error, shakeX]);

  const onPressKey = (key: string) => {
    if (key === '') return;
    haptic('tap');
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    const next = (value + key).slice(0, length);
    onChange(next);
    if (next.length === length) {
      onComplete(next);
    }
  };

  return (
    <View>
      <Animated.View
        style={[
          styles.dotsRow,
          { transform: [{ translateX: shakeX.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] },
        ]}
      >
        {Array.from({ length }).map((_, i) => (
          <PinDot key={i} filled={i < value.length} error={!!error} />
        ))}
      </Animated.View>
      <View style={styles.grid}>
        {KEYS.map((key, index) =>
          key === '' ? (
            // A true blank spacer, not a styled-but-empty button — keeps
            // "0" centered under "8" like a standard phone dialpad without
            // rendering a dead circle that looks tappable but does nothing.
            <View key={index} style={styles.keySpacer} />
          ) : (
            <PinKey key={index} label={key} onPress={() => onPressKey(key)} />
          )
        )}
      </View>
    </View>
  );
}

// A dot that pops (scales past 100% then settles) the instant it fills,
// instead of just snapping to its filled color — the same small spring
// most polished numeric-entry UIs use to make each digit feel registered.
function PinDot({ filled, error }: { filled: boolean; error: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current) {
      scale.setValue(1.35);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
    wasFilled.current = filled;
  }, [filled, scale]);

  return (
    <Animated.View
      style={[styles.dot, filled && styles.dotFilled, error && styles.dotError, { transform: [{ scale }] }]}
    />
  );
}

// Replaces the flat opacity-only TouchableOpacity with a real press: the
// key scales down under the finger and springs back on release, matching
// the tactile feedback of a native OS PIN keypad instead of just dimming.
function PinKey({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => Animated.spring(scale, { toValue: 0.88, friction: 6, tension: 200, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();

  return (
    <TouchableWithoutFeedback onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.key, { transform: [{ scale }] }]}>
        {label === 'del' ? (
          <Ionicons name="backspace-outline" size={20} color={theme.colors.text} />
        ) : (
          <Text style={styles.keyText}>{label}</Text>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const DOT_SIZE = 14;
const KEY_SIZE = 72;
const GRID_GAP = 14;
// flexWrap alone doesn't force exactly 3 per row — it just wraps whenever
// items stop fitting the container, so on a wide-enough screen a 4th key
// fits too and the layout silently becomes 4-3-3-2 instead of the intended
// phone-dialpad 3x4. Pinning the grid's own width to exactly 3 columns
// makes the wrap point independent of screen width.
const GRID_WIDTH = KEY_SIZE * 3 + GRID_GAP * 2;

const styles = StyleSheet.create({
  dotsRow: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginBottom: 32 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dotError: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger, shadowColor: theme.colors.danger },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: GRID_GAP, width: GRID_WIDTH, alignSelf: 'center' },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyText: { color: theme.colors.text, fontSize: 24, fontFamily: theme.fonts.bodySemiBold },
});
