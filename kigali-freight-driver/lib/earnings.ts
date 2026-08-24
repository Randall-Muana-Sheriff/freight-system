// What a payout row means to the person waiting for the money.
//
// Its own module because the model behind this screen is not obvious and the
// screen has to tell the truth about it: a payout row is created the moment
// the customer pays, NOT when the money is sent. The transfer follows a few
// minutes later on a worker, deliberately — it is irreversible and costs a
// fee, so there is a short window before it goes.
//
// That gap is the whole reason this file exists. A driver paid at a gate
// should see the earning immediately, and must not be told it is in their
// wallet when it is not: they may go and look.

// Reuses the one formatter rather than growing a second. An amount with no
// unit beside it is the failure this guards — see the note on formatAmount
// itself, and the "1496 null" a first run printed at a real driver.
import { formatAmount } from './paymentPolicy';

export { formatAmount };

export type PayoutRow = {
  id: number;
  order_id: number;
  amount: number;
  currency: string | null;
  status: string;
  release_at: string | null;
  sent_at: string | null;
  created_at: string;
  failure_reason: string | null;
};

export type PayoutTone = 'good' | 'pending' | 'bad' | 'neutral';

export type PayoutMeaning = {
  label: string;
  detail: string;
  tone: PayoutTone;
  // Whether this row is waiting on a person rather than on a timer.
  needsAction: boolean;
};

function normalise(status?: string | null): string {
  return (status || '').toUpperCase();
}

/** Said in terms of where the money is, not in terms of a database column. */
export function explainPayout(row: Pick<PayoutRow, 'status' | 'release_at' | 'failure_reason'>): PayoutMeaning {
  switch (normalise(row.status)) {
    case 'SUCCESSFUL':
      return { label: 'Paid', detail: 'In your mobile money wallet.', tone: 'good', needsAction: false };

    case 'SENDING':
      return {
        label: 'Sending',
        // Accepted by MTN, not yet confirmed landed. Saying "paid" here would
        // send a driver to check a wallet that has nothing new in it.
        detail: 'Sent to mobile money. It should land shortly.',
        tone: 'pending',
        needsAction: false,
      };

    case 'QUEUED':
      return {
        label: 'On the way',
        detail: releaseLabel(row.release_at),
        tone: 'pending',
        needsAction: false,
      };

    case 'FAILED':
      return {
        label: 'Did not send',
        // Five attempts are exhausted by the time a row reads FAILED, so
        // waiting is not a strategy. The driver is told to go to a person.
        detail: row.failure_reason
          ? `${row.failure_reason} Contact dispatch — this will not retry on its own.`
          : 'This transfer failed and will not retry on its own. Contact dispatch.',
        tone: 'bad',
        needsAction: true,
      };

    case 'HELD':
      return {
        label: 'Held',
        detail: 'Held before sending. Dispatch can say why.',
        tone: 'neutral',
        needsAction: true,
      };

    default:
      // A status this app has not been taught. Rendered rather than crashed,
      // and never quietly called paid.
      return {
        label: normalise(row.status) || 'Unknown',
        detail: 'Dispatch can say where this one is.',
        tone: 'neutral',
        needsAction: true,
      };
  }
}

function releaseLabel(releaseAt: string | null): string {
  if (!releaseAt) return 'Earned. Waiting to be sent.';
  const at = new Date(releaseAt).getTime();
  if (!Number.isFinite(at)) return 'Earned. Waiting to be sent.';

  const minutes = Math.round((at - Date.now()) / 60000);
  if (minutes <= 0) return 'Earned. Due to be sent any moment.';
  if (minutes < 60) return `Earned. Sending in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Earned. Sending in about ${hours} hour${hours === 1 ? '' : 's'}.`;
  return 'Earned. Waiting to be sent.';
}

/** The unit to put on a total, or null when there is no honest one.
 *
 *  The server's paidOut and onTheWay are bare sums with no currency attached,
 *  while each payout carries its own. That is fine while every row is in the
 *  same currency and a lie the moment one is not — adding francs to something
 *  else and labelling the result francs. Null means "show the figure without
 *  a unit", which is the same rule the fare card follows. */
export function currencyForTotals(payouts: Pick<PayoutRow, 'currency'>[]): string | null {
  const found = uniqueCurrencies(payouts);
  return found.length === 1 ? found[0] : null;
}

/** True when the totals cover more than one currency, so a single figure
 *  cannot be labelled honestly and the screen should say so rather than
 *  quietly drop the unit. */
export function hasMixedCurrencies(payouts: Pick<PayoutRow, 'currency'>[]): boolean {
  return uniqueCurrencies(payouts).length > 1;
}

/** Distinct currencies, case-folded, blanks dropped.
 *
 *  Case matters here for the same reason it does in the router's
 *  utils/money.js: 'rwf' and 'RWF' are one currency everywhere it counts —
 *  momoClient uppercases before charging, and the payout totals are now
 *  grouped by UPPER(TRIM(currency)). Comparing raw strings here would split
 *  one currency into two, strip the unit off both totals, and print a warning
 *  that the driver's jobs are in more than one currency when they are not. */
function uniqueCurrencies(rows: Pick<PayoutRow, 'currency'>[]): string[] {
  return [...new Set(rows.map((p) => (p.currency || '').trim().toUpperCase()).filter(Boolean))];
}
