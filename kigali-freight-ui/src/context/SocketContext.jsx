import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, API_BASE, fetchRoutes, fetchGeofences, fetchActiveOrders, fetchIncidents, fetchRecentDeliveries, fetchInFlightOrders, fetchHubs, fetchVehicleTypes, setUnauthorizedHandler } from '../utils/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [jwtToken, setJwtToken] = useState(() => localStorage.getItem('fleet_token') || '');
  const [userRole, setUserRole] = useState(() => localStorage.getItem('fleet_role') || '');
  const [authError, setAuthError] = useState('');

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
    try {
      const routesData = await fetchRoutes(token);
      setSavedRoutesList(Array.isArray(routesData) ? routesData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setSavedRoutesList([]);
    }
    try {
      const geofencesData = await fetchGeofences(token);
      setSavedGeofences(Array.isArray(geofencesData) ? geofencesData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setSavedGeofences([]);
    }
    try {
      const hubsData = await fetchHubs(token);
      setSavedHubs(Array.isArray(hubsData) ? hubsData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setSavedHubs([]);
    }
    try {
      const vehicleTypesData = await fetchVehicleTypes(token);
      setSavedVehicleTypes(Array.isArray(vehicleTypesData) ? vehicleTypesData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setSavedVehicleTypes([]);
    }
    try {
      const ordersData = await fetchActiveOrders(token);
      setActiveOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setActiveOrders([]);
    }
    try {
      const incidentsData = await fetchIncidents(token);
      setIncidentReports(Array.isArray(incidentsData) ? incidentsData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setIncidentReports([]);
    }
    try {
      const deliveriesData = await fetchRecentDeliveries(token);
      setRecentDeliveries(Array.isArray(deliveriesData) ? deliveriesData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setRecentDeliveries([]);
    }
    try {
      const inFlightData = await fetchInFlightOrders(token);
      setInFlightOrders(Array.isArray(inFlightData) ? inFlightData : []);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        clearCachedAuth();
      }
      setInFlightOrders([]);
    }
  }, [clearCachedAuth, jwtToken]);

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

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('fleet:snapshot', (arr) => {
      const assetMap = {};
      const historyMap = {};
      arr.forEach((asset) => {
        assetMap[asset.driverName] = asset;
        historyMap[asset.driverName] = [[asset.lat, asset.lng]];
      });
      setTrackedAssets(assetMap);
      setRouteHistories(historyMap);
    });

    newSocket.on('driver:location-update', (data) => {
      setTrackedAssets((prev) => ({ ...prev, [data.driverName]: data }));
      setRouteHistories((prev) => {
        const curr = prev[data.driverName] || [];
        return { ...prev, [data.driverName]: [...curr, [data.lat, data.lng]] };
      });
    });

    newSocket.on('geofence:violation', (v) => {
      setViolations((prev) => [v, ...prev]);
      setActiveBreachedDrivers((prev) => ({ ...prev, [v.driverName]: v }));
    });

    newSocket.on('geofence:exit', (e) => {
      setActiveBreachedDrivers((prev) => {
        const copy = { ...prev };
        delete copy[e.driverName];
        return copy;
      });
    });

    newSocket.on('order:created', (order) => {
      setActiveOrders((prev) => [order, ...prev]);
    });

    // An assigned order is no longer PENDING, so it drops out of the
    // active/unassigned queue rather than being updated in place. It's now
    // awaiting pickup, so it joins the in-flight (reassignable) set instead.
    newSocket.on('order:dispatched', ({ driverName, assignedManifest }) => {
      const dispatchedIds = new Set((assignedManifest || []).map((o) => o.id));
      setActiveOrders((prev) => prev.filter((o) => !dispatchedIds.has(o.id)));
      setInFlightOrders((prev) => [
        ...(assignedManifest || []).map((o) => ({ ...o, assigned_to: driverName })),
        ...prev,
      ]);
    });

    // Dispatcher moved an ASSIGNED order to a different driver without it
    // ever being picked up.
    newSocket.on('order:reassigned', ({ orderId, driverName }) => {
      setInFlightOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, assigned_to: driverName } : o)));
    });

    // Dispatcher sent an ASSIGNED order back to the dispatch queue with no
    // driver — order:created (below) re-adds it to activeOrders.
    newSocket.on('order:unassigned', ({ orderId }) => {
      setInFlightOrders((prev) => prev.filter((o) => o.id !== orderId));
    });

    newSocket.on('order:status-updated', (update) => {
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
            driver_name: update.driverName,
            photo_url: update.photoUrl,
            cargo_description: update.cargo_description,
            confirmed_at: update.timestamp,
            location_flagged: update.locationFlagged,
            distance_from_target_m: update.distanceFromTargetM,
          },
          ...prev,
        ]);
      }
    });

    newSocket.on('incident:reported', (incident) => {
      setIncidentReports((prev) => [incident, ...prev]);
    });

    newSocket.on('incident:status-updated', (updated) => {
      setIncidentReports((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    });

    setSocket(newSocket);
  }, []);

  const disconnectSocket = useCallback(() => {
    setSocket((current) => {
      if (current) current.disconnect();
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
    isConnected, toggleNetworkStream,
    socket,
    trackedAssets, violations, activeBreachedDrivers, routeHistories,
    savedGeofences, savedRoutesList, savedHubs, savedVehicleTypes, refreshFeeds,
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
