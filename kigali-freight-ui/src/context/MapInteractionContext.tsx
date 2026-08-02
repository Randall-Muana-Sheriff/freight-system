// src/context/MapInteractionContext.tsx
//
// Previously all of this lived in Dashboard.jsx's own state, passed down
// as 17 props to FleetMap, 18 to SecondaryPanel, and 4 to OperationsRail —
// Dashboard itself never read any of it, it was purely a layout shell
// forwarding state between three siblings that need to share it (clicking
// a "pick location" mode in the side panel needs FleetMap to react to the
// next map click, and vice versa). This context lets each of those three
// pull exactly what it needs directly, instead of Dashboard drilling
// everything through itself. Behavior is unchanged — this is the same
// state and the same handlers, just no longer passed as props.
import { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';
import { useSocket } from './SocketContext';
import { useRoutes } from '../utils/useRoutes';
import { fetchDriverBreadcrumbs } from '../utils/api';
import type { SavedRoute, PlaybackRoute, OptimizedRouteGroup, LatLng } from '../types';

interface MapInteractionContextValue {
    drawModeActive: boolean;
    setDrawModeActive: (value: boolean) => void;
    drawnPoints: LatLng[];
    setDrawnPoints: React.Dispatch<React.SetStateAction<LatLng[]>>;
    dispatchTargetMode: boolean;
    setDispatchTargetMode: (value: boolean) => void;
    dispatchLocation: LatLng | null;
    setDispatchLocation: (value: LatLng | null) => void;
    dispatchRankings: unknown[];
    handleDispatchClick: (lat: number, lng: number) => Promise<void>;
    stopTargetMode: boolean;
    setStopTargetMode: (value: boolean) => void;
    newStopCoords: LatLng | null;
    setNewStopCoords: (value: LatLng | null) => void;
    orderDeliveryTargetMode: boolean;
    setOrderDeliveryTargetMode: (value: boolean) => void;
    newOrderDeliveryCoords: LatLng | null;
    setNewOrderDeliveryCoords: (value: LatLng | null) => void;
    clearNewOrderDeliveryCoords: () => void;
    hubTargetMode: boolean;
    setHubTargetMode: (value: boolean) => void;
    newHubCoords: LatLng | null;
    setNewHubCoords: (value: LatLng | null) => void;
    clearNewHubCoords: () => void;
    playbackCoords: LatLng[];
    playbackIndex: number;
    isPlaying: boolean;
    selectedPlaybackRoute: PlaybackRoute | null;
    loadRouteForPlayback: (route: SavedRoute) => void;
    togglePlaybackPlay: () => void;
    loadBreadcrumbsForPlayback: (driverName: string, hours: number) => Promise<void>;
    breadcrumbsLoading: boolean;
    trailLimit: number;
    optimizedRoutes: OptimizedRouteGroup[];
    setOptimizedRoutes: React.Dispatch<React.SetStateAction<OptimizedRouteGroup[]>>;
    savedRoutes: SavedRoute[];
    routesLoading: boolean;
}

const MapInteractionContext = createContext<MapInteractionContextValue | null>(null);

export function MapInteractionProvider({ children }: { children: ReactNode }) {
    const { jwtToken, calculateRoadMatrixETA, socket, resolveDriverName } = useSocket();
    const { routes: savedRoutes, loading: routesLoading, refreshRoutes } = useRoutes(jwtToken);

    // Geofence drawing
    const [drawModeActive, setDrawModeActive] = useState(false);
    const [drawnPoints, setDrawnPoints] = useState<LatLng[]>([]);

    // Dispatch targeting
    const [dispatchTargetMode, setDispatchTargetMode] = useState(false);
    const [dispatchLocation, setDispatchLocation] = useState<LatLng | null>(null);
    const [dispatchRankings, setDispatchRankings] = useState<unknown[]>([]);

    // New Stop Map Picker
    const [stopTargetMode, setStopTargetMode] = useState(false);
    const [newStopCoords, setNewStopCoords] = useState<LatLng | null>(null);

    // New Order delivery-point Map Picker
    const [orderDeliveryTargetMode, setOrderDeliveryTargetMode] = useState(false);
    const [newOrderDeliveryCoords, setNewOrderDeliveryCoords] = useState<LatLng | null>(null);

    // Hub location Map Picker (create/edit a hub from the Fleet tab)
    const [hubTargetMode, setHubTargetMode] = useState(false);
    const [newHubCoords, setNewHubCoords] = useState<LatLng | null>(null);

    // Historical playback
    const [playbackCoords, setPlaybackCoords] = useState<LatLng[]>([]);
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedPlaybackRoute, setSelectedPlaybackRoute] = useState<PlaybackRoute | null>(null);
    const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const playbackCoordsRef = useRef<LatLng[]>([]);

    // Keep ref synchronized with state coordinates
    useEffect(() => {
        playbackCoordsRef.current = playbackCoords;
    }, [playbackCoords]);

    // Declarative interval effect for smooth playback animation
    useEffect(() => {
        if (!isPlaying) {
            if (playbackIntervalRef.current) {
                clearInterval(playbackIntervalRef.current);
                playbackIntervalRef.current = null;
            }
            return;
        }

        playbackIntervalRef.current = setInterval(() => {
            setPlaybackIndex((prev) => {
                if (prev >= playbackCoordsRef.current.length - 1) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 400);

        return () => {
            if (playbackIntervalRef.current) {
                clearInterval(playbackIntervalRef.current);
                playbackIntervalRef.current = null;
            }
        };
    }, [isPlaying]);

    // Multi-stop VRP optimization paths
    const [optimizedRoutes, setOptimizedRoutes] = useState<OptimizedRouteGroup[]>([]);
    const trailLimit = 15;

    // Historical breadcrumbs (live telemetry trail, not a committed route)
    const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(false);

    // Real-time synchronization event listener via Socket.io
    useEffect(() => {
        if (!socket) return;
        const handleRouteUpdate = () => {
            void refreshRoutes();
        };
        socket.on('routeUpdated', handleRouteUpdate);
        socket.on('stopUpdated', handleRouteUpdate);
        return () => {
            socket.off('routeUpdated', handleRouteUpdate);
            socket.off('stopUpdated', handleRouteUpdate);
        };
    }, [socket, refreshRoutes]);

    const handleDispatchClick = async (lat: number, lng: number) => {
        const rankings = await calculateRoadMatrixETA(lat, lng);
        setDispatchRankings(rankings);
    };

    const loadRouteForPlayback = (route: SavedRoute) => {
        setSelectedPlaybackRoute(route);
        setIsPlaying(false);

        try {
            const rawGeo = route.geojsonSimplified || route.geojson_simplified || route.geojsonPath || route.geojson_path || route.geojson;
            const geojson = typeof rawGeo === 'string' ? JSON.parse(rawGeo) : rawGeo;
            if (Array.isArray(geojson)) {
                const points = geojson
                    .map((node) => {
                        if (Array.isArray(node) && node.length >= 2) return [node[1], node[0]] as LatLng;
                        if (node && typeof node === 'object' && node.lat !== undefined && node.lng !== undefined) {
                            return [node.lat, node.lng] as LatLng;
                        }
                        return null;
                    })
                    .filter((p): p is LatLng => p !== null);
                setPlaybackCoords(points);
                playbackCoordsRef.current = points;
                setPlaybackIndex(0);
            } else if (geojson && geojson.coordinates) {
                const points = geojson.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as LatLng);
                setPlaybackCoords(points);
                playbackCoordsRef.current = points;
                setPlaybackIndex(0);
            } else {
                setPlaybackCoords([]);
                playbackCoordsRef.current = [];
                setPlaybackIndex(0);
            }
        } catch (err) {
            console.error('Failed to parse route geojson:', err);
            setPlaybackCoords([]);
            playbackCoordsRef.current = [];
            setPlaybackIndex(0);
        }
    };

    const loadBreadcrumbsForPlayback = async (driverName: string, hours: number) => {
        setBreadcrumbsLoading(true);
        setIsPlaying(false);
        try {
            const result = await fetchDriverBreadcrumbs(driverName, jwtToken, { hours });
            const points = (result.trail || []) as LatLng[];
            setSelectedPlaybackRoute({ id: `breadcrumbs:${driverName}`, label: `${resolveDriverName(driverName)} · last ${hours}h · ${result.survivingPointsCount} pts` });
            setPlaybackCoords(points);
            playbackCoordsRef.current = points;
            setPlaybackIndex(0);
        } catch (err) {
            console.error('Failed to load driver breadcrumbs:', err);
            alert((err as Error).message || 'Failed to load breadcrumbs for this driver.');
        } finally {
            setBreadcrumbsLoading(false);
        }
    };

    const togglePlaybackPlay = () => {
        if (isPlaying) {
            setIsPlaying(false);
        } else {
            if (playbackCoordsRef.current.length === 0) return;
            // If at the end of the route, reset index to beginning before playing
            setPlaybackIndex((prev) => (prev >= playbackCoordsRef.current.length - 1 ? 0 : prev));
            setIsPlaying(true);
        }
    };

    const value: MapInteractionContextValue = {
        drawModeActive, setDrawModeActive, drawnPoints, setDrawnPoints,
        dispatchTargetMode, setDispatchTargetMode, dispatchLocation, setDispatchLocation, dispatchRankings,
        handleDispatchClick,
        stopTargetMode, setStopTargetMode, newStopCoords, setNewStopCoords,
        orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, setNewOrderDeliveryCoords,
        clearNewOrderDeliveryCoords: () => setNewOrderDeliveryCoords(null),
        hubTargetMode, setHubTargetMode, newHubCoords, setNewHubCoords,
        clearNewHubCoords: () => setNewHubCoords(null),
        playbackCoords, playbackIndex, isPlaying, selectedPlaybackRoute,
        loadRouteForPlayback, togglePlaybackPlay, loadBreadcrumbsForPlayback, breadcrumbsLoading,
        trailLimit,
        optimizedRoutes, setOptimizedRoutes,
        savedRoutes, routesLoading,
    };

    return <MapInteractionContext.Provider value={value}>{children}</MapInteractionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMapInteraction() {
    const ctx = useContext(MapInteractionContext);
    if (!ctx) throw new Error('useMapInteraction must be used within a MapInteractionProvider');
    return ctx;
}
