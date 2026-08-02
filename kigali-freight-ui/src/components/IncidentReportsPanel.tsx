// src/components/IncidentReportsPanel.tsx — driver-submitted safety reports
// (flat tire, accident, etc.), distinct from IncidentRegistry.jsx which
// shows automated geofence/speed violations.
import { useState } from 'react';
import { ClipboardList, Eye, CheckCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { updateIncidentStatus } from '../utils/api';

const STATUS_STYLES: Record<string, string> = {
    OPEN: 'text-hazard bg-hazard/10 border-hazard/30',
    ACKNOWLEDGED: 'text-carbon bg-carbon/10 border-carbon/30',
    RESOLVED: 'text-tarp bg-tarp/10 border-tarp/30',
};

export default function IncidentReportsPanel() {
    const { incidentReports, jwtToken, resolveDriverName } = useSocket();
    const [busyId, setBusyId] = useState<number | null>(null);

    const handleSetStatus = async (id: number, status: string) => {
        setBusyId(id);
        try {
            await updateIncidentStatus(id, status, jwtToken);
        } catch (err) {
            alert((err as Error).message || 'Failed to update incident status.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-panel border border-line/10 p-3 rounded-md space-y-2">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
                <ClipboardList size={12} strokeWidth={2.5} />
                Driver incident reports ({incidentReports.length})
            </h3>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {incidentReports.length === 0 ? (
                    <div className="text-[11px] text-steel italic p-2 text-center bg-ink/40 rounded border border-line/10">
                        No incident reports submitted by drivers.
                    </div>
                ) : (
                    incidentReports.map((incident) => {
                        const [title, ...rest] = String(incident.description || '').split('\n\n');
                        const status = incident.status || 'OPEN';
                        return (
                            <div key={incident.id} className="p-2 border border-carbon/30 bg-carbon/10 rounded text-[11px] flex flex-col space-y-1">
                                <div className="flex justify-between items-center gap-2">
                                    <span className="font-bold text-paper">{resolveDriverName(incident.driver_name || '')}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="font-mono text-[9px] text-steel">{incident.created_at ? new Date(incident.created_at).toLocaleTimeString() : ''}</span>
                                        <span className={`text-[8px] font-mono font-bold uppercase border rounded px-1 py-0.5 ${STATUS_STYLES[status]}`}>
                                            {status}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-paper font-bold text-[10px]">{title}</div>
                                {rest.length > 0 && <div className="text-steel font-mono text-[10px]">{rest.join('\n\n')}</div>}
                                {status !== 'RESOLVED' && (
                                    <div className="flex gap-1.5 pt-0.5">
                                        {status === 'OPEN' && (
                                            <button
                                                type="button"
                                                onClick={() => void handleSetStatus(incident.id, 'ACKNOWLEDGED')}
                                                disabled={busyId === incident.id}
                                                className="flex items-center gap-1 bg-panel border border-line/15 text-carbon rounded px-1.5 py-0.5 text-[9px] font-bold uppercase disabled:opacity-50"
                                            >
                                                <Eye size={9} strokeWidth={2.5} />
                                                Acknowledge
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void handleSetStatus(incident.id, 'RESOLVED')}
                                            disabled={busyId === incident.id}
                                            className="flex items-center gap-1 bg-tarp/15 border border-tarp/40 text-tarp rounded px-1.5 py-0.5 text-[9px] font-bold uppercase disabled:opacity-50"
                                        >
                                            <CheckCheck size={9} strokeWidth={2.5} />
                                            Resolve
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
