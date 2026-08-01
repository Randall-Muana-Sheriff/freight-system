import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../lib/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// The numpad + dot-indicator widget shared by PIN set/confirm/login — no
// submit button anywhere, it auto-completes the instant the 4th digit is
// entered. Mismatch handling (the red flash on confirm) lives in the
// caller, which just passes `error` down for one render before clearing
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
  const onPressKey = (key: string) => {
    if (key === '') return;
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
      <View style={styles.dotsRow}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled, error && styles.dotError]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, index) =>
          key === '' ? (
            // A true blank spacer, not a styled-but-empty button — keeps
            // "0" centered under "8" like a standard phone dialpad without
            // rendering a dead circle that looks tappable but does nothing.
            <View key={index} style={styles.keySpacer} />
          ) : (
            <TouchableOpacity key={index} style={styles.key} activeOpacity={0.7} onPress={() => onPressKey(key)}>
              {key === 'del' ? (
                <Ionicons name="backspace-outline" size={20} color={theme.colors.text} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </TouchableOpacity>
          )
        )}
      </View>
    </View>
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
