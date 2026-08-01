import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

function getStatusPalette(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes('delivered')) {
    return { color: theme.colors.success, icon: 'checkmark-circle' as const };
  }
  if (normalized.includes('transit') || normalized.includes('route')) {
    return { color: theme.colors.primary, icon: 'navigate' as const };
  }
  if (normalized.includes('pickup') || normalized.includes('assigned')) {
    return { color: theme.colors.accent, icon: 'briefcase' as const };
  }
  return { color: theme.colors.muted, icon: 'ellipse-outline' as const };
}

// Flat, divided row instead of a bordered card — a list of these reads as
// one continuous manifest with a hairline between entries, rather than a
// stack of separate boxes floating on the same background.
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
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${palette.color}1F` }]}>
        <Ionicons name={palette.icon} size={17} color={palette.color} />
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={[styles.status, { color: palette.color }]} numberOfLines={1}>{status}</Text>
        </View>
        <Text style={styles.route} numberOfLines={1}>{route}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="navigate-outline" size={12} color={theme.colors.muted} />
          <Text style={styles.metaText} numberOfLines={1}>{destination}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaMono}>{eta}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.muted} style={{ marginTop: 8 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: theme.colors.text, fontSize: 15, fontFamily: theme.fonts.bodySemiBold },
  status: { fontSize: 10, fontFamily: theme.fonts.mono, textTransform: 'uppercase', letterSpacing: 0.4 },
  route: { color: theme.colors.muted, fontSize: 11, fontFamily: theme.fonts.mono },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  metaText: { color: theme.colors.text, fontSize: 12, flexShrink: 1, fontFamily: theme.fonts.body },
  metaDot: { color: theme.colors.muted, fontSize: 12 },
  metaMono: { color: theme.colors.muted, fontSize: 11, fontFamily: theme.fonts.mono },
});
