import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

// A flat dismiss time worked fine while every message here was a short
// phrase ("Allow camera access..."), but the incident report success
// toast can carry a full sentence plus nearest-hub name and distance —
// at a fixed 3.2s that longer message faded before a driver could
// actually read it. Scale the window with message length instead: short
// messages keep the same 3.2s floor (no behavior change for them), long
// ones get more time, capped so nothing lingers indefinitely.
const MIN_DISMISS_MS = 3200;
const MAX_DISMISS_MS = 7000;
const MS_PER_CHARACTER = 45;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 220;

function dismissDurationFor(text: string): number {
  return Math.min(MAX_DISMISS_MS, Math.max(MIN_DISMISS_MS, text.length * MS_PER_CHARACTER));
}

// Every toast used to render in the same amber regardless of whether it
// was reporting success, failure, or something in between — a driver had
// no color/shape cue to tell "this worked" from "this didn't" at a
// glance. Four tones, each meaning one specific thing:
//  - success: the action the driver took worked, plainly.
//  - warning: needs the driver's attention/action, but isn't a failure
//    (a missing permission, an urgent-severity report that still sent
//    fine, a validation nudge).
//  - error: the action failed.
//  - info: neutral status, not a verdict on pass/fail (saved for later
//    while offline, supplementary guidance riding along with a result).
export type ToastTone = 'success' | 'warning' | 'error' | 'info';

export type Toast = {
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  tone?: ToastTone;
  // A secondary line for information that isn't itself the pass/fail
  // verdict — e.g. "Nearest hub: Nyabugogo (2.3km)" riding along with a
  // report-sent success message. Always rendered in the neutral "info"
  // color so it visually reads as supplementary guidance, distinct from
  // whatever tone the main message carries.
  note?: string;
};

const TONE_COLORS: Record<ToastTone, string> = {
  success: theme.colors.success,
  warning: theme.colors.warning,
  error: theme.colors.danger,
  info: theme.colors.accent,
};

// A brief, floating notice for transient/non-blocking messages (missing a
// permission, "saved for later while offline") — unlike InlineBanner, this
// overlays the screen instead of pushing content down (so nothing shifts
// when it appears or disappears), and clears itself automatically instead
// of needing a manual dismiss. Reserved for messages that don't need to
// block the driver or be explicitly acknowledged; a real failure the driver
// needs to notice and possibly retry should stay an InlineBanner.
export function ToastOverlay({ toast, onHide }: { toast: Toast | null; onHide: () => void }) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(() => onHide());
    }, dismissDurationFor(toast.message + (toast.note ?? '')));

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!toast) return null;
  const toneColor = TONE_COLORS[toast.tone ?? 'warning'];

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: insets.top + 12, opacity }]}>
      <View style={[styles.toast, { borderColor: `${toneColor}55` }]}>
        <Ionicons name={toast.icon} size={16} color={toneColor} />
        <View style={styles.textColumn}>
          <Text style={styles.message}>{toast.message}</Text>
          {toast.note && (
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={12} color={theme.colors.accent} />
              <Text style={styles.note}>{toast.note}</Text>
            </View>
          )}
        </View>
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
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface3,
    borderWidth: 1,
    maxWidth: 440,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  textColumn: { flex: 1, gap: 4 },
  message: { color: theme.colors.text, fontSize: 13, lineHeight: 18, fontFamily: theme.fonts.body },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  note: { flex: 1, color: theme.colors.accent, fontSize: 11.5, lineHeight: 15, fontFamily: theme.fonts.body },
});
