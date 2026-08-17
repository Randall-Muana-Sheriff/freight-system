import { useState } from 'react';
import { Radio, AlertTriangle, Save } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { classifyFreshness, formatLastSeen, useNow } from '../utils/telemetryFreshness';

interface SnapFeedback {
  driverName: string;
  ok: boolean;
  message: string;
}

export default function FleetAssetList() {
  const { trackedAssets, activeBreachedDrivers, saveDriverRouteHistory, resolveDriverName } = useSocket();
  const now = useNow();
  const [savingDriver, setSavingDriver] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SnapFeedback | null>(null);
  // Same freshness rule as the map: a driver's last-known ping is cached
  // indefinitely, so without this an offline driver would sit in this list
  // forever showing a "Live: 0 km/h" reading that's actually hours old.
  const visibleAssets = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline');

  // Previously this button called saveDriverRouteHistory with no
  // try/catch at all — on failure it silently no-op'd, with nothing
  // telling the dispatcher the snapshot was never actually saved.
  const handleSnapAndSave = async (driverName: string) => {
    setSavingDriver(driverName);
    setFeedback(null);
    try {
      await saveDriverRouteHistory(driverName);
      setFeedback({ driverName, ok: true, message: 'Saved' });
    } catch (err) {
      setFeedback({ driverName, ok: false, message: (err as Error).message || 'Failed to save' });
    } finally {
      setSavingDriver(null);
      setTimeout(() => setFeedback((current) => (current?.driverName === driverName ? null : current)), 4000);
    }
  };

  return (
    <div className="flex-1 min-h-[140px] overflow-y-auto space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-micro font-bold text-steel uppercase tracking-wider">
        <Radio size={12} strokeWidth={2.5} />
        Field transmissions ({visibleAssets.length})
      </h3>
      {visibleAssets.map((asset) => {
        const violationRecord = activeBreachedDrivers[asset.driverName];
        const hasViolation = !!violationRecord;
        const isStale = classifyFreshness(asset.lastSeen, now) === 'stale';
        const isSaving = savingDriver === asset.driverName;
        const assetFeedback = feedback?.driverName === asset.driverName ? feedback : null;
        return (
          <div
            key={asset.driverName}
            className={`p-2 border rounded flex items-center justify-between text-data transition-colors ${hasViolation ?
              (violationRecord.type === 'SPEED_VIOLATION' ? 'border-hazard/30 bg-hazard/10 text-hazard' : 'border-rust/30 bg-rust/10 text-rust') :
              isStale ? 'border-line/10 bg-panel text-steel opacity-60' : 'border-line/10 bg-panel text-paper'}`}
          >
            <div className="flex flex-col truncate max-w-[280px]">
              <span className="font-medium flex items-center gap-1.5">
                {hasViolation ? <AlertTriangle size={12} /> : null}
                {resolveDriverName(asset.driverName)}
              </span>
              <span className="text-micro text-steel font-mono">
                {isStale ? `Idle · last seen ${formatLastSeen(asset.lastSeen, now)}` : `Live: ${asset.velocityKmh} km/h`}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <button
                onClick={() => void handleSnapAndSave(asset.driverName)}
                disabled={isSaving}
                className="flex items-center gap-1 text-micro bg-carbon/10 border border-carbon/30 hover:bg-carbon/20 text-carbon py-1 px-2 rounded disabled:opacity-50"
              >
                <Save size={10} strokeWidth={2.5} />
                {isSaving ? 'Saving...' : 'Snap & save'}
              </button>
              {assetFeedback && (
                <span className={`text-micro font-mono ${assetFeedback.ok ? 'text-tarp' : 'text-rust'}`}>
                  {assetFeedback.message}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
