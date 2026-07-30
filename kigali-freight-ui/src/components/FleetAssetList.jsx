import { Radio, AlertTriangle, Save } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';

export default function FleetAssetList() {
  const { trackedAssets, activeBreachedDrivers, saveDriverRouteHistory } = useSocket();
  const now = useNow();
  // Same freshness rule as the map: a driver's last-known ping is cached
  // indefinitely, so without this an offline driver would sit in this list
  // forever showing a "Live: 0 km/h" reading that's actually hours old.
  const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');

  return (
    <div className="flex-1 min-h-[140px] overflow-y-auto space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
        <Radio size={12} strokeWidth={2.5} />
        Field transmissions ({visibleAssets.length})
      </h3>
      {visibleAssets.map((asset) => {
        const violationRecord = activeBreachedDrivers[asset.driverName];
        const hasViolation = !!violationRecord;
        const isStale = classifyFreshness(asset.lastSeen, now) === 'stale';
        return (
          <div
            key={asset.driverName}
            className={`p-2 border rounded flex items-center justify-between text-xs transition-colors ${hasViolation ?
              (violationRecord.type === 'SPEED_VIOLATION' ? 'border-hazard/30 bg-hazard/10 text-hazard' : 'border-rust/30 bg-rust/10 text-rust') :
              isStale ? 'border-line/10 bg-panel text-steel opacity-60' : 'border-line/10 bg-panel text-paper'}`}
          >
            <div className="flex flex-col truncate max-w-[280px]">
              <span className="font-medium flex items-center gap-1.5">
                {hasViolation ? <AlertTriangle size={12} /> : null}
                {asset.driverName}
              </span>
              <span className="text-[10px] text-steel font-mono">
                {isStale ? `Idle · last seen ${formatLastSeen(asset.lastSeen, now)}` : `Live: ${asset.velocityKmh} km/h`}
              </span>
            </div>
            <button onClick={() => saveDriverRouteHistory(asset.driverName)} className="flex items-center gap-1 text-[9px] bg-carbon/10 border border-carbon/30 hover:bg-carbon/20 text-carbon py-1 px-2 rounded">
              <Save size={10} strokeWidth={2.5} />
              Snap & save
            </button>
          </div>
        );
      })}
    </div>
  );
}
