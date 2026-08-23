import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { NotificationItem } from '../../components/NotificationItem';
import { EmptyState } from '../../components/EmptyState';
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
        <Text style={styles.statusText}>{connected ? "Connected. You'll get updates in real time" : 'Reconnecting…'}</Text>
      </View>

      {events.length > 0 ? (
        <View>
          {events.map((item) => (
            <NotificationItem key={item.id} {...item} onDismiss={() => dismissEvent(item.id)} />
          ))}
        </View>
      ) : (
        // Names what actually arrives — see the five socket listeners in
        // lib/liveEvents.ts. The old wording promised "trip status
        // changes", which is wrong twice over: a driver's own status taps
        // are deliberately filtered out (initiatedByDriver), and it left
        // out document decisions and incident replies entirely, the two
        // things a driver most needs to hear about.
        <EmptyState
          icon="notifications-outline"
          title="No alerts yet"
          body="Changes dispatch makes to your trips, decisions on your documents, replies to your reports, and safety alerts all arrive here."
        />
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
});
