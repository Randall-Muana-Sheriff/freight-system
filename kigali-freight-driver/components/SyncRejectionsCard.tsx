import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { explainRejection } from '../lib/explainRejection';

// Work the server refused, shown to the driver rather than counted.
//
// Until this existed, a refused action left no trace on the phone at all: the
// flush returned it, auth.tsx dropped the return value, and the "N pending"
// row — which counts only what is still queued — went DOWN. A driver whose
// proof-of-delivery photo had been thrown away saw the number improve.
//
// So this deliberately does not render as a diagnostic. It is the one thing on
// the profile screen that asks the driver to do something.

function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function SyncRejectionsCard() {
  const { rejectedActions, retryRejected, discardRejected } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rejectedActions.length === 0) return null;

  const needsAttention = rejectedActions.filter((r) => explainRejection(r).severity === 'attention').length;

  const remove = (id: string, isEvidence: boolean, headline: string) => {
    // A confirm only where something is actually destroyed. Removing a
    // redundant status update throws away a notice; removing a delivery photo
    // throws away the only copy of the proof that a load arrived.
    if (!isEvidence) {
      void run(id, () => discardRejected(id));
      return;
    }
    Alert.alert(
      'Delete this photo?',
      `${headline} has not reached dispatch. Deleting it here removes the only copy on this phone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void run(id, () => discardRejected(id)) },
      ]
    );
  };

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={needsAttention > 0 ? 'alert-circle' : 'information-circle-outline'}
          size={18}
          color={needsAttention > 0 ? theme.colors.warning : theme.colors.muted}
        />
        <Text style={styles.title}>Did not send</Text>
      </View>

      <Text style={styles.intro}>
        {needsAttention > 0
          ? 'Dispatch would not accept these. They will not send on their own.'
          : 'Dispatch did not need these. Nothing was lost.'}
      </Text>

      <View style={styles.rows}>
        {rejectedActions.map((entry) => {
          const { headline, explanation, severity } = explainRejection(entry);
          const isEvidence = entry.item.type === 'delivery-photo';
          const busy = busyId === entry.id;

          return (
            <View key={entry.id} style={styles.row}>
              <View
                style={[
                  styles.rail,
                  { backgroundColor: severity === 'attention' ? theme.colors.warning : theme.colors.border },
                ]}
              />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{headline}</Text>
                <Text style={styles.rowDetail}>{explanation}</Text>
                <Text style={styles.rowMeta}>{whenLabel(entry.rejectedAt)}</Text>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.action, styles.actionPrimary, busy && styles.actionDisabled]}
                    onPress={() => void run(entry.id, () => retryRejected(entry.id))}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Try sending ${headline} again`}
                  >
                    <Ionicons name="refresh-outline" size={14} color={theme.colors.ink} />
                    <Text style={styles.actionPrimaryText}>Try again</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.action, busy && styles.actionDisabled]}
                    onPress={() => remove(entry.id, isEvidence, headline)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={isEvidence ? `Delete ${headline}` : `Dismiss ${headline}`}
                  >
                    <Text style={styles.actionText}>{isEvidence ? 'Delete' : 'Dismiss'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { flex: 1, color: theme.colors.text, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  intro: { color: theme.colors.muted, ...theme.type.label, marginBottom: 14, fontFamily: theme.fonts.body },
  rows: { gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 3, borderRadius: 2 },
  rowBody: { flex: 1 },
  rowTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  rowDetail: { color: theme.colors.muted, ...theme.type.label, marginTop: 3, fontFamily: theme.fonts.body },
  rowMeta: { color: theme.colors.muted, ...theme.type.micro, marginTop: 4, fontFamily: theme.fonts.mono },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  actionPrimaryText: { color: theme.colors.ink, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  actionText: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  actionDisabled: { opacity: 0.5 },
});
