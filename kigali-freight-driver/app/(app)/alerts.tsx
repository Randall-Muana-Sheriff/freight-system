import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { NotificationItem } from '../../components/NotificationItem';
import { useLiveDriverEvents } from '../../lib/liveEvents';
import { theme } from '../../lib/theme';

export default function AlertsScreen() {
  const { events, connected, clearEvents, dismissEvent } = useLiveDriverEvents();

  return (
    <ScreenShell>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <SectionHeader eyebrow="Live feed" title="Alerts" />
        </View>
        {events.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} activeOpacity={0.8} onPress={clearEvents} hitSlop={8}>
            <Text style={styles.clearText}>Clear all</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, connected ? styles.statusDotLive : styles.statusDotIdle]} />
        <Text style={styles.statusText}>{connected ? "Connected — you'll get updates in real time" : 'Reconnecting…'}</Text>
      </View>

      {events.length > 0 ? (
        <View>
          {events.map((item) => (
            <NotificationItem key={item.id} {...item} onDismiss={() => dismissEvent(item.id)} />
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
  headerTextWrap: { flex: 1 },
  clearButton: { flexShrink: 0, paddingHorizontal: 4, paddingVertical: 4, marginTop: 2 },
  clearText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statusDotLive: { backgroundColor: theme.colors.success },
  statusDotIdle: { backgroundColor: theme.colors.warning },
  statusText: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  emptyTitle: { color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold, marginTop: 2 },
  emptyBody: { color: theme.colors.muted, ...theme.type.bodySm, textAlign: 'center', maxWidth: 240, fontFamily: theme.fonts.body },
});
