// Where a job is, and what it may do next.
//
// Pulled out of trip/[id].tsx because this is where a whole class of bug
// lived and could not be tested. Both functions below used to answer "step
// zero, fresh job" for any status they did not recognise, and a cancelled
// order is exactly such a status — so a job that had been called off rendered
// as a new one, with a live "I'm at the pickup" button on it. The same hole
// had already been found and patched once for OFFERED, at the call site,
// which is a sign it belonged here rather than there.

// The simplified 4-step visual timeline the driver sees.
export const TIMELINE_STEPS = ['Accepted', 'Picked up', 'In transit', 'Delivered'];

// The real backend statuses, in the order a job moves through them. Also the
// forward-progression order for deciding which single action button is next —
// a driver can only ever be shown the one status ahead of where they are.
export const STATUS_ORDER = ['ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

export type ActionStatus = 'AT_PICKUP' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED';

// AT_PICKUP leads, so a driver sitting at a gate can say so before they have
// anything to transit with. PICKED_UP is deliberately absent: this app has
// never sent it, and adding a step nobody asked for to a flow drivers already
// know is a worse trade than leaving one status unused.
const OFFERABLE_ACTIONS: ActionStatus[] = ['AT_PICKUP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

// Terminal per the router's own state machine (utils/orderTransitions.js).
// Nothing is ahead of these and nothing may be done to them.
const TERMINAL = ['DELIVERED', 'CANCELLED'];

function normalise(status?: string): string {
  return (status || '').toUpperCase();
}

export function isCancelled(status?: string): boolean {
  return normalise(status) === 'CANCELLED';
}

// Work the driver has not agreed to yet. Until they answer, none of the
// ordinary job controls belong on screen: "start transit" on a job you have
// not taken is an accept button wearing the wrong label.
export function isOffer(status?: string): boolean {
  return normalise(status) === 'OFFERED';
}

export function isTerminal(status?: string): boolean {
  return TERMINAL.includes(normalise(status));
}

// Which timeline dot is lit. -1 means none of them, which is the honest
// answer for a cancelled job: it is not at step zero, it is nowhere on this
// ladder at all. Callers compare with < and ===, so -1 lights nothing rather
// than wrongly marking the first step as current.
export function stepIndexForStatus(status?: string): number {
  switch (normalise(status)) {
    case 'CANCELLED':
      return -1;
    case 'ASSIGNED':
    // Waiting at the pickup is still the pickup stage as far as the progress
    // dots go -- it is a state within collecting the load, not a step past it.
    case 'AT_PICKUP':
      return 0;
    case 'PICKED_UP':
      return 1;
    case 'IN_TRANSIT':
    case 'ARRIVED':
      return 2;
    case 'DELIVERED':
      return 3;
    default:
      return 0;
  }
}

// The one status ahead of where this job actually is, or undefined when there
// is nothing legitimate to offer. Once an action is taken the status moves
// forward and this recomputes, so a completed step's button cannot show again.
export function nextActionForStatus(status?: string): ActionStatus | undefined {
  // Guarded before the index lookup, not after. A terminal status is not on
  // STATUS_ORDER in a way that helps — CANCELLED is not on it at all, which
  // is precisely how it used to fall through to index 0 and offer the first
  // action on a job that had been called off.
  if (isTerminal(status) || isOffer(status)) return undefined;

  const current = STATUS_ORDER.indexOf(normalise(status));
  // Still unknown after all that. Treated as the start of the journey, which
  // is the long-standing behaviour for a status this app has not been taught
  // (PENDING, say) — but only ever reached by something non-terminal.
  const currentIndex = current === -1 ? 0 : current;

  return OFFERABLE_ACTIONS.find((action) => STATUS_ORDER.indexOf(action) > currentIndex);
}
