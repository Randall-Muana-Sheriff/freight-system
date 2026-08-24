import type { RejectedDriverAction, PendingDriverAction } from './offlineQueue';

// Turning a refusal into something a driver can act on.
//
// The queue records `ORDERS_STATUS_OUT_OF_SEQUENCE` and a server sentence
// written for a dispatcher. Neither tells a driver the only two things they
// need: does this matter, and is there anything for me to do. Its own module
// so those sentences can be tested and argued about without rendering a
// screen.

export type RejectionSeverity = 'benign' | 'attention';

export type RejectionExplanation = {
  // What the lost work was, in the driver's terms.
  headline: string;
  // Why it did not go through, and what follows from that.
  explanation: string;
  severity: RejectionSeverity;
};

const STATUS_WORDS: Record<string, string> = {
  AT_PICKUP: 'arrived at pickup',
  PICKED_UP: 'picked up',
  IN_TRANSIT: 'in transit',
  ARRIVED: 'arrived',
  DELIVERED: 'delivered',
};

function describe(item: PendingDriverAction): string {
  if (item.type === 'delivery-photo') return `Proof of delivery for trip #${item.orderId}`;
  if (item.type === 'status-update') {
    const words = STATUS_WORDS[item.status?.toUpperCase()] ?? item.status;
    return `Trip #${item.orderId} marked ${words}`;
  }
  const title = item.payload?.title?.trim();
  return title ? `Incident report: ${title}` : 'Incident report';
}

// Keyed on the server's error code, which is stable, rather than its message,
// which is prose and changes.
const BY_CODE: Record<string, { explanation: string; severity: RejectionSeverity }> = {
  ORDERS_STATUS_OUT_OF_SEQUENCE: {
    explanation: 'Dispatch already has this trip at that step or further on, so nothing was lost.',
    severity: 'benign',
  },
  ORDERS_STATUS_TERMINAL: {
    explanation: 'This trip was already closed, so the update was not needed.',
    severity: 'benign',
  },
  ORDERS_STATUS_NEEDS_PROOF: {
    explanation: 'This step needs a proof-of-delivery photo before dispatch will accept it.',
    severity: 'attention',
  },
  ORDERS_DELIVERY_NOT_ARRIVED: {
    explanation: 'The trip has to be marked arrived before proof of delivery can be sent.',
    severity: 'attention',
  },
  AUTH_FORBIDDEN: {
    explanation: 'This job was not yours to update by the time it was sent. Check with dispatch.',
    severity: 'attention',
  },
  AUTH_INVALID_TOKEN: {
    explanation: 'Your session had expired when this was sent. Trying again should work.',
    severity: 'attention',
  },
};

export function explainRejection(entry: RejectedDriverAction): RejectionExplanation {
  const known = BY_CODE[entry.reason];

  const severity: RejectionSeverity =
    // Evidence is never written off automatically. A refused proof-of-delivery
    // photo always asks for a person, whatever the server said, because the
    // cost of wrongly calling one redundant is a delivery nobody can prove and
    // a driver who has already left the site. We have been wrong about
    // "redundant" more than once; this is the side to be wrong on.
    entry.item.type === 'delivery-photo' ? 'attention' : known?.severity ?? 'attention';

  return {
    headline: describe(entry.item),
    // An unrecognised code falls back to whatever the server said rather than
    // a shrug. New codes get added to the router faster than to this file.
    explanation: known?.explanation ?? entry.message ?? 'Dispatch would not accept this.',
    severity,
  };
}
