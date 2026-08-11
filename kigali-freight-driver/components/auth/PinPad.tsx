import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';
import { theme } from '../../lib/theme';

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

// The PIN entry widget shared by PIN set/confirm/login — no submit button
// anywhere, it auto-completes the instant the 4th digit is entered.
// Mismatch handling (the red flash + shake) lives here, driven by the
// `error` prop the caller passes down for one render before clearing the
// value itself.
//
// Uses the device's own numeric keyboard rather than a custom on-screen
// keypad: it's the input surface people already know, it inherits
// system-level accessibility (TalkBack, switch access, larger text) for
// free, and it stops the layout from shifting when the OS keyboard opens
// and closes over a hand-drawn grid. Same single-hidden-input approach as
// OtpBoxes — one real TextInput drives everything and the dots below are
// purely a rendering of its value.
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
  const inputRef = useRef<TextInput>(null);
  const previousLength = useRef(value.length);

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

  // Refocus after a failed attempt: the caller clears `value`, and without
  // this the keyboard can drop away leaving no obvious way back in.
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  const onChangeText = (raw: string) => {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, length);
    // Only on a digit added, not on delete — matching the old keypad,
    // where backspace was deliberately silent.
    if (clean.length > previousLength.current) haptic('tap');
    previousLength.current = clean.length;

    onChange(clean);
    if (clean.length === length) onComplete(clean);
  };

  return (
    <View style={styles.wrap}>
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

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        // A PIN is a credential, so keep it out of keyboard learning,
        // suggestion strips and password managers.
        autoComplete="off"
        autoCorrect={false}
        textContentType="none"
        secureTextEntry
        maxLength={length}
        autoFocus
        caretHidden
        // Transparent and stretched across the dots so tapping them
        // reopens the keyboard — this input is the only thing actually
        // receiving keystrokes.
        style={[StyleSheet.absoluteFill, styles.hiddenInput]}
      />
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

const styles = StyleSheet.create({
  wrap: { position: 'relative', paddingVertical: 20 },
  hiddenInput: { opacity: 0 },
  dotsRow: { flexDirection: 'row', gap: 18, justifyContent: 'center', alignItems: 'center' },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dotError: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
});
