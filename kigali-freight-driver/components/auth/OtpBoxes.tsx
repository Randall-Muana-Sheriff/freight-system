import { useRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../../lib/theme';

// Shared by the OTP step (6 numeric digits) and the invite-code step (6
// uppercase alphanumeric characters) — same box-per-character look, just a
// different keyboard/character filter.
//
// One real, single TextInput drives everything; the boxes underneath it are
// purely a visual rendering of substrings of that one value. An earlier
// version used a separate controlled TextInput per box with manual
// .focus()-shuffling between them on each keystroke — that's a well-known
// source of dropped/misplaced characters in React Native: the imperative
// focus() call can fire before the state update from the previous
// onChangeText has actually committed, so a keystroke typed in that window
// lands on a stale box or gets lost entirely. A real driver hit exactly
// this typing at normal speed, not just fast paste/autofill. Routing every
// keystroke through one input removes the race outright — there's no
// focus-shifting left to race.
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
  const inputRef = useRef<TextInput>(null);
  const chars = Array.from({ length }, (_, i) => value[i] || '');
  const activeIndex = Math.min(value.length, length - 1);

  const sanitize = (raw: string) =>
    mode === 'alphanumeric' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : raw.replace(/[^0-9]/g, '');

  const onChangeText = (raw: string) => {
    const clean = sanitize(raw).slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete(clean);
  };

  return (
    <View>
      <View style={styles.inputWrap}>
        <View style={styles.row} pointerEvents="none">
          {chars.map((char, index) => (
            <View
              key={index}
              style={[
                styles.box,
                char ? styles.boxFilled : null,
                error ? styles.boxError : null,
                index === activeIndex && !error ? styles.boxActive : null,
              ]}
            >
              <Text style={styles.boxText}>{char}</Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          keyboardType={mode === 'numeric' ? 'number-pad' : 'default'}
          // Hints the OS to suggest the SMS code it just received above
          // the keyboard (iOS's QuickType bar / Android's Autofill) —
          // only meaningful for the numeric, SMS-delivered OTP, not the
          // dispatcher-issued invite code.
          textContentType={mode === 'numeric' ? 'oneTimeCode' : 'none'}
          autoComplete={mode === 'numeric' ? 'sms-otp' : 'off'}
          autoCapitalize={mode === 'alphanumeric' ? 'characters' : 'none'}
          autoCorrect={false}
          maxLength={length}
          autoFocus
          caretHidden
          style={[StyleSheet.absoluteFill, styles.hiddenInput]}
        />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(chars.filter(Boolean).length / length) * 100}%` }]} />
      </View>
    </View>
  );
}

const BOX_SIZE = 44;

const styles = StyleSheet.create({
  inputWrap: { position: 'relative' },
  // Transparent and exactly overlaying the visual row (combined with
  // StyleSheet.absoluteFill above), so tapping any box focuses this the
  // same way tapping a real input would — it's the only thing actually
  // receiving keystrokes/paste/autofill.
  hiddenInput: { opacity: 0 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: theme.colors.primary },
  boxFilled: { borderColor: theme.colors.primary },
  boxError: { borderColor: theme.colors.danger },
  boxText: { color: theme.colors.text, fontSize: 20, fontFamily: theme.fonts.bodySemiBold, textAlign: 'center' },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surface2,
    marginTop: 22,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 },
});
