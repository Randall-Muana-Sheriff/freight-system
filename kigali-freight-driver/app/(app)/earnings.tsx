import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { fetchDriverEarnings } from '../../lib/api';
import { useUpNavigation } from '../../lib/navigation';
import { captureException } from '../../lib/crashReporting';
import {
  explainPayout, formatAmount, currencyForTotals, hasMixedCurrencies, type PayoutRow, type PayoutTone,
} from '../../lib/earnings';

const TONE_COLOR: Record<PayoutTone, string> = {
  good: theme.colors.success,
  pending: theme.colors.warning,
  bad: theme.colors.danger,
  neutral: theme.colors.muted,
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function EarningsScreen() {
  const goToProfile = useUpNavigation('/(app)/profile');
  const { token } = useAuth();
  const [data, setData] = useState<{ paidOut: number; onTheWay: number; payouts: PayoutRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchDriverEarnings(token));
      setError(null);
    } catch (err) {
      captureException(err, { context: 'earnings: load' });
      setError(err instanceof Error ? err.message : 'Could not load your earnings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const payouts = data?.payouts ?? [];
  const unit = currencyForTotals(payouts);
  const mixed = hasMixedCurrencies(payouts);

  return (
    <ScreenShell refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
      <SectionHeader eyebrow="Your money" title="Earnings" />

      {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <>
          {/* Two figures, never one. A payout row is created when the customer
              pays; the transfer follows minutes later. Collapsing these into a
              single "earned" number would tell a driver money is in their
              wallet at the moment they are most likely to go and look. */}
          <View style={styles.totals}>
            <View style={styles.total}>
              <Text style={styles.totalLabel}>In your wallet</Text>
              <Text style={[styles.totalFigure, { color: theme.colors.success }]}>
                {formatAmount(data.paidOut, unit) ?? '0'}
              </Text>
              <Text style={styles.totalHint}>Sent and landed.</Text>
            </View>
            <View style={styles.total}>
              <Text style={styles.totalLabel}>On the way</Text>
              <Text style={[styles.totalFigure, { color: theme.colors.warning }]}>
                {formatAmount(data.onTheWay, unit) ?? '0'}
              </Text>
              <Text style={styles.totalHint}>Earned, not sent yet.</Text>
            </View>
          </View>

          {mixed ? (
            <Text style={styles.warn}>
              These jobs are not all in one currency, so the totals above are shown without a unit.
              Check the individual jobs below.
            </Text>
          ) : null}

          {/* The gap that would otherwise read as "I have earned nothing".
              Cash jobs produce no payout row at all — the driver already holds
              the whole fare and owes the commission back instead — so this
              screen is deliberately not the whole picture, and says so rather
              than letting a week of cash work look like an empty week. */}
          <View style={styles.cashNote}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.muted} />
            <Text style={styles.cashNoteText}>
              Fares you took in cash are not here — you already hold that money. This screen is
              what comes to you by mobile money.
            </Text>
          </View>

          {payouts.length === 0 ? (
            <Text style={styles.empty}>
              Nothing has been sent to you by mobile money yet.
            </Text>
          ) : (
            <View style={styles.rows}>
              {payouts.map((row) => {
                const meaning = explainPayout(row);
                return (
                  <View key={row.id} style={styles.row}>
                    <View style={[styles.rail, { backgroundColor: TONE_COLOR[meaning.tone] }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle}>Trip #{row.order_id}</Text>
                        <Text style={styles.rowAmount}>{formatAmount(row.amount, row.currency) ?? '—'}</Text>
                      </View>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowStatus, { color: TONE_COLOR[meaning.tone] }]}>{meaning.label}</Text>
                        <Text style={styles.rowDate}>{dayLabel(row.sent_at || row.created_at)}</Text>
                      </View>
                      <Text style={styles.rowDetail}>{meaning.detail}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      <TouchableOpacity onPress={goToProfile} style={styles.secondary} activeOpacity={0.8}>
        <Ionicons name="arrow-back-outline" color={theme.colors.primary} size={16} />
        <Text style={styles.secondaryText}>Back to profile</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  error: { color: theme.colors.danger, ...theme.type.bodySm, marginTop: 12, fontFamily: theme.fonts.body },
  totals: { flexDirection: 'row', gap: 12, marginTop: 4 },
  total: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
  },
  totalLabel: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  totalFigure: { ...theme.type.title, marginTop: 6, fontFamily: theme.fonts.mono },
  totalHint: { color: theme.colors.muted, ...theme.type.micro, marginTop: 4, fontFamily: theme.fonts.body },
  warn: { color: theme.colors.warning, ...theme.type.label, marginTop: 12, fontFamily: theme.fonts.body },
  cashNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 16 },
  cashNoteText: { flex: 1, color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  empty: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 20, fontFamily: theme.fonts.body },
  rows: { marginTop: 18, gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 3, borderRadius: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  rowAmount: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.mono },
  rowStatus: { ...theme.type.micro, fontFamily: theme.fonts.bodySemiBold },
  rowDate: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
  rowDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 3, fontFamily: theme.fonts.body },
  secondary: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  secondaryText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
