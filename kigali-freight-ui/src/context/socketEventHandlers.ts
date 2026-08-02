import type { Socket } from 'socket.io-client';
import type {
  TrackedAsset,
  GeofenceViolation,
  Order,
  OrderActivityEvent,
  RecentDelivery,
  Incident,
} from '../types';

type Setter<T> = (updater: T | ((prev: T) => T)) => void;

export interface SocketListenerSetters {
  setIsConnected: Setter<boolean>;
  setTrackedAssets: Setter<Record<string, TrackedAsset>>;
  setRouteHistories: Setter<Record<string, [number, number][]>>;
  setViolations: Setter<GeofenceViolation[]>;
  setActiveBreachedDrivers: Setter<Record<string, GeofenceViolation>>;
  setActiveOrders: Setter<Order[]>;
  setInFlightOrders: Setter<Order[]>;
  setOrderActivity: Setter<OrderActivityEvent[]>;
  setRecentDeliveries: Setter<RecentDelivery[]>;
  setIncidentReports: Setter<Incident[]>;
}

// Moved verbatim out of SocketContext.jsx's connectSocket — 13 handlers
// covering fleet telemetry, geofence violations, order lifecycle, and
// incidents made that function (and the file around it) hard to scan for
// "what does the context actually manage" versus "what happens on each
// wire event." Pure extraction: every handler body is unchanged, just
// parameterized through `setters` instead of closing over each setState
// function directly.
export function attachSocketListeners(socket: Socket, setters: SocketListenerSetters): void {
  const {
    setIsConnected,
    setTrackedAssets,
    setRouteHistories,
    setViolations,
    setActiveBreachedDrivers,
    setActiveOrders,
    setInFlightOrders,
    setOrderActivity,
    setRecentDeliveries,
    setIncidentReports,
  } = setters;

  socket.on('connect', () => setIsConnected(true));
  socket.on('disconnect', () => setIsConnected(false));

  socket.on('fleet:snapshot', (arr: TrackedAsset[]) => {
    const assetMap: Record<string, TrackedAsset> = {};
    const historyMap: Record<string, [number, number][]> = {};
    arr.forEach((asset) => {
      assetMap[asset.driverName] = asset;
      historyMap[asset.driverName] = [[asset.lat, asset.lng]];
    });
    setTrackedAssets(assetMap);
    setRouteHistories(historyMap);
  });

  socket.on('driver:location-update', (data: TrackedAsset) => {
    setTrackedAssets((prev) => ({ ...prev, [data.driverName]: data }));
    setRouteHistories((prev) => {
      const curr = prev[data.driverName] || [];
      return { ...prev, [data.driverName]: [...curr, [data.lat, data.lng]] };
    });
  });

  socket.on('geofence:violation', (v: GeofenceViolation) => {
    setViolations((prev) => [v, ...prev]);
    setActiveBreachedDrivers((prev) => ({ ...prev, [v.driverName]: v }));
  });

  socket.on('geofence:exit', (e: { driverName: string }) => {
    setActiveBreachedDrivers((prev) => {
      const copy = { ...prev };
      delete copy[e.driverName];
      return copy;
    });
  });

  socket.on('order:created', (order: Order) => {
    setActiveOrders((prev) => [order, ...prev]);
  });

  // An assigned order is no longer PENDING, so it drops out of the
  // active/unassigned queue rather than being updated in place. It's now
  // awaiting pickup, so it joins the in-flight (reassignable) set instead.
  socket.on('order:dispatched', ({ driverName, assignedManifest }: { driverName: string; assignedManifest: Order[] }) => {
    const dispatchedIds = new Set((assignedManifest || []).map((o) => o.id));
    setActiveOrders((prev) => prev.filter((o) => !dispatchedIds.has(o.id)));
    setInFlightOrders((prev) => [
      ...(assignedManifest || []).map((o) => ({ ...o, assigned_to: driverName })),
      ...prev,
    ]);
  });

  // Dispatcher moved an ASSIGNED order to a different driver without it
  // ever being picked up.
  socket.on('order:reassigned', ({ orderId, driverName }: { orderId: number; driverName: string }) => {
    setInFlightOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, assigned_to: driverName } : o)));
  });

  // Dispatcher sent an ASSIGNED order back to the dispatch queue with no
  // driver — order:created (above) re-adds it to activeOrders.
  socket.on('order:unassigned', ({ orderId }: { orderId: number }) => {
    setInFlightOrders((prev) => prev.filter((o) => o.id !== orderId));
  });

  socket.on('order:status-updated', (update: OrderActivityEvent) => {
    setOrderActivity((prev) => [update, ...prev].slice(0, 20));
    // Any status change away from ASSIGNED (picked up, delivered, etc.)
    // means it's no longer in the reassignable "awaiting pickup" set.
    if (update.status !== 'ASSIGNED') {
      setInFlightOrders((prev) => prev.filter((o) => o.id !== update.orderId));
    }
    // confirmDelivery includes a photoUrl on this same event — surface it
    // in the persisted deliveries list immediately, not just the
    // ephemeral activity feed.
    if (update.photoUrl) {
      setRecentDeliveries((prev) => [
        {
          id: `live-${update.orderId}-${update.timestamp}`,
          order_id: update.orderId,
          driver_name: update.driverName as string,
          photo_url: update.photoUrl as string,
          cargo_description: update.cargo_description,
          confirmed_at: update.timestamp,
          location_flagged: update.locationFlagged,
          distance_from_target_m: update.distanceFromTargetM,
        },
        ...prev,
      ]);
    }
  });

  socket.on('incident:reported', (incident: Incident) => {
    setIncidentReports((prev) => [incident, ...prev]);
  });

  socket.on('incident:status-updated', (updated: Incident) => {
    setIncidentReports((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  });
}
