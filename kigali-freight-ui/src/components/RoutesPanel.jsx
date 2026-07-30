// src/components/RoutesPanel.jsx — merges what used to be two separate,
// redundant blocks (an ad-hoc "Committed routes" list hand-built inline in
// Dashboard.jsx, and a near-identical dropdown in HistoryPlayback) into one:
// a single list of committed routes where clicking a row both selects it
// and loads it for map playback.
import { Route, Play, Pause } from 'lucide-react';

export default function RoutesPanel({
  routes = [],
  routesLoading = false,
  playbackCoords = [],
  playbackIndex = 0,
  isPlaying = false,
  selectedPlaybackRoute,
  loadRouteForPlayback,
  togglePlaybackPlay,
}) {
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
          const dName = rt.driverName || rt.driver_name || 'Operator';
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

      {selectedPlaybackRoute && (
        <div className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
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
