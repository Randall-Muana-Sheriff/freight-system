// What the driver may do about money on this job, and what to say when the
// answer is nothing.
//
// Its own module for the same reason explainRejection is: every branch here
// is a sentence somebody reads while standing at a customer's gate, and the
// server refuses each of these cases with a 409 anyway. Deciding it on the
// phone means the driver is told BEFORE they tap, rather than after a round
// trip that ends in a refusal — and it means the wording can be tested.
//
// Mirrors the gates in the router's paymentService. Deliberately duplicated
// rather than inferred: the server is the authority and refuses regardless,
// this is only about not offering something that cannot work.

export type PaymentFacts = {
  status?: string;
  payment_status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  price_total?: number | string | null;
  currency?: string | null;
  price_is_estimate?: boolean | null;
};

export type MethodVerdict = { allowed: boolean; reason: string | null };

export type PaymentPolicy = {
  // Whether the trip screen shows a payment section at all.
  show: boolean;
  paid: boolean;
  paidLabel: string | null;
  // Formatted for a human, or null when there is no price to show.
  amount: string | null;
  // A price with no currency on it. Real: eight orders in this database carry
  // one. It does not stop cash — it stops mobile money, which cannot send a
  // number with no unit.
  currencyMissing: boolean;
  momo: MethodVerdict;
  cash: MethodVerdict;
  // Said above the buttons when neither is possible, or when the driver has
  // put themselves somewhere they cannot collect from.
  note: string | null;
};

// The two states the server will take money from. Not DELIVERED: closing the
// job first shuts the door on recording the fare.
const COLLECTABLE_FROM = ['IN_TRANSIT', 'ARRIVED'];

function normalise(value?: string | null): string {
  return (value || '').toUpperCase();
}

function toNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The amount, never with the word "null" standing in for a currency.
 *
 *  An order can carry a price and no currency, and printing "1496 null" at a
 *  driver about to ask a customer for it is worse than printing the bare
 *  number. The unit is omitted and the missing currency is reported
 *  separately, where it can be explained. */
export function formatAmount(price?: number | string | null, currency?: string | null): string | null {
  const amount = toNumber(price);
  if (amount === null) return null;
  const figure = amount.toLocaleString('en-RW', { maximumFractionDigits: 0 });
  const unit = (currency || '').trim();
  return unit ? `${figure} ${unit}` : figure;
}

export function paymentPolicy(order: PaymentFacts | null | undefined): PaymentPolicy {
  const blank: PaymentPolicy = {
    show: false, paid: false, paidLabel: null, amount: null, currencyMissing: false,
    momo: { allowed: false, reason: null },
    cash: { allowed: false, reason: null },
    note: null,
  };
  if (!order) return blank;

  const status = normalise(order.status);
  const price = toNumber(order.price_total);
  const currencyMissing = price !== null && !(order.currency || '').trim();
  const amount = formatAmount(order.price_total, order.currency);

  // Nothing about money belongs on a job the driver has not accepted or one
  // that was called off.
  if (status === 'OFFERED' || status === 'CANCELLED') return blank;

  if (normalise(order.payment_status) === 'PAID') {
    const method = normalise(order.payment_method);
    return {
      ...blank,
      show: true,
      paid: true,
      paidLabel: method === 'CASH' ? 'Paid in cash'
        : method === 'MOMO' ? 'Paid by mobile money'
        : 'Paid',
      amount,
      currencyMissing,
    };
  }

  // Unpaid from here down.

  if (price === null) {
    return {
      ...blank,
      show: true,
      note: 'Dispatch has not put a price on this job yet, so there is nothing to collect.',
    };
  }

  if (order.price_is_estimate) {
    return {
      ...blank,
      show: true,
      amount,
      currencyMissing,
      // Named as a quote, because showing an estimate next to "collect" is
      // how the wrong amount gets taken. It measured 15 to 48 per cent under
      // the real figure, and mobile money is not pleasant to reverse.
      note: 'This is an estimate, not a final price. Dispatch has to confirm it before anyone can be charged.',
    };
  }

  if (status === 'DELIVERED') {
    return {
      ...blank,
      show: true,
      amount,
      currencyMissing,
      // The one that catches people. The fare is collected at the door, and
      // closing the job first shuts the door: the server will not record a
      // payment on a delivered order.
      note: 'This job was closed before the fare was recorded. Payment can no longer be taken here — tell dispatch.',
    };
  }

  if (!COLLECTABLE_FROM.includes(status)) {
    return {
      ...blank,
      show: true,
      amount,
      currencyMissing,
      note: 'You can take the fare once you are on the road with this load.',
    };
  }

  return {
    ...blank,
    show: true,
    amount,
    currencyMissing,
    momo: currencyMissing
      ? {
          allowed: false,
          // Cash still works, and saying so in the same breath is the
          // difference between a blocked driver and an informed one.
          reason: 'No currency on this job, so a mobile money prompt cannot be sent. Cash can still be recorded.',
        }
      : { allowed: true, reason: null },
    cash: { allowed: true, reason: null },
  };
}
