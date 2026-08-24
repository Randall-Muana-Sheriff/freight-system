// What a cash job means to the driver holding the money.
//
// The mirror of lib/earnings.ts, and the harder of the two to get right.
// Earnings is money coming toward the driver; this is money already in their
// pocket that is not all theirs. A driver who took 40,000 francs in fares this
// week is not 40,000 francs better off — some of it is the platform's share
// and they will be asked for it. The whole job of this screen is to make that
// number impossible to lose track of before it is spent.
//
// Two distinctions are load-bearing here and both come from the server:
//
//   * A commission of null is NOT a commission of zero. "We have not worked
//     out what you owe" and "you owe nothing" lead a driver to opposite
//     decisions about the notes in their hand.
//   * A total across two currencies is not a total. Adding francs to dollars
//     produces a number that cannot be labelled, and labelling it anyway is
//     how a driver gets charged 2,015 francs for a debt of 2,000 francs and
//     15 dollars.

import { formatAmount } from './paymentPolicy';
import type { DriverCashJob, DriverCashSummary } from './api';

export { formatAmount };

export type CashTone = 'good' | 'pending' | 'bad' | 'neutral';

export type SettlementMeaning = {
  label: string;
  detail: string;
  tone: CashTone;
  /** Whether the app should keep polling this reference for a resolution. */
  settled: boolean;
};

function normalise(status?: string | null): string {
  return (status || '').toUpperCase();
}

/** Said in terms of what the driver still owes, not a database column. */
export function explainSettlement(
  row: { status: string; failure_reason?: string | null }
): SettlementMeaning {
  switch (normalise(row.status)) {
    case 'SUCCESSFUL':
      return {
        label: 'Paid',
        detail: 'The commission has been paid. Nothing more to do.',
        tone: 'good',
        settled: true,
      };

    case 'PENDING':
      return {
        label: 'Waiting for your PIN',
        detail: 'Check your phone for the mobile money prompt and enter your PIN.',
        tone: 'pending',
        settled: false,
      };

    case 'FAILED':
      return {
        label: 'Not paid',
        // Deliberately not "try again" on its own. The commonest causes are no
        // float and a cancelled prompt, and both are fixed off the phone.
        detail: row.failure_reason
          ? `${row.failure_reason} You still owe this — try again, or hand it to dispatch.`
          : 'The payment did not go through. You still owe this — try again, or hand it to dispatch.',
        tone: 'bad',
        settled: true,
      };

    case 'TIMED_OUT':
      return {
        label: 'No answer',
        // Not called a failure: MTN may yet settle it, and telling a driver
        // the money is gone when it may have left their wallet is worse than
        // telling them to check.
        detail: 'The prompt was not answered in time. Check your wallet before paying again.',
        tone: 'neutral',
        settled: true,
      };

    default:
      return {
        label: normalise(row.status) || 'Unknown',
        detail: 'Dispatch can say where this one is.',
        tone: 'neutral',
        settled: true,
      };
  }
}

/** What the owed figure can honestly be called, and why it might be wrong.
 *
 *  Returns the amount to show plus, when the number is not the whole story, a
 *  caveat the screen is expected to render next to it rather than swallow. */
