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

  const sanitize = (raw: string) =>
    mode === 'alphanumeric' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : raw.replace(/[^0-9]/g, '');

  const commit = (next: string[]) => {
    onChange(next.join(''));
    if (next.every((c) => c)) onComplete(next.join(''));
  };

  const setCharAt = (index: number, rawText: string) => {
    const clean = sanitize(rawText);

    // A paste (or SMS-autofill) delivers more than one character at once —
    // maxLength is set to the full code length precisely so this isn't
    // truncated to a single character before it ever reaches here.
    // Distribute it across this box and the ones after it, the way every
    // real OTP input handles a pasted code, instead of silently discarding
    // everything past the first character.
    if (clean.length > 1) {
      const next = chars.slice();
      let cursor = index;
      for (const ch of clean) {
        if (cursor >= length) break;
        next[cursor] = ch;
        cursor += 1;
      }
      commit(next);
      inputRefs.current[Math.min(cursor, length - 1)]?.focus();
      return;
    }

    const next = chars.slice();
    next[index] = clean;
    commit(next);

    if (clean && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
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
            // Hints the OS to suggest the SMS code it just received above
            // the keyboard (iOS's QuickType bar / Android's Autofill) —
            // only meaningful for the numeric, SMS-delivered OTP, not the
            // dispatcher-issued invite code.
            textContentType={mode === 'numeric' ? 'oneTimeCode' : 'none'}
            autoComplete={mode === 'numeric' ? 'sms-otp' : 'off'}
            autoCapitalize={mode === 'alphanumeric' ? 'characters' : 'none'}
            autoCorrect={false}
            // Deliberately not 1 — see the paste-handling comment above.
            // The box only ever *displays* a single character (its value
            // is always exactly one character from the parent's string),
            // this just stops the native input from truncating a
            // multi-character paste before onChangeText ever sees it.
            maxLength={length}
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
