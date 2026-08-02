import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, API_BASE, fetchRoutes, fetchGeofences, fetchActiveOrders, fetchIncidents, fetchRecentDeliveries, fetchInFlightOrders, fetchHubs, fetchVehicleTypes, fetchDrivers, setUnauthorizedHandler } from '../utils/api';
import { attachSocketListeners } from './socketEventHandlers';

const SocketContext = createContext(null);

// The 9 feeds in refreshFeeds below all fetched + set state through the
// exact same shape: fetch, default to [] on non-array/error, and clear the
// session on a 401/403 specifically (not just any error). Extracted once
// rather than repeated per feed.
async function fetchFeed(fetchFn, token, setState, clearCachedAuth) {
  try {
    const data = await fetchFn(token);
    setState(Array.isArray(data) ? data : []);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      clearCachedAuth();
    }
    setState([]);
  }
}

export function SocketProvider({ children }) {
  const [jwtToken, setJwtToken] = useState(() => localStorage.getItem('fleet_token') || '');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('fleet_role') || '');
  const [authError, setAuthError] = useState('');

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
  const [viewingImage, setViewingImage] = useState(null);

  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const [trackedAssets, setTrackedAssets] = useState({});
  const [violations, setViolations] = useState([]);
  const [activeBreachedDrivers, setActiveBreachedDrivers] = useState({});
  const [routeHistories, setRouteHistories] = useState({});

  const [savedGeofences, setSavedGeofences] = useState([]);
  const [savedRoutesList, setSavedRoutesList] = useState([]);
  // Dispatch hubs — shared here (rather than fetched privately by whichever
  // component happens to need them) so the order form's dropdown, the
  // Fleet tab's management list, and the map's static hub markers all stay
  // in sync with a single source of truth after any create/edit/delete.
  const [savedHubs, setSavedHubs] = useState([]);
  // Vehicle "type" options for the fleet registration form — previously a
  // hardcoded 3-option dropdown, now a real admin-managed list.
  const [savedVehicleTypes, setSavedVehicleTypes] = useState([]);
  // A phone/PIN driver's `username` (the join key used everywhere — orders,
  // telemetry, incidents) is literally their phone number now, not a name.
  // Every screen that shows a driver identifier — the live map, incident
  // feeds, order assignment — needs to resolve that back to a real name via
  // this shared directory instead of rendering the raw username/phone.
  const [savedDrivers, setSavedDrivers] = useState([]);

  // Orders still PENDING (unassigned) — the dispatch queue. Once assigned,
  // an order drops out of this list (it's no longer "active" by the
  // backend's own definition of GET /api/orders/active).
  const [activeOrders, setActiveOrders] = useState([]);
  // Rolling feed of order status changes (driver pickups, deliveries, etc.)
  // — not persisted anywhere separately, just what's arrived live plus
  // whatever's fetched on connect.
  const [orderActivity, setOrderActivity] = useState([]);
  const [incidentReports, setIncidentReports] = useState([]);
  // Persisted, fetchable view of completed deliveries + their proof-of-
  // delivery photo — unlike orderActivity, this survives a page reload and
  // doesn't depend on the dispatcher having been connected at the moment
  // of delivery.
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  // Orders already ASSIGNED to a driver but not yet picked up — the
  // dispatcher's working set for correcting a bad assignment (wrong driver,
  // driver called in sick, etc.) via reassign/unassign.
  const [inFlightOrders, setInFlightOrders] = useState([]);

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

  const refreshFeeds = useCallback(async (tokenToUse) => {
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
    const map = {};
    savedDrivers.forEach((d) => {
      map[d.username] = d;
    });
    return map;
  }, [savedDrivers]);

  // The one place every driver-identifier display should go through —
  // falls back to whatever string it was given (the raw username/phone) if
  // there's no matching directory entry yet (still loading, or a legacy
  // account) or no full_name on file for it.
  const resolveDriverName = useCallback(
    (identifier) => (identifier ? driverDirectory[identifier]?.fullName || identifier : identifier),
    [driverDirectory]
  );

  // Restore session's saved feeds on mount (token/role are already read
  // synchronously above via lazy useState initializers, avoiding a
  // setState-in-effect on first render), and reconnect the live stream —
  // the dashboard is non-functional without it, so a reload shouldn't
  // require re-clicking a "Connect" button to get back to a working state.
  useEffect(() => {
    const savedToken = localStorage.getItem('fleet_token');
    if (savedToken) {
      refreshFeeds(savedToken); // async fetch; state set after I/O, not synchronously
      connectSocket(savedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extracted from the old manual-toggle button so it can be called
  // automatically (on login, and on session restore) instead of requiring
  // a dispatcher to remember to click "Connect" every time — the dashboard
  // is non-functional without this, so it shouldn't be an opt-in step.
  const connectSocket = useCallback((token) => {
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

  const login = useCallback(async ({ username, password }) => {
    setAuthError('');

    try {
      const data = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
      if (data.token) {
        setJwtToken(data.token);
        setUserRole(data.role || 'dispatcher');
        localStorage.setItem('fleet_token', data.token);
        localStorage.setItem('fleet_role', data.role || 'dispatcher');
        refreshFeeds(data.token);
        connectSocket(data.token);
        return true;
      }
      setAuthError(data.error || 'Authentication failed');
      return false;
    } catch (err) {
      setAuthError(err.message || 'Network error connecting to auth server');
      return false;
    }
  }, [refreshFeeds, connectSocket]);

  const logout = useCallback(() => {
    disconnectSocket();
    setJwtToken('');
    setUserRole('');
    setShowAdminCenter(false);
    localStorage.removeItem('fleet_token');
    localStorage.removeItem('fleet_role');
  }, [disconnectSocket]);

  const saveDriverRouteHistory = useCallback(async (driverName) => {
    const history = routeHistories[driverName] || [];
    await apiFetch('/api/routes/save', {
      method: 'POST',
      token: jwtToken,
      body: { driverName, coordinates: history.map(([lat, lng]) => [lng, lat]) },
    });
    refreshFeeds();
  }, [routeHistories, jwtToken, refreshFeeds]);

  const saveGeofence = useCallback(async ({ name, points, speedLimitKmh }) => {
    const formattedPoints = points.map(([lat, lng]) => [lng, lat]);
    await apiFetch('/api/geofences', {
      method: 'POST',
      token: jwtToken,
      body: { name, coordinates: formattedPoints, speedLimitKmh },
    });
    refreshFeeds();
  }, [jwtToken, refreshFeeds]);

  const deleteGeofence = useCallback(async (id) => {
    await apiFetch(`/api/geofences/${id}`, { method: 'DELETE', token: jwtToken });
    refreshFeeds();
  }, [jwtToken, refreshFeeds]);

  const calculateRoadMatrixETA = useCallback(async (targetLat, targetLng) => {
    const fleetArray = Object.values(trackedAssets);
    if (fleetArray.length === 0) return [];
    try {
      const data = await apiFetch('/api/dispatch/matrix', {
        method: 'POST',
        token: jwtToken,
        body: { targetLat, targetLng, activeFleet: fleetArray },
      });
      return data.rankings || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }, [trackedAssets, jwtToken]);

  const value = {
    jwtToken, userRole, authError, login, logout,
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