export function owedHeadline(summary: DriverCashSummary | null): {
  amount: number | null;
  currency: string | null;
  caveat: string | null;
  /** The sentence under the figure. Never says the driver is square unless
   *  they actually are — a zero that exists because nobody has worked the
   *  fees out yet is the one case that must not read as settled. */
  hint: string;
  /** What the figure means, for colour. 'clear' is the only reassuring one
   *  and is reachable only when the total is both zero and complete. */
  tone: 'owing' | 'clear' | 'unknown';
  /** True when the figure shown is a floor rather than the full debt. */
  incomplete: boolean;
} {
  if (!summary) {
    return {
      amount: null, currency: null, caveat: null, incomplete: false,
      hint: 'Loading your cash jobs.', tone: 'unknown',
    };
  }

  const unknown = summary.commissionOwedUnknownJobs ?? 0;
  const mixed = summary.byCurrency.length > 1;

  if (mixed) {
    // No single figure is honest here, so none is offered. The per-currency
    // rows carry the real answer and the screen shows those instead.
    return {
      amount: null,
      currency: null,
      caveat: 'Your cash jobs are in more than one currency, so they cannot be added up. '
        + 'The amounts are listed separately below.',
      hint: 'The platform\'s share of the fares you took in cash.',
      tone: 'unknown',
      incomplete: unknown > 0,
    };
  }

  const owed = summary.commissionOwed ?? 0;
  // The order of these three matters. A zero with unworked-out fees is NOT
  // square, and checking `owed > 0` first would let it fall through to the
  // reassuring branch — which is precisely the mistake this screen exists to
  // stop a driver making with the notes in their hand.
  const tone: 'owing' | 'clear' | 'unknown' =
    owed > 0 ? 'owing' : unknown > 0 ? 'unknown' : 'clear';

  return {
    amount: summary.commissionOwed,
    currency: summary.currency,
    caveat: unknown > 0
      ? `${unknown} ${unknown === 1 ? 'job has' : 'jobs have'} no commission worked out yet, `
        + 'so you may owe more than this.'
      : null,
    hint: tone === 'owing'
      ? 'The platform\'s share of the fares you took in cash.'
      : tone === 'unknown'
        ? 'Do not treat this as settled — some jobs still need a commission worked out.'
        : 'You are square. Nothing outstanding.',
    tone,
    incomplete: unknown > 0,
  };
}

// The code lets the screen decide whether the refusal adds anything the
// headline has not already said. Without it the "nothing outstanding" case
// printed twice — once as the figure's own hint and once as a blocked reason
// — which reads like the screen is arguing with itself.
export type SettleBlockCode = 'loading' | 'mixed-currency' | 'unknown-fees' | 'nothing-owed';

export type SettleBlock =
  | { canSettle: true; reason: null; code: null }
  | { canSettle: false; reason: string; code: SettleBlockCode };

/** Whether to offer the pay-now button at all, decided before it is drawn.
 *
 *  Every refusal here is one the server also enforces. Checking first means a
 *  driver is told why rather than tapping into a 409, which is the same
 *  arrangement CollectPaymentCard has with paymentPolicy. */
export function canSettleNow(summary: DriverCashSummary | null): SettleBlock {
  if (!summary) return { canSettle: false, reason: 'Loading your cash jobs.', code: 'loading' };

  if (summary.byCurrency.length > 1) {
    return {
      canSettle: false,
      code: 'mixed-currency',
      reason: 'This cannot be paid in one prompt. Hand it to dispatch instead.',
    };
  }

  const owed = summary.commissionOwed ?? 0;
  if (owed <= 0) {
    // An unknown-fee job is not nothing, so the message has to differ.
    return (summary.commissionOwedUnknownJobs ?? 0) > 0
      ? {
          canSettle: false,
          code: 'unknown-fees',
          reason: 'Your commission has not been worked out yet. Dispatch can tell you what you owe.',
        }
      : { canSettle: false, code: 'nothing-owed', reason: 'You have nothing outstanding.' };
  }

  return { canSettle: true, reason: null, code: null };
}

/** What one cash job's commission line should say.
 *
 *  Null is rendered as its own sentence rather than as 0, for the same reason
 *  the server sends null rather than coercing: the two mean different things
 *  and only one of them is safe to spend against. */
export function jobCommissionLabel(job: Pick<DriverCashJob, 'platformFee' | 'currency'>): string {
  if (job.platformFee === null) return 'Commission not worked out yet';
  return `${formatAmount(job.platformFee, job.currency) ?? '0'} commission`;
}

/** Validate a partial amount before it costs a round trip.
 *
 *  Partial payment exists because a driver may genuinely only have part of it
 *  on them. It is capped at the debt because this endpoint settles commission
 *  — it is not a way to send the platform arbitrary money. */
export function validatePartial(
  raw: string,
  owed: number | null,
  currency: string | null
): { ok: true; amount: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Enter how much you are paying.' };

  // Accept "2 000" and "2,000" — a number pad and a habit of grouping should
  // not read as a bad amount.
  const cleaned = trimmed.replace(/[\s,]/g, '');
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: 'Enter how much you are paying.' };
  }
  if (owed !== null && value > owed + 0.01) {
    return {
      ok: false,
      error: `You owe ${formatAmount(owed, currency) ?? owed}. You cannot pay more than that here.`,
    };
  }
  return { ok: true, amount: value };
}
