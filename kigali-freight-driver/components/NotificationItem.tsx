import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import type { DriverNotification } from '../lib/notifications';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const toneStyles = {
  info: { rail: theme.colors.accent, icon: 'information-circle-outline' as const },
  warning: { rail: theme.colors.warning, icon: 'alert-circle-outline' as const },
  success: { rail: theme.colors.success, icon: 'checkmark-circle-outline' as const },
};

export function NotificationItem({ title, body, tone, timestamp }: DriverNotification) {
  const style = toneStyles[tone];

  return (
    <View style={styles.card}>
      <View style={[styles.rail, { backgroundColor: style.rail }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Ionicons name={style.icon} size={16} color={style.rail} />
          <Text style={styles.time}>{timestamp}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{body}</Text>
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
    overflow: 'hidden',
  },
  rail: { width: 3 },
  body: { flex: 1, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { color: theme.colors.muted, fontSize: 11, fontFamily: mono },
  title: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  text: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
});
