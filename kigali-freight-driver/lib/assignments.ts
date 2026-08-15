import { DriverAssignment } from './api';

export type DriverAssignmentCard = {
  id: number;
  title: string;
  route: string;
  destination: string;
  eta: string;
  status: string;
  priority: 'high' | 'normal' | 'low';
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
  };
}
