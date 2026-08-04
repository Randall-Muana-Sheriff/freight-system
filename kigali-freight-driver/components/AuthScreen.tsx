import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { ToastOverlay, type Toast } from './ToastOverlay';

// Everything — brand mark, title, fields, button — lives inside one
// ScrollView wrapped by KeyboardAvoidingView. The previous version had a
// fixed-height gradient hero sitting outside that wrapper, which is
// exactly why the keyboard could cover the lower fields: that band
// couldn't shrink to make room. Nothing here is fixed-height now, so the
// keyboard always has room to push into.
export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  toast,
  onDismissToast,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  toast?: Toast | null;
  onDismissToast?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    // Android's manifest already has windowSoftInputMode="adjustResize"
    // baked in, which resizes the window at the OS level when the keyboard
    // opens — that's the actual fix for "keyboard covers the input" on
    // Android. KeyboardAvoidingView's own height/padding behavior on top
    // of that double-compensates (the OS already shrank the window, then
    // this shrinks it again), which is what left a gap exposing the
    // system's default background the moment a field was focused. iOS has
    // no equivalent OS-level behavior, so it still needs this.
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Ionicons name="car-sport" size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.wordmark}>Kigali Freight</Text>
        </View>

        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.fields}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>

      <ToastOverlay toast={toast ?? null} onHide={onDismissToast ?? (() => {})} />
    </KeyboardAvoidingView>
  );
}

export function AuthField({
  icon,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  error,
  editable = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  error?: string | null;
  editable?: boolean;
}) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={field.wrap}>
      <View style={[field.row, focused && field.rowFocused, error && field.rowError]}>
        <Ionicons name={icon} size={18} color={focused ? theme.colors.primary : theme.colors.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[field.input, !editable && field.inputDisabled]}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={field.errorText}>{error}</Text> : null}
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[button.base, isDisabled && button.disabled]}
    >
      {loading ? <ActivityIndicator color={theme.colors.paper} /> : <Text style={button.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.colors.primary}22`,
  },
  wordmark: { color: theme.colors.text, fontSize: 15, fontFamily: theme.fonts.bodySemiBold },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontFamily: theme.fonts.mono,
    marginBottom: 8,
  },
  title: { color: theme.colors.text, fontSize: 26, fontFamily: theme.fonts.headingBlack, letterSpacing: -0.3 },
  subtitle: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 8, maxWidth: 340, fontFamily: theme.fonts.body },
  fields: { gap: 16, marginTop: 28 },
  footer: { alignItems: 'center', marginTop: 26 },
});

const field = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowFocused: { borderColor: theme.colors.primary },
  rowError: { borderColor: theme.colors.danger },
  input: { flex: 1, color: theme.colors.text, fontSize: 15, fontFamily: theme.fonts.body },
  inputDisabled: { opacity: 0.5 },
  errorText: { color: theme.colors.danger, fontSize: 11, marginLeft: 4, fontFamily: theme.fonts.bodyMedium },
});

const button = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 16,
    marginTop: 6,
  },
  disabled: { opacity: 0.6 },
  text: { color: theme.colors.ink, fontSize: 15, fontFamily: theme.fonts.bodySemiBold },
});
