import { useState } from 'react';
import { PenLine, ShieldCheck, Trash2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useAsyncAction, useKeyedAsyncAction } from '../hooks/useAsyncAction';

export default function GeofenceDrawer({ drawModeActive, setDrawModeActive, drawnPoints, setDrawnPoints, setDispatchTargetMode }) {
  const { userRole, savedGeofences, saveGeofence, deleteGeofence } = useSocket();
  const [newFenceName, setNewFenceName] = useState('');
  const [newFenceSpeedLimit, setNewFenceSpeedLimit] = useState('60');
  const { busy: saving, error: saveError, run: runSave } = useAsyncAction();
  const { busyKey: deletingId, error: deleteError, run: runDelete } = useKeyedAsyncAction();
  const error = saveError || deleteError;

  // Previously had no try/catch at all — a failed save (network drop,
  // 500, stale-fence-already-deleted race) left the draw-mode form open
  // with no error shown and the drawn points silently kept, with no
  // indication anything went wrong for a safety-critical feature
  // (speed-limit geofences).
  const handleSave = async () => {
    if (!newFenceName || drawnPoints.length < 3) return;
    await runSave(async () => {
      await saveGeofence({ name: newFenceName, points: drawnPoints, speedLimitKmh: newFenceSpeedLimit });
      setNewFenceName('');
      setNewFenceSpeedLimit('60');
      setDrawnPoints([]);
      setDrawModeActive(false);
    });
  };

  const handleDelete = async (fenceId) => {
    await runDelete(fenceId, () => deleteGeofence(fenceId));
  };

  return (
    <>
      <div className="bg-panel border border-line/10 p-3 rounded-md text-xs">
        {error && (
          <div className="mb-2 p-2 bg-rust/10 border border-rust/30 rounded text-[11px] text-rust font-mono">
            {error}
          </div>
        )}
        {drawModeActive ? (
          <div className="space-y-2">
            <input
              type="text" placeholder="Polygon name" value={newFenceName}
              onChange={(e) => setNewFenceName(e.target.value)}
              className="w-full p-1.5 bg-ink border border-line/15 text-paper rounded text-xs outline-none focus:border-route transition-colors"
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-steel uppercase whitespace-nowrap">Speed max:</span>
              <input
                type="number" value={newFenceSpeedLimit}
                onChange={(e) => setNewFenceSpeedLimit(e.target.value)}
                className="w-full p-1 bg-ink border border-line/15 text-hazard rounded text-xs outline-none font-mono focus:border-route transition-colors"
              />
              <span className="text-[10px] text-steel font-mono">KM/H</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-tarp text-ink font-bold rounded text-[10px] uppercase disabled:opacity-50">
                <ShieldCheck size={12} strokeWidth={2.5} />
                {saving ? 'Saving...' : 'Commit bounds'}
              </button>
              <button onClick={() => { setDrawModeActive(false); setDrawnPoints([]); }} className="py-1.5 px-3 bg-ink border border-line/15 text-steel font-bold rounded text-[10px] uppercase">Clear</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setDrawModeActive(true); setDispatchTargetMode(false); }}
            className="w-full flex items-center justify-center gap-2 py-2 bg-ink hover:text-paper text-steel font-bold border border-line/15 rounded text-[11px] uppercase tracking-wide"
          >
            <PenLine size={13} strokeWidth={2.5} />
            Draw geofence boundary
          </button>
        )}
      </div>
      {savedGeofences.length > 0 && (
        <div className="bg-panel border border-line/10 p-3 rounded-md text-xs space-y-1.5">
          <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
            <ShieldCheck size={12} strokeWidth={2.5} />
            Active geofences ({savedGeofences.length})
          </h3>
          <div className="max-h-[110px] overflow-y-auto space-y-1 pr-1">
            {savedGeofences.map((fence) => (
              <div key={fence.id} className="flex justify-between items-center bg-ink/60 px-2 py-1.5 rounded border border-line/10">
                <div className="flex flex-col">
                  <span className="font-mono text-carbon font-bold text-[11px]">{fence.name}</span>
                  <span className="text-[9px] text-hazard font-mono">Limit: {fence.speedLimitKmh} km/h</span>
                </div>
                {(userRole === 'admin' || userRole === 'dispatcher') && (
                  <button
                    onClick={() => handleDelete(fence.id)}
                    disabled={deletingId === fence.id}
                    className="flex items-center gap-1 text-[9px] bg-rust/10 border border-rust/30 hover:bg-rust/20 text-rust py-0.5 px-2.5 rounded font-bold uppercase disabled:opacity-50"
                  >
                    <Trash2 size={10} strokeWidth={2.5} />
                    {deletingId === fence.id ? '...' : 'Delete'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
