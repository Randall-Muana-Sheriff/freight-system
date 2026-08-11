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

export function toDriverAssignmentCard(order: DriverAssignment): DriverAssignmentCard {
  const title = order.cargo_description || `Shipment #${order.id}`;
  const origin = order.origin_hub_name || 'Assigned route';
  const destination = order.delivery_lat != null && order.delivery_lng != null
    ? `${order.delivery_lat.toFixed(4)}, ${order.delivery_lng.toFixed(4)}`
    : 'Destination pending';

  return {
    id: order.id,
    title,
    route: `${origin} -> Delivery`,
    destination,
    eta: 'Dispatch-managed',
    status: prettyStatus(order.status),
    priority: order.priority || 'normal',
  };
}
