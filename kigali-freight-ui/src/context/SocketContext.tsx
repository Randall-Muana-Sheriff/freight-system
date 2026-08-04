import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  apiFetch, API_BASE, HttpError, fetchRoutes, fetchGeofences, fetchActiveOrders, fetchIncidents,
  fetchRecentDeliveries, fetchInFlightOrders, fetchHubs, fetchVehicleTypes, fetchDrivers, setUnauthorizedHandler,
} from '../utils/api';
import { attachSocketListeners } from './socketEventHandlers';
import type {
  UserRole, StaffUser, Hub, VehicleType, Order, OrderActivityEvent, RecentDelivery,
  Geofence, GeofenceViolation, TrackedAsset, SavedRoute, Incident,
} from '../types';

interface SocketContextValue {
  jwtToken: string;
  userRole: string;
  authError: string;
  login: (credentials: { username: string; password: string }) => Promise<'success' | 'mfa_required' | 'failed'>;
  // True between a login that returned 'mfa_required' and a successful/
  // abandoned verifyMfa call — AuthForm uses this to know whether to show
  // the second (6-digit code) step instead of the username/password form.
  mfaPending: boolean;
  verifyMfa: (payload: { code?: string; recoveryCode?: string }) => Promise<boolean>;
  cancelMfa: () => void;
  logout: () => void;
  showAdminCenter: boolean;
  setShowAdminCenter: (value: boolean) => void;
  viewingImage: string | null;
  setViewingImage: (value: string | null) => void;
  isConnected: boolean;
  toggleNetworkStream: () => void;
  socket: Socket | null;
  trackedAssets: Record<string, TrackedAsset>;
  violations: GeofenceViolation[];
  activeBreachedDrivers: Record<string, GeofenceViolation>;
  routeHistories: Record<string, [number, number][]>;
  savedGeofences: Geofence[];
  savedRoutesList: SavedRoute[];
  savedHubs: Hub[];
  savedVehicleTypes: VehicleType[];
  savedDrivers: StaffUser[];
  resolveDriverName: (identifier: string) => string;
  refreshFeeds: (tokenToUse?: string) => Promise<void>;
  saveDriverRouteHistory: (driverName: string) => Promise<void>;
  saveGeofence: (payload: { name: string; points: [number, number][]; speedLimitKmh: number }) => Promise<void>;
  deleteGeofence: (id: number) => Promise<void>;
  calculateRoadMatrixETA: (targetLat: number, targetLng: number) => Promise<unknown[]>;
  activeOrders: Order[];
  orderActivity: OrderActivityEvent[];
  incidentReports: Incident[];
  recentDeliveries: RecentDelivery[];
  inFlightOrders: Order[];
}

const SocketContext = createContext<SocketContextValue | null>(null);

