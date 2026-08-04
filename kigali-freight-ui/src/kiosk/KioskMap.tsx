// src/kiosk/KioskMap.tsx — a read-only map for the kiosk wall display.
// Deliberately not a reuse of components/FleetMap.tsx: that component
// pulls from SocketContext and MapInteractionContext directly (draw
// tools, dispatch-by-click, route playback — none of which apply here)
// rather than taking data as props, so building it into a dispatcher-only
// context the kiosk doesn't have would mean either dragging in write
// capabilities it has no business holding or a much larger refactor of
// FleetMap itself. This borrows only the presentational pieces that are
// already pure utilities (mapIcons, telemetryFreshness).
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { hubIcon, getVehicleIcon } from '../utils/mapIcons';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';
import MapSizeFix from '../components/map/MapSizeFix';
import type { TrackedAsset, Hub } from '../types';

const KIGALI_CENTER: [number, number] = [-1.9441, 30.0619];

// Roughly the last 5-6 minutes of breadcrumbs at the driver app's
// ~15-25s ping interval — short on purpose. An ambient always-on trail is
// the point on this unattended, glance-from-across-the-room display
// (unlike FleetMap's opt-in, click-to-reveal trail, which is the right
// call on a screen someone is actively working), but with a full fleet
// moving at once, a long trail per truck is exactly the "unreadable
// tangle" FleetMap's own click-to-reveal design was chosen to avoid.
// Short + subtle keeps the ambient-motion cue without that risk at scale.
const TRAIL_POINTS = 15;
// Leaflet's Polyline only takes one flat color/opacity for the whole
// line — there's no built-in gradient-along-a-line. Faked here the
// standard way: split the trail into consecutive, boundary-sharing
// segments and step each one's opacity up from oldest to newest.
const TRAIL_SEGMENTS = 6;
const TRAIL_MIN_OPACITY = 0.08;
const TRAIL_MAX_OPACITY = 0.5;
const TRAIL_COLOR = '#5B8C6E'; // same tarp-green FleetMap.tsx uses for its own trail
// A truck idling at a hub (loading/unloading) still emits pings, and raw
// GPS jitter alone can nudge lat/lng slightly even standing still — below
// this straight-line displacement between the trail's oldest and newest
// point, treat it as parked and draw no trail at all rather than a
// meaningless jittery smear.
const TRAIL_MIN_DISPLACEMENT_M = 50;

function approxMeters(a: [number, number], b: [number, number]): number {
    const EARTH_RADIUS_M = 6371000;
    const dLat = (b[0] - a[0]) * (Math.PI / 180);
    const dLng = (b[1] - a[1]) * (Math.PI / 180);
    const avgLatRad = ((a[0] + b[0]) / 2) * (Math.PI / 180);
    const x = dLng * Math.cos(avgLatRad);
    return Math.sqrt(x * x + dLat * dLat) * EARTH_RADIUS_M;
}

function buildFadingSegments(trail: [number, number][]): { positions: [number, number][]; opacity: number }[] {
    if (trail.length < 2 || approxMeters(trail[0], trail[trail.length - 1]) < TRAIL_MIN_DISPLACEMENT_M) return [];
    const pointPairs = trail.length - 1;
    const segmentCount = Math.min(TRAIL_SEGMENTS, pointPairs);
    const segments: { positions: [number, number][]; opacity: number }[] = [];
    for (let i = 0; i < segmentCount; i++) {
        const startIdx = Math.floor((i / segmentCount) * pointPairs);
        const endIdx = Math.floor(((i + 1) / segmentCount) * pointPairs);
        const positions = trail.slice(startIdx, endIdx + 1);
        if (positions.length < 2) continue;
        const opacity = TRAIL_MIN_OPACITY + (TRAIL_MAX_OPACITY - TRAIL_MIN_OPACITY) * (segmentCount === 1 ? 1 : i / (segmentCount - 1));
        segments.push({ positions, opacity });
    }
    return segments;
}

interface KioskMapProps {
    trackedAssets: Record<string, TrackedAsset>;
    routeHistories: Record<string, [number, number][]>;
    savedHubs: Hub[];
    resolveDriverName: (identifier: string) => string;
}

export default function KioskMap({ trackedAssets, routeHistories, savedHubs, resolveDriverName }: KioskMapProps) {
    const now = useNow();
    const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');

    return (
        <MapContainer center={KIGALI_CENTER} zoom={12} className="h-full w-full" zoomControl={false} attributionControl={false}>
            <MapSizeFix />
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

            {savedHubs.map((hub) => (
                <Marker key={`hub-${hub.id}`} position={[hub.lat, hub.lng]} icon={hubIcon}>
                    <Popup>{hub.name}</Popup>
                </Marker>
            ))}

            {visibleAssets.map((asset) => {
                const trail = (routeHistories[asset.driverName] || []).slice(-TRAIL_POINTS);
                return buildFadingSegments(trail).map((segment, idx) => (
                    <Polyline
                        key={`trail-${asset.driverName}-${idx}`}
                        positions={segment.positions}
                        pathOptions={{ color: TRAIL_COLOR, weight: 3, opacity: segment.opacity }}
                    />
                ));
            })}

            <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
                {visibleAssets.map((asset) => {
                    const freshness = classifyFreshness(asset.lastSeen, now);
                    return (
                        <Marker
                            key={asset.driverName}
                            position={[asset.lat, asset.lng]}
                            icon={getVehicleIcon(asset.vehicleType, freshness === 'stale' ? 'stale' : 'normal')}
                        >
                            <Popup>
                                <div className="font-bold">{resolveDriverName(asset.driverName)}</div>
                                <div>{asset.vehicleType || 'Vehicle'}</div>
                                <div>Last seen {formatLastSeen(asset.lastSeen, now)}</div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MarkerClusterGroup>
        </MapContainer>
    );
}
