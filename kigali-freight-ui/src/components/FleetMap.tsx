// Previously ~470 lines: seven fully self-contained Leaflet control
// components (each only using useMap()/L.control, nothing from FleetMap's
// own state) were all defined inline here. Extracted into
// src/components/map/ — pure code movement, no behavior changes.
import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, LayersControl, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';
import { truckIcon, flagIcon, hubIcon, getVehicleIcon, VEHICLE_TYPE_LEGEND } from '../utils/mapIcons';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';
import MapSizeFix from './map/MapSizeFix';
import MapClickHandler from './map/MapClickHandler';
import LocationSearchControl from './map/LocationSearchControl';
import FullscreenControl from './map/FullscreenControl';
import LocateControl from './map/LocateControl';
import ScaleBarControl from './map/ScaleBarControl';
import type { PickHandlers } from './map/applyPickedLocation';

export default function FleetMap() {
  const { jwtToken, savedGeofences, savedHubs, routeHistories, trackedAssets, activeBreachedDrivers, resolveDriverName } = useSocket();
  const {
    drawModeActive, drawnPoints, setDrawnPoints,
    dispatchTargetMode, dispatchLocation, setDispatchLocation, handleDispatchClick,
    trailLimit, playbackCoords, playbackIndex,
    orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, setNewOrderDeliveryCoords,
    hubTargetMode, setHubTargetMode, newHubCoords, setNewHubCoords,
    placementStep, handlePlacementPick,
  } = useMapInteraction();
  const now = useNow();
  // Trails are opt-in per vehicle rather than always-on for the whole
  // fleet — with many vehicles moving at once, a permanent breadcrumb line
  // behind every single one turns the map into an unreadable tangle.
  // Clicking a vehicle reveals its trail; clicking it again (or clicking
  // empty map space) hides it.
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);
  // A driver's last-known position is cached indefinitely server-side —
  // without checking lastSeen, a driver who went offline hours ago would
  // still render as a live truck forever. "offline" ones are dropped
  // entirely rather than showing hours/days-old ghosts on the map.
  const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');

  // Shared by the map's click handler and the address-search box so both
  // ways of picking a location feed the same four target-mode flows.
  const pickHandlers: PickHandlers = {
    drawModeActive, setDrawnPoints,
    dispatchTargetMode, setDispatchLocation,
    onDispatchClick: (lat: number, lng: number) => { void handleDispatchClick(lat, lng); },
    orderDeliveryTargetMode, setNewOrderDeliveryCoords, setOrderDeliveryTargetMode,
    hubTargetMode, setNewHubCoords, setHubTargetMode,
    placementStep, onPlacementPick: handlePlacementPick,
  };

  return (
    <div className="flex-1 h-full w-full relative z-[1] bg-ink">
      {/* Shape-by-vehicle-type key. Positioned above Leaflet's own panes
          (which top out around z-index 650) so it never gets buried under
          tiles/markers/popups. */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-panel/90 border border-line/15 rounded-md px-2.5 py-2 space-y-1 pointer-events-none">
        <div className="text-[9px] font-mono uppercase tracking-wider text-carbon font-bold mb-1">Vehicle type</div>
        {VEHICLE_TYPE_LEGEND.map(({ name, glyph }) => (
          <div key={name} className="flex items-center gap-1.5">
            <div className="w-4 h-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: glyph }} />
            <span className="text-[10px] text-steel font-mono">{name}</span>
          </div>
        ))}
      </div>
      <MapContainer center={[-1.9450, 30.0600]} zoom={13} className="h-full w-full">
        <MapSizeFix />
        <FullscreenControl />
        <LocateControl />
        <ScaleBarControl />
        <LocationSearchControl jwtToken={jwtToken} pickHandlers={pickHandlers} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Streets">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapClickHandler {...pickHandlers} onBackgroundClick={() => setSelectedDriverName(null)} />

        {/* Registered dispatch hubs — static infrastructure markers */}
        {savedHubs.map((hub) => (
          <Marker key={`hub-${hub.id}`} position={[hub.lat, hub.lng]} icon={hubIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900">
                <div className="font-bold">{hub.name}</div>
                <div className="text-slate-600 font-bold">{hub.code}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {savedGeofences.map((fence) => {
          const positions = fence.geojson.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
          return (
            <Polygon
              key={fence.id} positions={positions}
              pathOptions={{ color: '#5B84A6', fillColor: '#5B84A6', fillOpacity: 0.1, weight: 1.5 }}
            />
          );
        })}

        {drawModeActive && drawnPoints.length > 0 && (
          <>
            {drawnPoints.map((pt, idx) => <Marker key={idx} position={pt} />)}
            {drawnPoints.length > 1 && <Polygon positions={drawnPoints} pathOptions={{ color: '#C1442E', dashArray: '4,4' }} />}
          </>
        )}

        {selectedDriverName && (() => {
          const history = routeHistories[selectedDriverName];
          const slicedTrail = history ? history.slice(-trailLimit) : [];
          if (slicedTrail.length < 2) return null;
          const hasViolation = !!activeBreachedDrivers[selectedDriverName];
          return <Polyline positions={slicedTrail} pathOptions={{ color: hasViolation ? '#C1442E' : '#5B8C6E', weight: 2.5 }} />;
        })()}

        {/* A soft ring under the selected vehicle so it's obvious which
            one you're looking at even before its trail has enough points
            to draw (e.g. it's been sitting still). */}
        {selectedDriverName && trackedAssets[selectedDriverName] && (
          <CircleMarker
            center={[trackedAssets[selectedDriverName].lat, trackedAssets[selectedDriverName].lng]}
            radius={22}
            pathOptions={{ color: '#5B84A6', weight: 2, fillColor: '#5B84A6', fillOpacity: 0.12 }}
            interactive={false}
          />
        )}

        {/* Clustered so a growing fleet doesn't turn into an unreadable
            pile of overlapping markers at low zoom; expands automatically
            as the dispatcher zooms in. */}
        <MarkerClusterGroup chunkedLoading maxClusterRadius={45} spiderfyOnMaxZoom showCoverageOnHover={false}>
          {visibleAssets.map((asset) => {
            const hasViolation = !!activeBreachedDrivers[asset.driverName];
            const isStale = classifyFreshness(asset.lastSeen, now) === 'stale';
            const status = isStale ? 'stale' : hasViolation ? 'violator' : 'normal';
            const icon = getVehicleIcon(asset.vehicleType, status);
            const isSelected = selectedDriverName === asset.driverName;
            return (
              <Marker
                key={asset.driverName}
                position={[asset.lat, asset.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedDriverName((prev) => (prev === asset.driverName ? null : asset.driverName)),
                }}
              >
                <Popup>
                  <div className="text-xs font-mono text-slate-900">
                    <div className="font-bold">{resolveDriverName(asset.driverName)}</div>
                    {asset.vehicleType && <div className="text-slate-500">{asset.vehicleType}</div>}
                    {isStale ? (
                      <div className="text-slate-500 font-bold">Last seen {formatLastSeen(asset.lastSeen, now)}</div>
                    ) : (
                      <div className="text-slate-600 font-bold">Speed: {asset.velocityKmh} km/h</div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1">
                      {isSelected ? 'Trail shown — click marker again to hide' : 'Click marker to show movement trail'}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {/* Picked location for a hub being created/edited */}
        {newHubCoords && (
          <Marker position={newHubCoords} icon={flagIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900 font-bold">New hub location</div>
            </Popup>
          </Marker>
        )}

        {/* Picked delivery point for a new order being created */}
        {newOrderDeliveryCoords && (
          <Marker position={newOrderDeliveryCoords} icon={flagIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900 font-bold">New order delivery point</div>
            </Popup>
          </Marker>
        )}

        {/* Dispatch target: mark the clicked location with a flag */}
        {dispatchLocation && (
          <Marker position={dispatchLocation} icon={flagIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900 font-bold">Dispatch target hub</div>
            </Popup>
          </Marker>
        )}

        {/* Historical playback: full route shown as a dashed trail, with a flag marker at the current index */}
        {playbackCoords.length > 1 && (
          <Polyline positions={playbackCoords} pathOptions={{ color: '#E0A238', weight: 2, dashArray: '6,6' }} />
        )}
        {playbackCoords.length > 0 && playbackCoords[playbackIndex] && (
          <Marker position={playbackCoords[playbackIndex]} icon={truckIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900 font-bold">
                Playback position {playbackIndex + 1} / {playbackCoords.length}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