// The 9 feeds in refreshFeeds below all fetched + set state through the
// exact same shape: fetch, default to [] on non-array/error, and clear the
// session on a 401/403 specifically (not just any error). Extracted once
// rather than repeated per feed.
async function fetchFeed<T>(
  fetchFn: (token: string) => Promise<T[]>,
  token: string,
  setState: (value: T[]) => void,
  clearCachedAuth: () => void
): Promise<void> {
  try {
    const data = await fetchFn(token);
    setState(Array.isArray(data) ? data : []);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      clearCachedAuth();
    }
    setState([]);
  }
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [jwtToken, setJwtToken] = useState(() => localStorage.getItem('fleet_token') || '');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('fleet_role') || '');
  const [authError, setAuthError] = useState('');
  // Held only in memory, never localStorage — it's a 5-minute-lived,
  // single-purpose token, not a session credential worth persisting
  // across a reload.
  const [mfaSessionToken, setMfaSessionToken] = useState('');

  // Whole-app view switch, not a socket/data concern — but this context is
  // already the one thing every screen (including the deeply-nested Admin
  // tab) pulls shared state from, and the Admin Control Center (statistics,
  // user/role governance, audit log) is deliberately its own full screen
  // rather than more cards crammed into the Admin tab's 380px sidebar, so
  // it needs a way to swap out of Dashboard from wherever the "Open admin
  // control center" entry point lives.
  const [showAdminCenter, setShowAdminCenter] = useState(false);

  // Any "view photo/document" link across the dashboard sets this instead
  // of opening a new browser tab — one shared piece of state, one lightbox
  // rendered at the app root (see ImageLightbox / App.jsx).
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [trackedAssets, setTrackedAssets] = useState<Record<string, TrackedAsset>>({});
  const [violations, setViolations] = useState<GeofenceViolation[]>([]);
  const [activeBreachedDrivers, setActiveBreachedDrivers] = useState<Record<string, GeofenceViolation>>({});
  const [routeHistories, setRouteHistories] = useState<Record<string, [number, number][]>>({});

  const [savedGeofences, setSavedGeofences] = useState<Geofence[]>([]);
  const [savedRoutesList, setSavedRoutesList] = useState<SavedRoute[]>([]);
  // Dispatch hubs — shared here (rather than fetched privately by whichever
  // component happens to need them) so the order form's dropdown, the
  // Fleet tab's management list, and the map's static hub markers all stay
  // in sync with a single source of truth after any create/edit/delete.
  const [savedHubs, setSavedHubs] = useState<Hub[]>([]);
  // Vehicle "type" options for the fleet registration form — previously a
  // hardcoded 3-option dropdown, now a real admin-managed list.
  const [savedVehicleTypes, setSavedVehicleTypes] = useState<VehicleType[]>([]);
  // A phone/PIN driver's `username` (the join key used everywhere — orders,
  // telemetry, incidents) is literally their phone number now, not a name.
  // Every screen that shows a driver identifier — the live map, incident
  // feeds, order assignment — needs to resolve that back to a real name via
  // this shared directory instead of rendering the raw username/phone.
  const [savedDrivers, setSavedDrivers] = useState<StaffUser[]>([]);

  // Orders still PENDING (unassigned) — the dispatch queue. Once assigned,
  // an order drops out of this list (it's no longer "active" by the
  // backend's own definition of GET /api/orders/active).
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  // Rolling feed of order status changes (driver pickups, deliveries, etc.)
  // — not persisted anywhere separately, just what's arrived live plus
  // whatever's fetched on connect.
  const [orderActivity, setOrderActivity] = useState<OrderActivityEvent[]>([]);
  const [incidentReports, setIncidentReports] = useState<Incident[]>([]);
  // Persisted, fetchable view of completed deliveries + their proof-of-
  // delivery photo — unlike orderActivity, this survives a page reload and
  // doesn't depend on the dispatcher having been connected at the moment
  // of delivery.
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([]);
  // Orders already ASSIGNED to a driver but not yet picked up — the
  // dispatcher's working set for correcting a bad assignment (wrong driver,
  // driver called in sick, etc.) via reassign/unassign.
  const [inFlightOrders, setInFlightOrders] = useState<Order[]>([]);

  const clearCachedAuth = useCallback(() => {
    if (socket) socket.disconnect();
    setSocket(null);
    setJwtToken('');
    setUserRole('');
    setIsConnected(false);
    localStorage.removeItem('fleet_token');
    localStorage.removeItem('fleet_role');
  }, [socket]);

  // Any apiFetch call that gets a 401/403 (expired or invalid token) should
  // clear the session everywhere, not just for the two refreshFeeds calls.
  useEffect(() => {
    setUnauthorizedHandler(clearCachedAuth);
    return () => setUnauthorizedHandler(null);
  }, [clearCachedAuth]);

  const refreshFeeds = useCallback(async (tokenToUse?: string) => {
    const token = tokenToUse ?? jwtToken;
    // Sequential, not Promise.all — preserves the exact fetch order this
    // already ran in; parallelizing these would be a genuine behavior
    // change (timing, concurrent request count), not just deduplication.
    await fetchFeed(fetchRoutes, token, setSavedRoutesList, clearCachedAuth);
    await fetchFeed(fetchGeofences, token, setSavedGeofences, clearCachedAuth);
    await fetchFeed(fetchHubs, token, setSavedHubs, clearCachedAuth);
    await fetchFeed(fetchVehicleTypes, token, setSavedVehicleTypes, clearCachedAuth);
    await fetchFeed(fetchActiveOrders, token, setActiveOrders, clearCachedAuth);
    await fetchFeed(fetchIncidents, token, setIncidentReports, clearCachedAuth);
    await fetchFeed(fetchRecentDeliveries, token, setRecentDeliveries, clearCachedAuth);
    await fetchFeed(fetchInFlightOrders, token, setInFlightOrders, clearCachedAuth);
    await fetchFeed(fetchDrivers, token, setSavedDrivers, clearCachedAuth);
  }, [clearCachedAuth, jwtToken]);

  const driverDirectory = useMemo(() => {
    const map: Record<string, StaffUser> = {};
    savedDrivers.forEach((d) => {
      if (d.username) map[d.username] = d;
    });
    return map;
  }, [savedDrivers]);

  // The one place every driver-identifier display should go through —
  // falls back to whatever string it was given (the raw username/phone) if
  // there's no matching directory entry yet (still loading, or a legacy
  // account) or no full_name on file for it.
  const resolveDriverName = useCallback(
    (identifier: string) => (identifier ? driverDirectory[identifier]?.fullName || identifier : identifier),
    [driverDirectory]
  );

  const connectSocket = useCallback((token: string) => {
    const newSocket = io(API_BASE, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket'],
    });

    attachSocketListeners(newSocket, {
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
    });

    setSocket(newSocket);
  }, []);

  // Restore session's saved feeds on mount (token/role are already read
  // synchronously above via lazy useState initializers, avoiding a
  // setState-in-effect on first render), and reconnect the live stream —
  // the dashboard is non-functional without it, so a reload shouldn't
  // require re-clicking a "Connect" button to get back to a working state.
  useEffect(() => {
    const savedToken = localStorage.getItem('fleet_token');
    if (savedToken) {
      void refreshFeeds(savedToken); // async fetch; state set after I/O, not synchronously
      connectSocket(savedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnectSocket = useCallback(() => {
    setSocket((current) => {
      // removeAllListeners() before disconnecting: this "works" today
      // without it only because connectSocket always creates a brand-new
      // `io(...)` instance rather than reusing one across reconnects — if
      // that ever changes to the more idiomatic socket.io-client pattern
      // (reusing one instance via connect()/disconnect()), skipping this
      // would silently double-register all 13 handlers above on every
      // reconnect (duplicate order-activity entries, doubled breadcrumb
      // points, duplicate incident entries).
      if (current) {
        current.removeAllListeners();
        current.disconnect();
      }
      return null;
    });
    setIsConnected(false);
    setTrackedAssets({});
    setRouteHistories({});
    setActiveBreachedDrivers({});
  }, []);

  // Manual reconnect/disconnect toggle, kept for the command bar's
  // connection pill — auto-connect (below) handles the normal case, this
  // is the escape hatch if the stream needs a manual nudge.
  const toggleNetworkStream = useCallback(() => {
    if (isConnected) {
      disconnectSocket();
    } else if (jwtToken) {
      connectSocket(jwtToken);
    }
  }, [isConnected, jwtToken, connectSocket, disconnectSocket]);

  // Shared by a plain login success and a post-MFA verify success — both
  // end the same way: real tokens in hand, feeds refreshed, socket
  // connected.
  const finalizeLogin = useCallback((token: string, role: UserRole | undefined) => {
    setJwtToken(token);
    setUserRole(role || 'dispatcher');
    localStorage.setItem('fleet_token', token);
    localStorage.setItem('fleet_role', role || 'dispatcher');
    void refreshFeeds(token);
    connectSocket(token);
  }, [refreshFeeds, connectSocket]);

  const login = useCallback(async ({ username, password }: { username: string; password: string }) => {
    setAuthError('');

    try {
      const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } }) as {
        token?: string; role?: UserRole; mfaRequired?: boolean; mfaSessionToken?: string; error?: string;
      };
      if (data.mfaRequired && data.mfaSessionToken) {
        setMfaSessionToken(data.mfaSessionToken);
        return 'mfa_required' as const;
      }
      if (data.token) {
        finalizeLogin(data.token, data.role);
        return 'success' as const;
      }
      setAuthError(data.error || 'Authentication failed');
      return 'failed' as const;
    } catch (err) {
      setAuthError((err as Error).message || 'Network error connecting to auth server');
      return 'failed' as const;
    }
  }, [finalizeLogin]);

  const verifyMfa = useCallback(async ({ code, recoveryCode }: { code?: string; recoveryCode?: string }) => {
    setAuthError('');
    try {
      const data = await apiFetch('/api/auth/mfa/verify-login', {
        method: 'POST',
        body: { mfaSessionToken, code, recoveryCode },
      }) as { token?: string; role?: UserRole; error?: string };
      if (data.token) {
        finalizeLogin(data.token, data.role);
        setMfaSessionToken('');
        return true;
      }
      setAuthError(data.error || 'Incorrect code.');
      return false;
    } catch (err) {
      setAuthError((err as Error).message || 'Network error connecting to auth server');
      return false;
    }
  }, [mfaSessionToken, finalizeLogin]);

  // Lets the login form back out of the MFA step (e.g. "use a different
  // account") without leaving a stale session token sitting in memory.
  const cancelMfa = useCallback(() => {
    setMfaSessionToken('');
    setAuthError('');
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    setJwtToken('');
    setUserRole('');
    setShowAdminCenter(false);
    localStorage.removeItem('fleet_token');
    localStorage.removeItem('fleet_role');
  }, [disconnectSocket]);

  const saveDriverRouteHistory = useCallback(async (driverName: string) => {
    const history = routeHistories[driverName] || [];
    await apiFetch('/api/routes/save', {
      method: 'POST',
      token: jwtToken,
      body: { driverName, coordinates: history.map(([lat, lng]) => [lng, lat]) },
    });
    void refreshFeeds();
  }, [routeHistories, jwtToken, refreshFeeds]);

  const saveGeofence = useCallback(async ({ name, points, speedLimitKmh }: { name: string; points: [number, number][]; speedLimitKmh: number }) => {
    const formattedPoints = points.map(([lat, lng]) => [lng, lat]);
    await apiFetch('/api/geofences', {
      method: 'POST',
      token: jwtToken,
      body: { name, coordinates: formattedPoints, speedLimitKmh },
    });
    void refreshFeeds();
  }, [jwtToken, refreshFeeds]);

  const deleteGeofence = useCallback(async (id: number) => {
    await apiFetch(`/api/geofences/${id}`, { method: 'DELETE', token: jwtToken });
    void refreshFeeds();
  }, [jwtToken, refreshFeeds]);

  const calculateRoadMatrixETA = useCallback(async (targetLat: number, targetLng: number) => {
    const fleetArray = Object.values(trackedAssets);
    if (fleetArray.length === 0) return [];
    try {
      const data = await apiFetch('/api/dispatch/matrix', {
        method: 'POST',
        token: jwtToken,
        body: { targetLat, targetLng, activeFleet: fleetArray },
      }) as { rankings?: unknown[] };
      return data.rankings || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }, [trackedAssets, jwtToken]);

  const value: SocketContextValue = {
    jwtToken, userRole, authError, login, logout,
    mfaPending: Boolean(mfaSessionToken), verifyMfa, cancelMfa,
    showAdminCenter, setShowAdminCenter,
    viewingImage, setViewingImage,
    isConnected, toggleNetworkStream,
    socket,
    trackedAssets, violations, activeBreachedDrivers, routeHistories,
    savedGeofences, savedRoutesList, savedHubs, savedVehicleTypes, savedDrivers, resolveDriverName, refreshFeeds,
    saveDriverRouteHistory, saveGeofence, deleteGeofence, calculateRoadMatrixETA,
    activeOrders, orderActivity, incidentReports, recentDeliveries, inFlightOrders,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
