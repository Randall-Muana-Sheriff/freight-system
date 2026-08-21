import type { DriverAssignment } from './api';

export type DriverAssignmentCard = {
  id: number;
  title: string;
  route: string;
  destination: string;
  eta: string;
  status: string;
  priority: 'high' | 'normal' | 'low';
  /** The customer's own note, if they left one. */
  note: string | null;
  /** What the job pays, in RWF, already net of the platform's fee and
   *  already covering the run's fuel. Null when no price has been worked
   *  out yet. */
  payRwf: number | null;
  /** True while that pay was priced from weight alone and can still move,
   *  because dispatch has not pinned the job to the map yet. */
  payIsEstimate: boolean;
};

// A job is "in progress" once a driver has physically picked it up — before
// that it's just waiting in the queue. Shared by the home and jobs screens
// so their grouping logic can never drift apart.
const IN_PROGRESS_STATUSES = ['picked up', 'in transit', 'arrived'];

// Accepts either form of the status: the prettified value the assignment
// cards carry ("In transit") or the raw API value ("IN_TRANSIT"). Without
// the underscore swap this silently only ever matched ARRIVED when passed
// a raw status — which is exactly what trip/[id].tsx does, so the live
// route-progress section and its polling stayed hidden through PICKED_UP
// and IN_TRANSIT and only appeared once the driver had already arrived.
export function isJobInProgress(status: string) {
  return IN_PROGRESS_STATUSES.includes(status.toLowerCase().replace(/_/g, ' '));
}

function prettyStatus(status?: string) {
  if (!status) return 'Assigned';
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// What a driver needs off a card is where to go, in words. A hub name is
// words; a coordinate pair is not — "-1.9396, 30.0617" told them nothing
// they could act on without opening the map. Customer-placed orders carry
// the address the customer actually typed, so prefer that over both.
function describePlace(text?: string | null, hub?: string, lat?: number, lng?: number) {
  if (text && text.trim()) return text.trim();
  if (hub && hub.trim()) return hub.trim();
  if (lat != null && lng != null) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return null;
}

export function toDriverAssignmentCard(order: DriverAssignment): DriverAssignmentCard {
  const title = order.cargo_description || `Shipment #${order.id}`;
  const origin = describePlace(order.pickup_address_text, order.origin_hub_name);
  const destination = describePlace(
    order.delivery_address_text,
    undefined,
    order.delivery_lat,
    order.delivery_lng
  );

  return {
    id: order.id,
    title,
    // Says plainly when dispatch has not set the pickup yet, rather than
    // inventing "Assigned route" — a driver who reads that heads off with
    // no idea anything is missing.
    route: `${origin ?? 'Pickup to be confirmed'} → ${destination ?? 'Destination to be confirmed'}`,
    destination: destination ?? 'Destination to be confirmed',
    eta: 'Dispatch-managed',
    status: prettyStatus(order.status),
    priority: order.priority || 'normal',
    // Carried onto the list card, not just the trip screen. A note that
    // changes what a driver does before they set off — a gate code, "the
    // yard closes at four" — is worth nothing if it is only found on
    // arrival, which is when a job usually gets opened.
    note: order.special_instructions?.trim() || null,
    // Shown on the card rather than only inside the job. Under the model
    // where drivers are independent this is the figure a job is accepted or
    // declined on, and a number you have to open a job to find is no use for
    // choosing between two of them.
    payRwf: order.driver_net_rwf == null ? null : Number(order.driver_net_rwf),
    payIsEstimate: order.price_is_estimate === true,
  };
}
