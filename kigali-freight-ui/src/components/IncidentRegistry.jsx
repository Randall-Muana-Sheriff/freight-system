import { AlertTriangle, Siren } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

export default function IncidentRegistry() {
  const { violations, resolveDriverName } = useSocket();

  return (
    <div className="bg-panel border border-line/10 p-3 rounded-md space-y-2">
      <h3 className="text-[10px] font-bold text-rust uppercase tracking-wider flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rust opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rust"></span>
        </span>
        Incident registry
      </h3>
      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
        {violations.length === 0 ? (
          <div className="text-[11px] text-steel italic p-2 text-center bg-ink/40 rounded border border-line/10">
            No active security or speed breaches detected.
          </div>
        ) : (
          violations.map((violation) => (
            <div key={violation.id} className={`p-2 border rounded text-[11px] flex flex-col space-y-0.5 ${violation.type === 'SPEED_VIOLATION' ? 'border-hazard/30 bg-hazard/10' : 'border-rust/30 bg-rust/10'}`}>
              <div className="flex justify-between font-bold text-paper">
                <span className="flex items-center gap-1.5">
                  {violation.type === 'SPEED_VIOLATION' ? <AlertTriangle size={12} className="text-hazard" /> : <Siren size={12} className="text-rust" />}
                  {resolveDriverName(violation.driverName)}
                </span>
                <span className="font-mono text-[9px] text-steel">{new Date(violation.enteredAt).toLocaleTimeString()}</span>
              </div>
              <div className="text-steel font-mono text-[10px]">{violation.description}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
