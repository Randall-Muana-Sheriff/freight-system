import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { paymentPolicy } from '../lib/paymentPolicy';
import {
  requestMomoPayment,
  fetchPaymentStatus,
  recordCashPayment,
  type OrderDetail,
  type PaymentAttempt,
} from '../lib/api';

// Asking for the fare at the door.
//
// There was no payment UI at all: the endpoints existed and nothing consumed
// them, so a driver handed over a load and had no way to take money for it or
// to record that they had. A cash job and an unpaid job were the same row,
// which means an honest driver and one who pocketed the fare looked identical.
//
// Every refusal this can hit is decided in lib/paymentPolicy.ts before a
// button is drawn, so the common case is a driver being told why rather than
// tapping into a 409.

// How often to ask MTN whether the customer has finished. The webhook may not
// arrive and may never, so this poll is the answer, not a backup to it.
const POLL_MS = 4000;
// Long enough for someone to find their phone and remember a PIN, short
// enough that a driver is not held at a gate by a prompt nobody answered.
const GIVE_UP_MS = 3 * 60 * 1000;

// The refusals a different handset actually fixes. Offered as a recovery
// rather than an error, because "they booked on Airtel and are holding an MTN
// phone" is the ordinary case, not an exception.
const FIXABLE_BY_ANOTHER_NUMBER = ['PAYMENT_WRONG_NETWORK', 'PAYMENT_NO_NUMBER', 'PAYMENT_INVALID_NUMBER'];

type Phase = 'idle' | 'requesting' | 'waiting' | 'recording';

