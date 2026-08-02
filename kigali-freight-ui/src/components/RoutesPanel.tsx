// src/components/RoutesPanel.tsx — merges what used to be two separate,
// redundant blocks (an ad-hoc "Committed routes" list hand-built inline in
// Dashboard.jsx, and a near-identical dropdown in HistoryPlayback) into one:
// a single list of committed routes where clicking a row both selects it
// and loads it for map playback.
import { useState } from 'react';
import { Route, Play, Pause, History } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import type { SavedRoute, PlaybackRoute, LatLng } from '../types';

interface BreadcrumbLoaderProps {
  onLoad: (driverName: string, hours: number) => void;
  loading: boolean;
}

// Historical breadcrumbs picker — pulls a driver's actual telemetry trail
// (PostGIS-simplified) for a lookback window, independent of the manual
// "Snap & save" committed-routes flow above it. Feeds the same map playback
// state, it just skips the geojson-parsing path since the backend already
// hands back plain [lat, lng] pairs.
function BreadcrumbLoader({ onLoad, loading }: BreadcrumbLoaderProps) {
  const { savedDrivers } = useSocket();
  const [driverName, setDriverName] = useState('');
  const [hours, setHours] = useState(4);

  return (
    <div className="space-y-1.5 bg-ink/60 p-2.5 rounded border border-line/10">
      <div className="flex items-center gap-1.5 text-[9px] text-steel uppercase tracking-wider font-sans">
        <History size={11} strokeWidth={2.5} />
        Historical breadcrumbs
      </div>
      <div className="flex gap-1.5">
        <select
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper font-sans"
        >
          <option value="">Select driver</option>
          {savedDrivers.map((d) => (
            <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          max="72"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          title="Lookback window, hours"
          className="w-14 shrink-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper font-mono text-center"
        />
        <button
          type="button"
          onClick={() => onLoad(driverName, hours)}
          disabled={!driverName || loading}
          className="shrink-0 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
        >
          {loading ? '...' : 'Load'}
        </button>
      </div>
    </div>
  );
}

interface RoutesPanelProps {
  routes?: SavedRoute[];
  routesLoading?: boolean;
  playbackCoords?: LatLng[];
  playbackIndex?: number;
  isPlaying?: boolean;
  selectedPlaybackRoute?: PlaybackRoute | null;
  loadRouteForPlayback: (route: SavedRoute) => void;
  togglePlaybackPlay: () => void;
  onLoadBreadcrumbs?: (driverName: string, hours: number) => void;
  breadcrumbsLoading?: boolean;
}

export default function RoutesPanel({
  routes = [],
  routesLoading = false,
  playbackCoords = [],
  playbackIndex = 0,
  isPlaying = false,
  selectedPlaybackRoute,
  loadRouteForPlayback,
  togglePlaybackPlay,
  onLoadBreadcrumbs,
  breadcrumbsLoading = false,
}: RoutesPanelProps) {
  const { resolveDriverName } = useSocket();
  return (
    <div className="bg-panel border border-line/10 p-3 rounded-md text-paper space-y-2 font-mono text-[11px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Route size={12} strokeWidth={2.5} className="text-steel" />
          <span className="text-paper font-bold font-sans text-xs">Committed routes ({routes.length})</span>
        </div>
        {routesLoading && <span className="text-[9px] text-carbon animate-pulse">Syncing...</span>}
      </div>

      <div className="max-h-32 overflow-y-auto space-y-1">
        {routes.length === 0 && (
          <div className="text-steel text-center py-2 text-[11px] font-sans">No routes committed yet.</div>
        )}
        {routes.map((rt) => {
          const isSelected = selectedPlaybackRoute?.id === rt.id;
          const vId = rt.vehicleId || rt.vehicle_id || rt.id;
          const dName = resolveDriverName(rt.driverName || rt.driver_name || '') || 'Operator';
          const dist = rt.aggregateDistanceKm || rt.aggregate_distance_km || rt.distanceKm || 0;
          return (
            <button
              key={rt.id}
              type="button"
              onClick={() => loadRouteForPlayback(rt)}
              className={`w-full flex justify-between items-center p-1.5 rounded border text-left transition-colors ${
                isSelected ? 'bg-route/10 border-route/40' : 'bg-ink/60 border-line/10 hover:border-line/25'
              }`}
            >
              <span className={`truncate max-w-[150px] ${isSelected ? 'text-route' : 'text-steel'}`}>
                Vehicle #{vId} - {dName}
              </span>
              <span className="text-[10px] text-tarp bg-tarp/15 px-1 py-0.5 rounded border border-tarp/30 shrink-0">
                {dist} km
              </span>
            </button>
          );
        })}
      </div>

      {onLoadBreadcrumbs && <BreadcrumbLoader onLoad={onLoadBreadcrumbs} loading={breadcrumbsLoading} />}

      {selectedPlaybackRoute && (
        <div className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
          {selectedPlaybackRoute.label && (
            <div className="text-[10px] text-route font-bold font-sans truncate">{selectedPlaybackRoute.label}</div>
          )}
          <div className="flex justify-between text-[10px] text-steel">
            <span>Progress: {playbackIndex} / {playbackCoords.length > 0 ? playbackCoords.length - 1 : 0} pts</span>
            <span className="text-tarp font-bold">{isPlaying ? 'PLAYING...' : 'PAUSED'}</span>
          </div>
          <button
            onClick={togglePlaybackPlay}
            className={`w-full flex items-center justify-center gap-2 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all ${isPlaying ? 'bg-hazard text-ink' : 'bg-tarp text-ink'}`}
          >
            {isPlaying ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
            {isPlaying ? 'Pause playback' : 'Start playback'}
          </button>
        </div>
      )}
    </div>
  );
}
