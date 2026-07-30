import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme, shadow } from '../lib/theme';
import { RouteLines } from './RouteLines';

export function AuthTicket({
  kicker,
  title,
  subtitle,
  manifestCode,
  stamp,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  manifestCode: string;
  stamp?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <RouteLines />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wordmarkRow}>
            <View style={styles.wordmarkBadge}>
              <Text style={styles.wordmarkGlyph}>KF</Text>
            </View>
            <View>
              <Text style={styles.wordmarkTitle}>Kigali Freight</Text>
              <Text style={styles.wordmarkSub}>Driver Operations</Text>
            </View>
          </View>

          <View style={[styles.ticket, shadow]}>
            {stamp ? (
              <View style={styles.stamp}>
                <Text style={styles.stampText}>{stamp}</Text>
              </View>
            ) : null}

            <View style={styles.ticketHeader}>
              <Text style={styles.kicker}>{kicker}</Text>
              <Text style={styles.manifestCode}>{manifestCode}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.perforation} />

            <View style={styles.body}>{children}</View>
          </View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function ManifestField({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
}) {
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>
      <View style={[field.row, focused && field.rowFocused]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(11,15,12,0.32)"
          secureTextEntry={hidden}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={field.input}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(11,15,12,0.4)" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function StampButton({
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
      style={[stamp.button, isDisabled && stamp.buttonDisabled]}
    >
      {loading ? <ActivityIndicator color={theme.colors.paper} /> : <Text style={stamp.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 48, gap: 22 },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'center' },
  wordmarkBadge: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,138,61,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.35)',
  },
  wordmarkGlyph: { color: theme.colors.primary, fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  wordmarkTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  wordmarkSub: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginTop: 1,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  ticket: {
    backgroundColor: theme.colors.paper,
    borderRadius: 10,
    padding: 22,
    gap: 4,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  stamp: {
    position: 'absolute',
    top: 18,
    right: -30,
    width: 130,
    alignItems: 'center',
    paddingVertical: 3,
    backgroundColor: 'transparent',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(91,132,166,0.55)',
    transform: [{ rotate: '32deg' }],
  },
  stampText: {
    color: 'rgba(91,132,166,0.75)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: {
    color: theme.colors.primaryDeep,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  manifestCode: {
    color: 'rgba(11,15,12,0.4)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  title: { color: theme.colors.ink, fontSize: 26, fontWeight: '900', marginTop: 10, letterSpacing: -0.4 },
  subtitle: { color: 'rgba(11,15,12,0.56)', fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 340 },
  perforation: {
    marginTop: 18,
    marginBottom: 16,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(11,15,12,0.18)',
  },
  body: { gap: 16 },
  footer: { alignItems: 'center', marginTop: 22 },
});

const field = StyleSheet.create({
  wrap: { gap: 7 },
  label: {
    color: 'rgba(11,15,12,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(11,15,12,0.18)',
    paddingBottom: 9,
  },
  rowFocused: { borderColor: theme.colors.primaryDeep },
  input: { flex: 1, color: theme.colors.ink, fontSize: 16, paddingVertical: 2 },
});

const stamp = StyleSheet.create({
  button: {
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 6,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  text: { color: theme.colors.paper, fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
});
