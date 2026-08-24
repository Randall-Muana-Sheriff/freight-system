// The money a driver is holding that is not theirs.
//
// Earnings answers "what is coming to me". This answers "what do I owe", and
// it is the one a driver can get wrong expensively. A cash fare arrives whole
// — the driver takes the customer's notes at the door, including the
// platform's share — so a good week in cash looks identical to a good week in
// profit right up until someone asks for the commission back.
//
// So the debt is the headline, not a line item. Everything else on this
// screen is subordinate to the figure at the top and the button under it.
//
// Deliberately its own screen rather than a card on Earnings. The server
// keeps the two sets of totals apart on purpose (a cash fare is gross, a
// payout is net) and putting them on one screen is how they end up added
// together in a future edit by someone who did not read the comment.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ScreenShell } from '../../components/ScreenShell';
import { SectionHeader } from '../../components/SectionHeader';
import { theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { useUpNavigation } from '../../lib/navigation';
import { captureException } from '../../lib/crashReporting';
import {
  ApiError,
  fetchCashSettlementStatus,
  fetchDriverCash,
  requestOwnCashSettlement,
  type CashSettlement,
  type DriverCashSummary,
} from '../../lib/api';
import {
  canSettleNow,
  explainSettlement,
  formatAmount,
  jobCommissionLabel,
  owedHeadline,
  validatePartial,
  type CashTone,
} from '../../lib/cash';

// Green is reachable only from 'clear' — a total that is zero AND complete.
// An unknown total is amber, because it is not good news yet.
const HEADLINE_COLOR: Record<'owing' | 'clear' | 'unknown', string> = {
  owing: theme.colors.warning,
  clear: theme.colors.success,
  unknown: theme.colors.warning,
};

const TONE_COLOR: Record<CashTone, string> = {
  good: theme.colors.success,
  pending: theme.colors.warning,
  bad: theme.colors.danger,
  neutral: theme.colors.muted,
};

// Same cadence as CollectPaymentCard. While someone is holding their phone
// waiting to type a PIN, a minute-old answer is the wrong answer.
const POLL_MS = 4000;
// Long enough to find a phone and remember a PIN. After this the screen stops
// waiting — it does not claim the payment failed, because MTN may still
// settle it and the driver needs to check their wallet, not be told the money
// is gone.
const GIVE_UP_MS = 3 * 60 * 1000;

function dayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('en-RW', { day: 'numeric', month: 'short' });
}

