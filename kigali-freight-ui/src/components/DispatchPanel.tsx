import { Crosshair, MapPinned } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface RoadMatrixRanking {
  driverName: string;
  distanceKm: number;
  etaMinutes: number;
}

interface DispatchPanelProps {
  dispatchTargetMode: boolean;
  setDispatchTargetMode: (value: boolean) => void;
  setDrawModeActive: (value: boolean) => void;
  dispatchRankings: unknown[];
}

export default function DispatchPanel({ dispatchTargetMode, setDispatchTargetMode, setDrawModeActive, dispatchRankings }: DispatchPanelProps) {
  const { resolveDriverName } = useSocket();
  const rankings = dispatchRankings as RoadMatrixRanking[];
  return (
    <div className="bg-panel border border-line/10 p-3 rounded-md space-y-2">
      <h3 className="flex items-center gap-1.5 text-micro font-bold text-steel uppercase tracking-wider">
        <Crosshair size={12} strokeWidth={2.5} />
        Route matrix dispatch
      </h3>
      <button
        onClick={() => { setDispatchTargetMode(!dispatchTargetMode); setDrawModeActive(false); }}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded font-mono text-data font-bold uppercase tracking-wide transition-colors ${dispatchTargetMode ? 'bg-tarp text-ink' : 'bg-ink text-steel border border-line/15 hover:text-paper'}`}
      >
        <MapPinned size={13} strokeWidth={2.5} />
        {dispatchTargetMode ? 'Target picker active' : 'Choose map target'}
      </button>
      {rankings.length > 0 && (
        <div className="space-y-1 max-h-[110px] overflow-y-auto pt-1">
          {rankings.slice(0, 3).map((rank, i) => (
            <div key={i} className="flex justify-between items-center bg-ink/60 px-2 py-1.5 rounded text-data border border-line/10">
              <span className="font-bold text-paper truncate max-w-[130px]">{resolveDriverName(rank.driverName)}</span>
              <span className="font-mono text-tarp font-bold">{rank.distanceKm} km | {rank.etaMinutes} mins</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
