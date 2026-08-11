// src/kiosk/KioskApp.tsx — entry point for a wall-display device. Reached
// via /kiosk?token=... (see App.tsx's path check), never through the
// normal login screen. Deliberately does NOT use SocketContext: that
// context carries a dispatcher's full read/write surface (login/logout,
// geofence CRUD, admin-center toggling) a read-only device has no
// business holding, and several of the feeds it eagerly fetches
// (geofences, vehicle types, routes) aren't accessible to the kiosk role
// at all — reusing it would mean either widening kiosk's backend access
// well past "read-only fleet status" or fighting failed fetches on every
// load. This does its own minimal hydration + socket wiring instead.
import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, fetchHubs, fetchActiveOrders, fetchIncidents, fetchInFlightOrders, fetchDrivers, fetchMyKioskDevice } from '../utils/api';
import { attachSocketListeners } from '../context/socketEventHandlers';
import KioskDashboard from './KioskDashboard';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Hub, Order, Incident, TrackedAsset, GeofenceViolation, OrderActivityEvent, RecentDelivery, StaffUser } from '../types';

const KIOSK_TOKEN_KEY = 'kiosk_token';
// This device's own /kiosk-devices/me call doubles as a heartbeat
// (verifyKioskToken bumps last_seen_at on every successful check) — a
// long-running session otherwise only talks over the socket, which
// wouldn't otherwise touch that timestamp again after the initial load.
const HEARTBEAT_MS = 3 * 60 * 1000;

export default function KioskApp() {
    const [token, setToken] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [deviceLabel, setDeviceLabel] = useState<string | null>(null);

    // Named after the device rather than the app, because these are
    // unattended wall displays that get set up once — whoever is standing
    // at the machine choosing which screen goes on which monitor needs to
    // tell "Warehouse floor" from "Dispatch desk" in the tab strip. No
    // attention count: nobody is watching a wall display's tab title.
    useDocumentTitle(deviceLabel || 'Wall display');

    const [trackedAssets, setTrackedAssets] = useState<Record<string, TrackedAsset>>({});
    const [routeHistories, setRouteHistories] = useState<Record<string, [number, number][]>>({});
    const [savedHubs, setSavedHubs] = useState<Hub[]>([]);
    const [savedDrivers, setSavedDrivers] = useState<StaffUser[]>([]);
    const [activeOrders, setActiveOrders] = useState<Order[]>([]);
    const [inFlightOrders, setInFlightOrders] = useState<Order[]>([]);
    const [incidentReports, setIncidentReports] = useState<Incident[]>([]);

    // attachSocketListeners is generic over the dispatcher dashboard's full
    // setter set — the kiosk doesn't render active geofence breaches, the
    // order-activity ticker, or persisted delivery photos, but it still
    // needs somewhere for those events to land so the shared handler works
    // unmodified.
    const [, setViolations] = useState<GeofenceViolation[]>([]);
    const [, setActiveBreachedDrivers] = useState<Record<string, GeofenceViolation>>({});
    const [, setOrderActivity] = useState<OrderActivityEvent[]>([]);
    const [, setRecentDeliveries] = useState<RecentDelivery[]>([]);

    // One-time provisioning visit carries the token in the URL; every
    // subsequent load (power cycle, browser restart) reads it back from
    // localStorage so the wall display never needs the URL param again.
    useEffect(() => {
        const url = new URL(window.location.href);
        const urlToken = url.searchParams.get('token');
        if (urlToken) {
            localStorage.setItem(KIOSK_TOKEN_KEY, urlToken);
            url.searchParams.delete('token');
            window.history.replaceState({}, '', url.toString());
            setToken(urlToken);
        } else {
            setToken(localStorage.getItem(KIOSK_TOKEN_KEY));
        }
    }, []);

    useEffect(() => {
        if (!token) return;

        void Promise.all([
            fetchHubs(token).catch(() => []),
            fetchActiveOrders(token).catch(() => []),
            fetchInFlightOrders(token).catch(() => []),
            fetchIncidents(token).catch(() => []),
            fetchDrivers(token).catch(() => []),
        ]).then(([hubs, active, inFlight, incidents, drivers]) => {
            setSavedHubs(hubs);
            setActiveOrders(active);
            setInFlightOrders(inFlight);
            setIncidentReports(incidents);
            setSavedDrivers(drivers);
        });

        const pingSelf = () => void fetchMyKioskDevice(token).then((d) => setDeviceLabel(d.label)).catch(() => {});
        pingSelf();
        const heartbeatInterval = setInterval(pingSelf, HEARTBEAT_MS);

        const socket: Socket = io(API_BASE, {
            auth: { token: `Bearer ${token}` },
            transports: ['websocket'],
        });

        attachSocketListeners(socket, {
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

        // An unattended device nobody manually refreshes — a full reload
        // every 6 hours is a deliberate, simple safeguard against slow
        // memory growth or a missed reconnect, not a fix for a known bug.
        const reloadInterval = setInterval(() => window.location.reload(), 6 * 60 * 60 * 1000);

        return () => {
            socket.disconnect();
            clearInterval(reloadInterval);
            clearInterval(heartbeatInterval);
        };
    }, [token]);

    const driverDirectory = useMemo(() => {
        const map: Record<string, StaffUser> = {};
        savedDrivers.forEach((d) => {
            if (d.username) map[d.username] = d;
        });
        return map;
    }, [savedDrivers]);

    const resolveDriverName = (identifier: string) => (identifier ? driverDirectory[identifier]?.fullName || identifier : identifier);

    if (!token) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-ink text-steel text-sm font-mono">
                This screen isn&apos;t provisioned. Generate a kiosk link from Admin Control Center → Kiosk displays.
            </div>
        );
    }

    return (
        <KioskDashboard
            isConnected={isConnected}
            deviceLabel={deviceLabel}
            trackedAssets={trackedAssets}
            routeHistories={routeHistories}
            savedHubs={savedHubs}
            activeOrders={activeOrders}
            inFlightOrders={inFlightOrders}
            incidentReports={incidentReports}
            resolveDriverName={resolveDriverName}
        />
    );
}
