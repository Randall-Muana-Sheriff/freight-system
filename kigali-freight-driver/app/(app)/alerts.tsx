import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { NotificationItem } from '../../components/NotificationItem';
import { useLiveDriverEvents } from '../../lib/liveEvents';
import { theme } from '../../lib/theme';

export default function AlertsScreen() {
  const { events, connected, clearEvents } = useLiveDriverEvents();

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <SectionHeader eyebrow="Live feed" title="Alerts" subtitle="Updates on your own trips and safety events, as they happen." />
        {events.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} activeOpacity={0.8} onPress={clearEvents} hitSlop={8}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, connected ? styles.statusDotLive : styles.statusDotIdle]} />
        <Text style={styles.statusText}>{connected ? 'Connected — you\'ll get updates in real time' : 'Reconnecting…'}</Text>
      </View>

      {events.length > 0 ? (
        <View style={{ gap: 10 }}>
          {events.map((item) => (
            <NotificationItem key={item.id} {...item} />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-outline" size={26} color={theme.colors.muted} />
          <Text style={styles.emptyTitle}>No alerts yet</Text>
          <Text style={styles.emptyBody}>Trip status changes and safety events for you will show up here as they happen.</Text>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  clearButton: { paddingHorizontal: 4, paddingVertical: 4, marginTop: 2 },
  clearText: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.panelSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusDot: { width: 9, height: 9, borderRadius: 999 },
  statusDotLive: { backgroundColor: theme.colors.success },
  statusDotIdle: { backgroundColor: theme.colors.warning },
  statusText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    padding: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panel,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  emptyBody: { color: theme.colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 240 },
});
