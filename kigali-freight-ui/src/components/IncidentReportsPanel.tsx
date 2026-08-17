// src/components/IncidentReportsPanel.tsx — driver-submitted safety reports
// (flat tire, accident, etc.), distinct from IncidentRegistry.jsx which
// shows automated geofence/speed violations.
import { useEffect, useState } from 'react';
import { ClipboardList, Eye, CheckCheck, AlertTriangle, Sparkles, Package } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { updateIncidentStatus } from '../utils/api';
import { isUrgentIncident } from '../utils/incidentSeverity';
import { useDialog } from './DialogProvider';

const RESOLVED_VISIBLE_MS = 30 * 60 * 1000;

// Friendly labels, not raw enum values — "OPEN" reads like a debug value,
// "Awaiting review" reads like a product. Matches the driver app's own
// history view (STATUS_META in incidents.tsx) so the same status means
// the same words on both sides.
const STATUS_META: Record<string, { label: string; className: string }> = {
    OPEN: { label: 'Awaiting review', className: 'text-hazard bg-hazard/15' },
    ACKNOWLEDGED: { label: 'Being handled', className: 'text-carbon bg-carbon/15' },
    RESOLVED: { label: 'Resolved', className: 'text-tarp bg-tarp/15' },
};

// Same wording as the driver app's own stagePhrase (incidents.tsx) and the
// backend's stagePhraseForStatus (incidentController.js) — purely cosmetic
// here, the order's real current status is the source of truth.
function stagePhrase(status?: string | null) {
    switch (String(status || '').toUpperCase()) {
        case 'ASSIGNED':
            return 'Heading to pick up';
        case 'PICKED_UP':
        case 'IN_TRANSIT':
            return 'In transit with';
        case 'ARRIVED':
            return 'Heading to deliver';
        default:
            return null;
    }
}

export default function IncidentReportsPanel() {
    const { alert } = useDialog();
    const { incidentReports, jwtToken, resolveDriverName, setViewingImage } = useSocket();
    const [busyId, setBusyId] = useState<number | null>(null);

    // The initial GET already excludes long-resolved reports, but a report
    // resolved *while this dashboard is open* arrives via the live socket
    // event and is applied in place — nothing re-runs that filter again on
    // its own. This just forces a re-render once a minute so a report
    // resolved mid-session still fades out of the live view on schedule,
    // not only on the next full page load.
    const [, forceTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => forceTick((t) => t + 1), 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const visibleReports = incidentReports.filter((incident) => {
        if (incident.status !== 'RESOLVED' || !incident.resolved_at) return true;
        return Date.now() - new Date(incident.resolved_at).getTime() < RESOLVED_VISIBLE_MS;
    });

    const handleSetStatus = async (id: number, status: string) => {
        setBusyId(id);
        try {
            await updateIncidentStatus(id, status, jwtToken);
        } catch (err) {
            void alert({ title: 'Could not update the incident', body: (err as Error).message || 'Failed to update incident status.', tone: 'danger' });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-panel border border-line/10 p-3 rounded-md space-y-2">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
                <ClipboardList size={12} strokeWidth={2.5} />
                Driver incident reports ({visibleReports.length})
            </h3>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {visibleReports.length === 0 ? (
                    <div className="text-[11px] text-steel italic p-3 text-center bg-ink/40 rounded-lg border border-line/10">
                        No incident reports submitted by drivers.
                    </div>
                ) : (
                    visibleReports.map((incident) => {
                        const [title, ...rest] = String(incident.description || '').split('\n\n');
                        const status = incident.status || 'OPEN';
                        const meta = STATUS_META[status] || STATUS_META.OPEN;
                        const isUrgent = isUrgentIncident(incident);
                        return (
                            <div
                                key={incident.id}
                                className={`relative overflow-hidden rounded-lg border p-3 space-y-2 ${
                                    isUrgent ? 'border-rust/40 bg-rust/[0.04]' : 'border-line/10 bg-ink/40'
                                }`}
                            >
                                {isUrgent && <div className="absolute inset-y-0 left-0 w-[3px] bg-rust" />}

                                <div className="flex items-start justify-between gap-3">
                                    <span className="font-bold text-paper text-[12px] truncate">{resolveDriverName(incident.driver_name || '')}</span>
                                    <span className="font-mono text-[9px] text-steel shrink-0 pt-0.5">
                                        {incident.created_at ? new Date(incident.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                                    </span>
                                </div>

                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-paper font-semibold text-[12px] leading-snug">{title}</div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {isUrgent && (
                                            <span className="flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 text-rust bg-rust/15">
                                                <AlertTriangle size={8} strokeWidth={3} />
                                                Urgent
                                            </span>
                                        )}
                                        <span className={`text-[8px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 whitespace-nowrap ${meta.className}`}>
                                            {meta.label}
                                        </span>
                                    </div>
                                </div>

                                {incident.orderCargoDescription && stagePhrase(incident.orderStatus) && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-carbon bg-carbon/10 rounded-md px-2 py-1">
                                        <Package size={10} strokeWidth={2.5} className="shrink-0" />
                                        {stagePhrase(incident.orderStatus)}: {incident.orderCargoDescription}
                                    </div>
                                )}

                                {rest.length > 0 && <p className="text-steel text-[11px] leading-relaxed">{rest.join('\n\n')}</p>}

                                {incident.aiAnalysis?.suspectedInjury && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-rust bg-rust/10 rounded-md px-2 py-1.5">
                                        <Sparkles size={10} strokeWidth={2.5} className="shrink-0" />
                                        AI: possible injury mentioned — verify driver welfare
                                    </div>
                                )}

                                <div className="flex items-center gap-2 pt-2 mt-1 border-t border-line/10">
                                    {incident.photo_url && (
                                        <button type="button" onClick={() => setViewingImage(incident.photo_url as string)} className="shrink-0" title="View attached photo">
                                            <img
                                                src={incident.photo_url}
                                                alt=""
                                                className="w-9 h-9 rounded-md object-cover border border-line/15 hover:border-tarp/60 transition-colors"
                                            />
                                        </button>
                                    )}
                                    {status !== 'RESOLVED' && (
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            {status === 'OPEN' && (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleSetStatus(incident.id, 'ACKNOWLEDGED')}
                                                    disabled={busyId === incident.id}
                                                    className="flex items-center gap-1 bg-panel border border-line/15 text-carbon rounded-full px-2 py-1 text-[9px] font-bold uppercase disabled:opacity-50"
                                                >
                                                    <Eye size={9} strokeWidth={2.5} />
                                                    Acknowledge
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => void handleSetStatus(incident.id, 'RESOLVED')}
                                                disabled={busyId === incident.id}
                                                className="flex items-center gap-1 bg-tarp/15 border border-tarp/40 text-tarp rounded-full px-2 py-1 text-[9px] font-bold uppercase disabled:opacity-50"
                                            >
                                                <CheckCheck size={9} strokeWidth={2.5} />
                                                Resolve
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
