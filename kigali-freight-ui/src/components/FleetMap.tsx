// Previously ~470 lines: seven fully self-contained Leaflet control
// components (each only using useMap()/L.control, nothing from FleetMap's
// own state) were all defined inline here. Extracted into
// src/components/map/ — pure code movement, no behavior changes.
import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, LayersControl, LayerGroup, CircleMarker } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';
import { truckIcon, flagIcon, hubIcon, stopIcon, getVehicleIcon, VEHICLE_TYPE_LEGEND } from '../utils/mapIcons';
import { placedStops, tripPolyline, isStopSettled } from '../utils/tripMapLayer';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';
import { getCartoApiKey } from '../utils/runtimeConfig';
import {
  CARTO_ATTRIBUTION,
  CARTO_MAX_ZOOM,
  cartoTileUrl,
  ESRI_DARK_ATTRIBUTION,
  ESRI_DARK_BASE_URL,
  ESRI_DARK_LABELS_URL,
  ESRI_DARK_MAX_ZOOM,
  ESRI_IMAGERY_ATTRIBUTION,
  ESRI_IMAGERY_MAX_ZOOM,
  ESRI_IMAGERY_URL,
} from '../utils/mapTiles';
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
    focusedTrip,
  } = useMapInteraction();
  const now = useNow();
  const [selectedDriverName, setSelectedDriverName] = useState<string | null>(null);
  const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');
  const cartoKey = getCartoApiKey();

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
      <div className="absolute bottom-3 right-3 z-[1000] bg-panel/90 border border-line/15 rounded-md px-2.5 py-2 space-y-1 pointer-events-none">
        <div className="text-micro font-mono uppercase tracking-wider text-carbon font-bold mb-1">Vehicle type</div>
        {VEHICLE_TYPE_LEGEND.map(({ name, glyph }) => (
          <div key={name} className="flex items-center gap-1.5">
            <div className="w-4 h-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: glyph }} />
            <span className="text-micro text-steel font-mono">{name}</span>
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
            {cartoKey ? (
              <TileLayer
                url={cartoTileUrl('dark_all', cartoKey)}
                attribution={CARTO_ATTRIBUTION}
                maxZoom={CARTO_MAX_ZOOM}
              />
            ) : (
              <LayerGroup>
                <TileLayer
                  url={ESRI_DARK_BASE_URL}
                  attribution={ESRI_DARK_ATTRIBUTION}
                  maxZoom={ESRI_DARK_MAX_ZOOM}
                />
                <TileLayer
                  url={ESRI_DARK_LABELS_URL}
                  attribution={ESRI_DARK_ATTRIBUTION}
                  maxZoom={ESRI_DARK_MAX_ZOOM}
                />
              </LayerGroup>
            )}
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url={ESRI_IMAGERY_URL}
              attribution={ESRI_IMAGERY_ATTRIBUTION}
              maxZoom={ESRI_IMAGERY_MAX_ZOOM}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <MapClickHandler {...pickHandlers} onBackgroundClick={() => setSelectedDriverName(null)} />
        {savedHubs.map((hub) => (
          <Marker key={`hub-${hub.id}`} position={[hub.lat, hub.lng]} icon={hubIcon}>
            <Popup>
              <div className="text-data font-mono text-slate-900">
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
        {selectedDriverName && trackedAssets[selectedDriverName] && (
          <CircleMarker
            center={[trackedAssets[selectedDriverName].lat, trackedAssets[selectedDriverName].lng]}
            radius={22}
            pathOptions={{ color: '#5B84A6', weight: 2, fillColor: '#5B84A6', fillOpacity: 0.12 }}
            interactive={false}
          />
        )}
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
                  <div className="text-data font-mono text-slate-900">
                    <div className="font-bold">{resolveDriverName(asset.driverName)}</div>
                    {asset.vehicleType && <div className="text-slate-500">{asset.vehicleType}</div>}
                    {isStale ? (
                      <div className="text-slate-500 font-bold">Last seen {formatLastSeen(asset.lastSeen, now)}</div>
                    ) : (
                      <div className="text-slate-600 font-bold">Speed: {asset.velocityKmh} km/h</div>
                    )}
                    <div className="text-micro text-slate-400 mt-1">
                      {isSelected ? 'Trail shown. Click the marker again to hide' : 'Click marker to show movement trail'}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
        {focusedTrip && (() => {
          const placed = placedStops(focusedTrip);
          const positions = tripPolyline(focusedTrip);
          return (
            <>
              {positions.length > 1 && (
                <Polyline positions={positions} pathOptions={{ color: '#5B8C6E', weight: 2.5, opacity: 0.85, dashArray: '7,5' }} />
              )}
              {placed.map((stop) => (
                <Marker
                  key={`trip-stop-${stop.id}`}
                  position={[stop.lat, stop.lng]}
                  icon={stopIcon(stop.sequence, isStopSettled(stop), stop.kind)}
                >
                  <Popup>
                    <div className="text-data font-mono text-slate-900 space-y-1">
                      <div className="font-bold">
                        {stop.sequence}. {stop.kind === 'PICKUP' ? 'Collect' : 'Deliver'}
                      </div>
                      <div className="text-slate-600">{stop.cargo_description}</div>
                      <div className="text-slate-500">{stop.address_text || 'Placed on the map'}</div>
                      <div className="font-bold text-route-deep">{stop.status}</div>
                      {stop.failure_reason && <div className="text-rust">{stop.failure_reason}</div>}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </>
          );
        })()}
        {newHubCoords && (
          <Marker position={newHubCoords} icon={flagIcon}>
            <Popup>
              <div className="text-data font-mono text-slate-900 font-bold">New hub location</div>
            </Popup>
          </Marker>
        )}
        {newOrderDeliveryCoords && (
          <Marker position={newOrderDeliveryCoords} icon={flagIcon}>
            <Popup>
              <div className="text-data font-mono text-slate-900 font-bold">New order delivery point</div>
            </Popup>
          </Marker>
        )}
        {dispatchLocation && (
          <Marker position={dispatchLocation} icon={flagIcon}>
            <Popup>
              <div className="text-data font-mono text-slate-900 font-bold">Dispatch target hub</div>
            </Popup>
          </Marker>
        )}
        {playbackCoords.length > 1 && (
          <Polyline positions={playbackCoords} pathOptions={{ color: '#E0A238', weight: 2, dashArray: '6,6' }} />
        )}
        {playbackCoords.length > 0 && playbackCoords[playbackIndex] && (
          <Marker position={playbackCoords[playbackIndex]} icon={truckIcon}>
            <Popup>
              <div className="text-data font-mono text-slate-900 font-bold">
                Playback position {playbackIndex + 1} / {playbackCoords.length}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