export default function CashScreen() {
  const goToProfile = useUpNavigation('/(app)/profile');
  const { token } = useAuth();

  const [data, setData] = useState<DriverCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settlement, setSettlement] = useState<CashSettlement | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partialOpen, setPartialOpen] = useState(false);
  const [partial, setPartial] = useState('');
  const startedAt = useRef<number>(0);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchDriverCash(token));
      setError(null);
    } catch (err) {
      captureException(err, { context: 'cash: load' });
      setError(err instanceof Error ? err.message : 'Could not load your cash jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Poll only while a prompt is actually outstanding.
  useEffect(() => {
    if (!reference || !token) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await fetchCashSettlementStatus(token, reference);
        if (cancelled) return;
        setSettlement(result);

        if (explainSettlement(result).settled) {
          setReference(null);
          // Re-read the summary rather than trusting a local subtraction: a
          // partial payment clears whole jobs from the oldest first, and only
          // the server knows which ones landed.
          void load();
          return;
        }
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
          setReference(null);
          setNotice('No answer to the prompt yet. Check your wallet before paying again — '
            + 'it may still go through.');
        }
      } catch {
        // A dropped connection mid-poll is not a failed payment. The next
        // tick asks again, and the server reconciles against MTN whenever it
        // is next asked.
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [reference, token, load]);

  const headline = owedHeadline(data);
  const gate = canSettleNow(data);
  const waiting = reference !== null;

  const pay = async (amount?: number) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const started = await requestOwnCashSettlement(token, amount);
      startedAt.current = Date.now();
      setReference(started.reference);
      setSettlement(null);
      setPartialOpen(false);
      setPartial('');
      setNotice(started.reused
        ? 'A prompt is already on your phone. Check it.'
        : 'Prompt sent. Enter your mobile money PIN to pay the commission.');
    } catch (err) {
      captureException(err, { context: 'cash: settle' });
      // The server's message is written for the driver in every one of these
      // cases — wrong network, nothing owed, mixed currency — so it is shown
      // rather than replaced with something vaguer.
      setError(err instanceof ApiError || err instanceof Error
        ? err.message
        : 'Could not start that payment. Hand the commission to dispatch instead.');
    } finally {
      setBusy(false);
    }
  };

  const payPartial = () => {
    const parsed = validatePartial(partial, data?.commissionOwed ?? null, data?.currency ?? null);
    if (!parsed.ok) { setError(parsed.error); return; }
    void pay(parsed.amount);
  };

  const jobs = data?.jobs ?? [];
  const unsettled = jobs.filter((j) => !j.settledAt);
  const settled = jobs.filter((j) => j.settledAt);

  return (
    <ScreenShell refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}>
      <SectionHeader eyebrow="Your money" title="Cash you owe" />

      {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {data ? (
        <>
          {/* The debt, not the takings. A driver who reads only one number on
              this screen must read the one that is not theirs. */}
          <View style={styles.owedCard}>
            <Text style={styles.owedLabel}>Commission you owe</Text>
            <Text style={[styles.owedFigure, { color: HEADLINE_COLOR[headline.tone] }]}>
              {headline.amount === null
                ? '—'
                : formatAmount(headline.amount, headline.currency) ?? '0'}
            </Text>
            {/* Both the wording and the colour come from owedHeadline rather
                than from `amount > 0` here. Deciding it inline is how this
                screen first shipped saying "You are square" to a driver whose
                commission simply had not been worked out yet. */}
            <Text style={styles.owedHint}>{headline.hint}</Text>
          </View>

          {headline.caveat ? <Text style={styles.warn}>{headline.caveat}</Text> : null}

          {/* Per-currency rows only when one figure cannot be honest. */}
          {data.byCurrency.length > 1 ? (
            <View style={styles.byCurrency}>
              {data.byCurrency.map((b) => (
                <View key={b.currency ?? 'none'} style={styles.byCurrencyRow}>
                  <Text style={styles.byCurrencyUnit}>{b.currency ?? 'No currency'}</Text>
                  <Text style={styles.byCurrencyAmount}>
                    {formatAmount(b.commissionOwed, b.currency) ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* What is actually happening with a prompt, when one is out. */}
          {waiting ? (
            <View style={styles.waiting}>
              <ActivityIndicator color={theme.colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.waitingLabel}>
                  {settlement ? explainSettlement(settlement).label : 'Sending the prompt'}
                </Text>
                <Text style={styles.waitingDetail}>
                  {settlement
                    ? explainSettlement(settlement).detail
                    : 'Check your phone in a moment.'}
                </Text>
              </View>
            </View>
          ) : null}

          {notice && !waiting ? <Text style={styles.notice}>{notice}</Text> : null}

          {settlement && !waiting ? (
            <Text style={[styles.notice, { color: TONE_COLOR[explainSettlement(settlement).tone] }]}>
              {explainSettlement(settlement).detail}
            </Text>
          ) : null}

          {/* The button, and the reason when there isn't one. A refusal is
              shown as a sentence rather than a disabled control with no
              explanation — the driver needs to know whether to go and find
              dispatch. */}
          {gate.canSettle && !waiting ? (
            <>
              <TouchableOpacity
                style={[styles.payButton, busy ? styles.payButtonBusy : null]}
                activeOpacity={0.9}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Pay the whole commission by mobile money"
                onPress={() => void pay()}
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.bg} />
                ) : (
                  <>
                    <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.bg} />
                    <Text style={styles.payButtonText}>
                      Pay {formatAmount(headline.amount, headline.currency) ?? ''} by mobile money
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {partialOpen ? (
                <View style={styles.partial}>
                  <TextInput
                    style={styles.partialInput}
                    value={partial}
                    onChangeText={setPartial}
                    keyboardType="numeric"
                    placeholder={`Up to ${headline.amount ?? ''}`}
                    placeholderTextColor={theme.colors.muted}
                    accessibilityLabel="Amount to pay now"
                  />
                  <TouchableOpacity
                    style={styles.partialGo}
                    activeOpacity={0.9}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Send this amount"
                    onPress={payPartial}
                  >
                    <Text style={styles.partialGoText}>Send</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.partialToggle}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Pay part of the commission instead"
                  onPress={() => { setPartialOpen(true); setError(null); }}
                >
                  <Text style={styles.partialToggleText}>Pay part of it instead</Text>
                </TouchableOpacity>
              )}
            </>
          ) : !waiting && gate.code !== 'nothing-owed' ? (
            // 'nothing-owed' is left out on purpose: the figure's own hint
            // already says the driver is square, and repeating it as a
            // refusal reads like the screen arguing with itself.
            <Text style={styles.blocked}>{gate.reason}</Text>
          ) : null}

          {/* Jobs last. They are the evidence behind the figure, not the point
              of the screen. */}
          {unsettled.length > 0 ? (
            <>
              <Text style={styles.groupHeading}>Not yet settled</Text>
              <View style={styles.rows}>
                {unsettled.map((job) => (
                  <View key={job.orderId} style={styles.row}>
                    <View style={[styles.rail, { backgroundColor: theme.colors.warning }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle}>Trip #{job.orderId}</Text>
                        <Text style={styles.rowAmount}>
                          {formatAmount(job.amount, job.currency) ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.rowTop}>
                        <Text
                          style={[
                            styles.rowStatus,
                            {
                              color: job.platformFee === null
                                ? theme.colors.muted
                                : theme.colors.warning,
                            },
                          ]}
                        >
                          {jobCommissionLabel(job)}
                        </Text>
                        <Text style={styles.rowDate}>{dayLabel(job.collectedAt)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {settled.length > 0 ? (
            <>
              <Text style={styles.groupHeading}>Settled</Text>
              <View style={styles.rows}>
                {settled.map((job) => (
                  <View key={job.orderId} style={styles.row}>
                    <View style={[styles.rail, { backgroundColor: theme.colors.success }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle}>Trip #{job.orderId}</Text>
                        <Text style={styles.rowAmount}>
                          {formatAmount(job.amount, job.currency) ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.rowTop}>
                        <Text style={[styles.rowStatus, { color: theme.colors.success }]}>
                          Commission paid
                        </Text>
                        <Text style={styles.rowDate}>{dayLabel(job.settledAt)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {jobs.length === 0 ? (
            <Text style={styles.empty}>You have not taken any fares in cash yet.</Text>
          ) : null}
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
  owedCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginTop: 4,
  },
  owedLabel: { color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  owedFigure: { ...theme.type.display, marginTop: 6, fontFamily: theme.fonts.mono },
  owedHint: { color: theme.colors.muted, ...theme.type.micro, marginTop: 6, fontFamily: theme.fonts.body },
  warn: { color: theme.colors.warning, ...theme.type.label, marginTop: 12, fontFamily: theme.fonts.body },
  byCurrency: { marginTop: 12, gap: 6 },
  byCurrencyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  byCurrencyUnit: { color: theme.colors.muted, ...theme.type.bodySm, fontFamily: theme.fonts.body },
  byCurrencyAmount: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.mono },
  waiting: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginTop: 16,
  },
  waitingLabel: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  waitingDetail: { color: theme.colors.muted, ...theme.type.micro, marginTop: 3, fontFamily: theme.fonts.body },
  notice: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 14, fontFamily: theme.fonts.body },
  payButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: 15,
    marginTop: 18,
  },
  payButtonBusy: { opacity: 0.7 },
  payButtonText: { color: theme.colors.bg, ...theme.type.body, fontFamily: theme.fonts.bodySemiBold },
  partialToggle: { alignSelf: 'center', marginTop: 12, paddingVertical: 6 },
  partialToggleText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  partial: { flexDirection: 'row', gap: 10, marginTop: 12 },
  partialInput: {
    flex: 1,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    ...theme.type.body,
    fontFamily: theme.fonts.mono,
  },
  partialGo: {
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  partialGoText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  blocked: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 18, fontFamily: theme.fonts.body },
  groupHeading: {
    color: theme.colors.muted,
    ...theme.type.label,
    marginTop: 26,
    fontFamily: theme.fonts.bodySemiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rows: { marginTop: 12, gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 3, borderRadius: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowTitle: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  rowAmount: { color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.mono },
  rowStatus: { ...theme.type.micro, fontFamily: theme.fonts.bodySemiBold },
  rowDate: { color: theme.colors.muted, ...theme.type.micro, fontFamily: theme.fonts.mono },
  empty: { color: theme.colors.muted, ...theme.type.bodySm, marginTop: 20, fontFamily: theme.fonts.body },
  secondary: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  secondaryText: { color: theme.colors.primary, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
});
