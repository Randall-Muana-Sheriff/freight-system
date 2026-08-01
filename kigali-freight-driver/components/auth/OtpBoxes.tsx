import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { theme } from '../../lib/theme';

// Shared by the OTP step (6 numeric digits) and the invite-code step (6
// uppercase alphanumeric characters) — same box-per-character UX, auto
// advance/backspace, and auto-submit once every box is filled, just with a
// different keyboard/character filter.
export function OtpBoxes({
  length,
  mode = 'numeric',
  value,
  onChange,
  onComplete,
  error,
}: {
  length: number;
  mode?: 'numeric' | 'alphanumeric';
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  error?: boolean;
}) {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] || '');

  const setCharAt = (index: number, rawChar: string) => {
    const char = mode === 'alphanumeric' ? rawChar.slice(-1).toUpperCase() : rawChar.replace(/[^0-9]/g, '').slice(-1);
    const next = chars.slice();
    next[index] = char;
    onChange(next.join(''));

    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((c) => c)) {
      onComplete(next.join(''));
    }
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !chars[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View>
      <View style={styles.row}>
        {chars.map((char, index) => (
          <TextInput
            key={index}
            ref={(ref) => {
              inputRefs.current[index] = ref;
            }}
            value={char}
            onChangeText={(text) => setCharAt(index, text)}
            onKeyPress={({ nativeEvent }) => onKeyPress(index, nativeEvent.key)}
            keyboardType={mode === 'numeric' ? 'number-pad' : 'default'}
            autoCapitalize={mode === 'alphanumeric' ? 'characters' : 'none'}
            autoCorrect={false}
            maxLength={1}
            autoFocus={index === 0}
            selectTextOnFocus
            style={[styles.box, char ? styles.boxFilled : null, error ? styles.boxError : null]}
          />
        ))}
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(chars.filter(Boolean).length / length) * 100}%` }]} />
      </View>
    </View>
  );
}

const BOX_SIZE = 44;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontSize: 20,
    fontFamily: theme.fonts.bodySemiBold,
    textAlign: 'center',
  },
  boxFilled: { borderColor: theme.colors.primary, color: theme.colors.primary },
  boxError: { borderColor: theme.colors.danger },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surface2,
    marginTop: 22,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 },
});
