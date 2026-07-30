import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, LayerGroup, useMap, useMapEvents } from 'react-leaflet';
import { useSocket } from '../context/SocketContext';
import { truckIcon, violatorIcon, staleIcon, flagIcon, hubIcon } from '../utils/mapIcons';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';

// Leaflet measures its container at the exact instant it initializes. In a
// nested flex layout (screen -> flex row -> this flex-1 map div), the
// container can still be mid-layout at that moment, so Leaflet locks in a
// stale/wrong size and silently renders at the wrong zoom/bounds forever
// after — it never self-corrects. Forcing invalidateSize() once the
// browser has actually finished a layout+paint pass fixes it; the resize
// listener covers the panel/window being resized afterward too.
function MapSizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    window.addEventListener('resize', fix);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fix);
    };
  }, [map]);
  return null;
}

function MapClickHandler({
  drawModeActive, setDrawnPoints,
  dispatchTargetMode, setDispatchLocation, onDispatchClick,
  stopTargetMode, setNewStopCoords, setStopTargetMode,
  orderDeliveryTargetMode, setNewOrderDeliveryCoords, setOrderDeliveryTargetMode,
  hubTargetMode, setNewHubCoords, setHubTargetMode
}) {
  useMapEvents({
    click(e) {
      if (drawModeActive) {
        setDrawnPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
      } else if (dispatchTargetMode) {
        setDispatchLocation([e.latlng.lat, e.latlng.lng]);
        onDispatchClick(e.latlng.lat, e.latlng.lng);
      } else if (stopTargetMode) {
        setNewStopCoords([e.latlng.lat, e.latlng.lng]);
        setStopTargetMode(false); // Disable picking mode after choice
      } else if (orderDeliveryTargetMode) {
        setNewOrderDeliveryCoords([e.latlng.lat, e.latlng.lng]);
        setOrderDeliveryTargetMode(false);
      } else if (hubTargetMode) {
        setNewHubCoords([e.latlng.lat, e.latlng.lng]);
        setHubTargetMode(false);
      }
    },
  });
  return null;
}

export default function FleetMap({
  drawModeActive, drawnPoints, setDrawnPoints,
  dispatchTargetMode, dispatchLocation, setDispatchLocation, onDispatchClick,
  trailLimit, playbackCoords, playbackIndex,
  optimizedRoutes = [],
  stopTargetMode, setStopTargetMode, newStopCoords, setNewStopCoords,
  orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, setNewOrderDeliveryCoords,
  hubTargetMode, setHubTargetMode, newHubCoords, setNewHubCoords
}) {
  const { savedGeofences, savedHubs, routeHistories, trackedAssets, activeBreachedDrivers } = useSocket();
  const now = useNow();
  // A driver's last-known position is cached indefinitely server-side —
  // without checking lastSeen, a driver who went offline hours ago would
  // still render as a live truck forever. "offline" ones are dropped
  // entirely rather than showing hours/days-old ghosts on the map.
  const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');

  return (
    <div className="flex-1 h-full w-full relative z-[1] bg-ink">
      <MapContainer center={[-1.9450, 30.0600]} zoom={13} className="h-full w-full">
        <MapSizeFix />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapClickHandler
          drawModeActive={drawModeActive}
          setDrawnPoints={setDrawnPoints}
          dispatchTargetMode={dispatchTargetMode}
          setDispatchLocation={setDispatchLocation}
          onDispatchClick={onDispatchClick}
          stopTargetMode={stopTargetMode}
          setNewStopCoords={setNewStopCoords}
          setStopTargetMode={setStopTargetMode}
          orderDeliveryTargetMode={orderDeliveryTargetMode}
          setNewOrderDeliveryCoords={setNewOrderDeliveryCoords}
          setOrderDeliveryTargetMode={setOrderDeliveryTargetMode}
          hubTargetMode={hubTargetMode}
          setNewHubCoords={setNewHubCoords}
          setHubTargetMode={setHubTargetMode}
        />

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
          const positions = fence.geojson.coordinates[0].map(([lng, lat]) => [lat, lng]);
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

        {/* Render Optimized VRP Multi-Stop Routes */}
        {optimizedRoutes.map((routeGroup, idx) => {
          const routePositions = routeGroup.sequence.map((node) => [node.lat, node.lng]);
          const colors = ['#FF8A3D', '#5B84A6', '#5B8C6E', '#E0A238'];
          const strokeColor = colors[idx % colors.length];

          return (
            <LayerGroup key={`vrp-group-${idx}`}>
              <Polyline
                positions={routePositions}
                pathOptions={{ color: strokeColor, weight: 3.5, opacity: 0.9, dashArray: '6, 6' }}
              />
              {routeGroup.sequence.map((node, nodeIdx) => (
                <Marker key={`node-${idx}-${nodeIdx}`} position={[node.lat, node.lng]}>
                  <Popup>
                    <div className="text-xs font-mono text-slate-900 space-y-1">
                      <div className="font-bold">{node.name || `Stop ${nodeIdx}`}</div>
                      <div className="text-slate-600 font-bold">Vehicle Route: #{idx + 1}</div>
                      {node.demand && <div className="text-route-deep font-bold">Demand Load: {node.demand}</div>}
                      <div className="text-[10px] text-slate-400 font-bold">Sequence Order: {nodeIdx}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </LayerGroup>
          );
        })}

        {Object.entries(routeHistories).map(([driverName, history]) => {
          const slicedTrail = history.slice(-trailLimit);
          if (slicedTrail.length < 2) return null;
          const hasViolation = !!activeBreachedDrivers[driverName];
          return <Polyline key={driverName} positions={slicedTrail} pathOptions={{ color: hasViolation ? '#C1442E' : '#5B8C6E', weight: 2.5 }} />;
        })}

        {visibleAssets.map((asset) => {
          const hasViolation = !!activeBreachedDrivers[asset.driverName];
          const isStale = classifyFreshness(asset.lastSeen, now) === 'stale';
          const icon = isStale ? staleIcon : hasViolation ? violatorIcon : truckIcon;
          return (
            <Marker key={asset.driverName} position={[asset.lat, asset.lng]} icon={icon}>
              <Popup>
                <div className="text-xs font-mono text-slate-900">
                  <div className="font-bold">{asset.driverName}</div>
                  {isStale ? (
                    <div className="text-slate-500 font-bold">Last seen {formatLastSeen(asset.lastSeen, now)}</div>
                  ) : (
                    <div className="text-slate-600 font-bold">Speed: {asset.velocityKmh} km/h</div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* New stop drop-pin marker */}
        {newStopCoords && (
          <Marker position={newStopCoords} icon={flagIcon}>
            <Popup>
              <div className="text-xs font-mono text-slate-900 font-bold">New Delivery Stop Target</div>
            </Popup>
          </Marker>
        )}

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