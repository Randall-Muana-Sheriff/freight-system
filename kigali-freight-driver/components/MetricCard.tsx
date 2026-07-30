import { Platform, StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/theme';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export function MetricCard({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <View style={styles.card}>
      <View style={[styles.rail, accent && styles.railAccent]} />
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
    minHeight: 108,
    overflow: 'hidden',
  },
  rail: { width: 3, backgroundColor: theme.colors.accent },
  railAccent: { backgroundColor: theme.colors.primary },
  body: { flex: 1, padding: 14, justifyContent: 'space-between' },
  label: { color: theme.colors.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', fontFamily: mono },
  value: { color: theme.colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 6, fontVariant: ['tabular-nums'] },
  hint: { color: theme.colors.muted, fontSize: 11, marginTop: 8, lineHeight: 15 },
});