export function CollectPaymentCard({
  order, token, onSettled,
}: {
  order: OrderDetail | null;
  token: string;
  onSettled: () => void;
}) {
  const policy = paymentPolicy(order);
  const [phase, setPhase] = useState<Phase>('idle');
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altNumber, setAltNumber] = useState('');
  const [askForNumber, setAskForNumber] = useState(false);
  const startedAt = useRef<number>(0);

  // Polling lives here rather than in the parent's 25s order poll: while a
  // customer is holding their phone, a minute-old answer is the wrong answer.
  useEffect(() => {
    if (phase !== 'waiting' || !order) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await fetchPaymentStatus(token, order.id);
        if (cancelled) return;
        setAttempt(result.attempt);

        if (result.paymentStatus === 'PAID') {
          setPhase('idle');
          setNotice('Paid. The customer\'s payment came through.');
          onSettled();
          return;
        }
        if (result.attempt && result.attempt.status !== 'PENDING') {
          setPhase('idle');
          setError(result.attempt.failureReason || 'The customer did not complete the payment.');
          return;
        }
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
          setPhase('idle');
          // Not called a failure: MTN may still settle it. The driver needs
          // to stop waiting, not to be told the money is gone.
          setError('No answer to the prompt yet. Take cash instead, or ask dispatch to check before you leave.');
        }
      } catch {
        // A dropped connection mid-poll is not a failed payment. Keep
        // waiting — the next tick asks again, and the server reconciles
        // against MTN whenever it is next asked.
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase, order, token, onSettled]);

  if (!policy.show || !order) return null;

  const askForMomo = async (payFrom?: string) => {
    setPhase('requesting');
    setError(null);
    setNotice(null);
    try {
      const result = await requestMomoPayment(token, order.id, payFrom);
      setNotice(result.message);
      setAskForNumber(false);
      setAltNumber('');
      startedAt.current = Date.now();
      setPhase('waiting');
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Could not ask for payment.');
      if (code && FIXABLE_BY_ANOTHER_NUMBER.includes(code)) setAskForNumber(true);
    }
  };

  const takeCash = () => {
    Alert.alert(
      'Record cash taken?',
      `Confirm you have the ${policy.amount ?? 'fare'} in hand. This is the record that you collected it.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'I have it',
          onPress: () => {
            void (async () => {
              setPhase('recording');
              setError(null);
              setNotice(null);
              try {
                const result = await recordCashPayment(token, order.id);
                setNotice(result.message);
                onSettled();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not record that cash payment.');
              } finally {
                setPhase('idle');
              }
            })();
          },
        },
      ]
    );
  };

  const busy = phase !== 'idle';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={policy.paid ? 'checkmark-circle' : 'cash-outline'}
          size={18}
          color={policy.paid ? theme.colors.success : theme.colors.primary}
        />
        <Text style={styles.title}>{policy.paid ? policy.paidLabel : 'Fare to collect'}</Text>
      </View>

      {policy.amount ? (
        <Text style={[styles.amount, policy.paid && styles.amountPaid]}>{policy.amount}</Text>
      ) : null}

      {/* Said out loud rather than shown as a bare number. An amount with no
          unit beside it is the one case where a driver could ask for the
          wrong thing without anything looking wrong. */}
      {policy.currencyMissing ? (
        <Text style={styles.warn}>No currency recorded on this job — check the amount with dispatch.</Text>
      ) : null}

      {policy.note ? <Text style={styles.note}>{policy.note}</Text> : null}
      {policy.momo.reason ? <Text style={styles.note}>{policy.momo.reason}</Text> : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase === 'waiting' ? (
        <View style={styles.waiting}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.waitingText}>
            Waiting for the customer to enter their PIN{attempt?.payer ? ` on ${attempt.payer}` : ''}…
          </Text>
        </View>
      ) : null}

      {askForNumber ? (
        <View style={styles.altWrap}>
          <Text style={styles.note}>Ask the customer for an MTN number to send the prompt to.</Text>
          <TextInput
            style={styles.input}
            value={altNumber}
            onChangeText={setAltNumber}
            placeholder="07…"
            placeholderTextColor={theme.colors.muted}
            keyboardType="phone-pad"
            accessibilityLabel="Customer's MTN number"
          />
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, (busy || altNumber.trim().length < 9) && styles.buttonDisabled]}
            disabled={busy || altNumber.trim().length < 9}
            onPress={() => void askForMomo(altNumber.trim())}
            accessibilityRole="button"
            accessibilityLabel="Send the prompt to that number"
          >
            <Text style={styles.buttonPrimaryText}>Send to that number</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {policy.momo.allowed || policy.cash.allowed ? (
        <View style={styles.actions}>
          {policy.momo.allowed && !askForNumber ? (
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => void askForMomo()}
              accessibilityRole="button"
              accessibilityLabel="Ask for mobile money"
            >
              {phase === 'requesting' ? (
                <ActivityIndicator color={theme.colors.ink} size="small" />
              ) : (
                <>
                  <Ionicons name="phone-portrait-outline" size={15} color={theme.colors.ink} />
                  <Text style={styles.buttonPrimaryText}>Ask for mobile money</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {policy.cash.allowed ? (
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={takeCash}
              accessibilityRole="button"
              accessibilityLabel="Record cash taken"
            >
              {phase === 'recording' ? (
                <ActivityIndicator color={theme.colors.text} size="small" />
              ) : (
                <Text style={styles.buttonText}>Took cash</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginTop: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: theme.colors.text, ...theme.type.bodySm, fontFamily: theme.fonts.bodySemiBold },
  amount: { color: theme.colors.text, ...theme.type.title, marginTop: 8, fontFamily: theme.fonts.mono },
  amountPaid: { color: theme.colors.success },
  warn: { color: theme.colors.warning, ...theme.type.label, marginTop: 6, fontFamily: theme.fonts.body },
  note: { color: theme.colors.muted, ...theme.type.label, marginTop: 8, fontFamily: theme.fonts.body },
  notice: { color: theme.colors.primary, ...theme.type.label, marginTop: 8, fontFamily: theme.fonts.body },
  error: { color: theme.colors.danger, ...theme.type.label, marginTop: 8, fontFamily: theme.fonts.body },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  waitingText: { flex: 1, color: theme.colors.muted, ...theme.type.label, fontFamily: theme.fonts.body },
  altWrap: { marginTop: 10, gap: 8 },
  input: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    ...theme.type.body,
    fontFamily: theme.fonts.mono,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 44,
  },
  buttonPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, flexGrow: 1 },
  buttonPrimaryText: { color: theme.colors.ink, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  buttonText: { color: theme.colors.text, ...theme.type.label, fontFamily: theme.fonts.bodySemiBold },
  buttonDisabled: { opacity: 0.5 },
});
