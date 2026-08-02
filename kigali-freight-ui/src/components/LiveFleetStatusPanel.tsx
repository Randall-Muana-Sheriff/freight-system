// src/components/LiveFleetStatusPanel.tsx — per-order ETA/distance-remaining
// summary for every ASSIGNED order whose driver currently has live
// telemetry. Complements FleetAssetList (which shows raw driver pings) with
// a delivery-outcome view: how far out, how soon, and whether the signal
// backing that estimate is fresh or stale.
import { useCallback, useEffect, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { fetchLiveFleetStatus } from '../utils/api';

interface FleetReportRow {
    orderId: number;
    cargo: string;
    driver: string;
    estimatedMinutesArrival: number;
    distanceRemainingKm: number;
    telemetryStatus: string;
}

interface FleetStatusReport {
    fleetReport: FleetReportRow[];
    activeFleetCount: number;
}

export default function LiveFleetStatusPanel() {
    const { jwtToken, userRole, resolveDriverName } = useSocket();
    const [report, setReport] = useState<FleetStatusReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setReport(await fetchLiveFleetStatus(jwtToken) as FleetStatusReport);
        } catch (err) {
            setError((err as Error).message || 'Failed to load live fleet status.');
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        void load();
    }, [load]);

    if (userRole !== 'admin' && userRole !== 'dispatcher') {
        return null;
    }

    const fleetReport = report?.fleetReport || [];

    return (
        <div className="bg-panel border border-line/10 p-3 rounded-md text-paper space-y-2">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
                    <Gauge size={12} strokeWidth={2.5} />
                    Live ETAs {report ? `(${report.activeFleetCount})` : ''}
                </h3>
                <button type="button" onClick={() => void load()} disabled={loading} className="text-steel hover:text-paper disabled:opacity-50">
                    <RefreshCw size={11} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-[10px] rounded font-mono">{error}</div>
            )}

            {!error && fleetReport.length === 0 && !loading && (
                <div className="text-steel text-center py-2 text-[11px]">No order currently has both a driver assigned and live telemetry.</div>
            )}

            <div className="max-h-40 overflow-y-auto space-y-1.5">
                {fleetReport.map((row) => (
                    <div
                        key={row.orderId}
                        className={`p-2 border rounded flex items-center justify-between text-xs transition-colors ${
                            row.telemetryStatus === 'STALE_SIGNAL' ? 'border-line/10 bg-panel text-steel opacity-60' : 'border-line/10 bg-ink/60 text-paper'
                        }`}
                    >
                        <div className="flex flex-col truncate max-w-[190px]">
                            <span className="font-medium truncate">#{row.orderId} {row.cargo}</span>
                            <span className="text-[10px] text-steel font-mono">{resolveDriverName(row.driver)}</span>
                        </div>
                        <div className="shrink-0 text-right">
                            <div className="text-[11px] font-bold font-mono text-tarp">{row.estimatedMinutesArrival}m</div>
                            <div className="text-[9px] text-steel font-mono">{row.distanceRemainingKm}km {row.telemetryStatus === 'STALE_SIGNAL' ? '· stale' : ''}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
