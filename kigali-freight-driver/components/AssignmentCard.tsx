import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function getStatusPalette(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes('delivered')) {
    return { rail: theme.colors.success, badge: 'rgba(91,140,110,0.16)', border: 'rgba(91,140,110,0.4)', text: theme.colors.success, icon: 'checkmark-circle-outline' as const };
  }
  if (normalized.includes('transit') || normalized.includes('route')) {
    return { rail: theme.colors.primary, badge: 'rgba(255,138,61,0.16)', border: 'rgba(255,138,61,0.4)', text: theme.colors.primary, icon: 'navigate-outline' as const };
  }
  if (normalized.includes('pickup') || normalized.includes('assigned')) {
    return { rail: theme.colors.accent, badge: 'rgba(91,132,166,0.18)', border: 'rgba(91,132,166,0.4)', text: theme.colors.accent, icon: 'briefcase-outline' as const };
  }
  return { rail: theme.colors.muted, badge: theme.colors.panelSoft, border: theme.colors.border, text: theme.colors.text, icon: 'information-circle-outline' as const };
}

export function AssignmentCard({
  title,
  route,
  destination,
  eta,
  status,
  onPress,
}: {
  title: string;
  route: string;
  destination: string;
  eta: string;
  status: string;
  onPress?: () => void;
}) {
  const palette = getStatusPalette(status);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.card}>
      <View style={[styles.rail, { backgroundColor: palette.rail }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.route}>{route}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: palette.badge, borderColor: palette.border }]}>
            <Ionicons name={palette.icon} size={11} color={palette.text} />
            <Text style={[styles.badgeText, { color: palette.text }]}>{status}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="navigate-outline" size={15} color={theme.colors.accent} />
            <Text style={styles.metaText} numberOfLines={1}>{destination}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={15} color={theme.colors.muted} />
            <Text style={styles.metaMono}>{eta}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
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
  body: { flex: 1, padding: 16, gap: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleWrap: { flex: 1 },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  route: { color: theme.colors.muted, marginTop: 4, fontSize: 12, fontFamily: mono },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  metaText: { color: theme.colors.text, flex: 1, fontSize: 13 },
  metaMono: { color: theme.colors.text, fontSize: 12, fontFamily: mono, fontVariant: ['tabular-nums'] },
});
