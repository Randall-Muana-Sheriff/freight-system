// src/components/DriverDocumentReview.jsx — admin review queue for the 5
// required driver compliance documents. A driver can log in as soon as
// their account is approved, but assignOrderBundle/reassignOrder on the
// backend separately block dispatch until every document here is
// approved — this is where that approval actually happens.
import { useState, useEffect, useCallback } from 'react';
import { FileCheck, Check, X, Eye } from 'lucide-react';
import { fetchDriverDocuments, updateDriverDocumentStatus } from '../utils/api';
import { useSocket } from '../context/SocketContext';

const REQUIRED_TYPES = ['national_id', 'drivers_license', 'vehicle_registration', 'insurance_certificate', 'roadworthiness_certificate'];
const LABELS = {
    national_id: 'National ID',
    drivers_license: "Driver's license",
    vehicle_registration: 'Vehicle registration',
    insurance_certificate: 'Insurance certificate',
    roadworthiness_certificate: 'Roadworthiness cert.',
};

const STATUS_STYLE = {
    approved: 'bg-tarp/15 text-tarp',
    rejected: 'bg-rust/15 text-rust',
    pending: 'bg-hazard/15 text-hazard',
    not_submitted: 'bg-panel-soft text-steel',
};

function groupByDriver(rows) {
    const byDriver = {};
    for (const row of rows) {
        if (!byDriver[row.username]) byDriver[row.username] = {};
        byDriver[row.username][row.documentType] = row;
    }
    return byDriver;
}

export default function DriverDocumentReview() {
    const { jwtToken, userRole, setViewingImage, resolveDriverName } = useSocket();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [decidingId, setDecidingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await fetchDriverDocuments(jwtToken));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin') {
            setTimeout(() => { load(); }, 0);
        }
    }, [userRole, load]);

    const handleDecision = async (id, status) => {
        const rejectionReason = status === 'rejected' ? window.prompt('Reason for rejecting this document (shown to the driver):') : undefined;
        if (status === 'rejected' && rejectionReason === null) return; // cancelled the prompt

        setError(null);
        setDecidingId(id);
        try {
            await updateDriverDocumentStatus(id, status, rejectionReason, jwtToken);
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setDecidingId(null);
        }
    };

    if (userRole !== 'admin') {
        return null;
    }

    const byDriver = groupByDriver(rows);
    const drivers = Object.keys(byDriver).sort();
    const pendingCount = rows.filter((r) => r.status === 'pending').length;

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <FileCheck size={15} strokeWidth={2.5} className="text-steel" />
                    <h2 className="text-sm font-bold tracking-tight text-paper font-sans">Driver document verification</h2>
                </div>
                {pendingCount > 0 && (
                    <span className="bg-hazard/15 text-hazard rounded-full px-2 py-0.5 text-[10px] font-bold font-mono">{pendingCount} pending review</span>
                )}
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded text-[11px] font-mono mb-3">{error}</div>
            )}

            {drivers.length === 0 && !loading ? (
                <div className="bg-panel border border-line/10 rounded-md p-4 text-steel text-[11px] font-mono text-center">
                    No driver documents submitted yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {drivers.map((username) => (
                        <div key={username} className="bg-panel border border-line/10 rounded-md p-4 space-y-2">
                            <div className="text-paper font-bold text-sm font-sans mb-1">{resolveDriverName(username)}</div>
                            {REQUIRED_TYPES.map((type) => {
                                const doc = byDriver[username][type];
                                const status = doc?.status || 'not_submitted';
                                return (
                                    <div key={type} className="flex items-center justify-between gap-2 bg-ink/60 rounded border border-line/10 px-2.5 py-2 text-[11px] font-mono">
                                        <div className="min-w-0">
                                            <div className="text-paper truncate">{LABELS[type]}</div>
                                            {status === 'rejected' && doc?.rejectionReason ? (
                                                <div className="text-[9px] text-rust mt-0.5 truncate">Reason: {doc.rejectionReason}</div>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${STATUS_STYLE[status]}`}>
                                                {status.replace('_', ' ')}
                                            </span>
                                            {doc?.fileUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingImage(doc.fileUrl)}
                                                    className="text-carbon hover:text-paper"
                                                    title="View file"
                                                >
                                                    <Eye size={12} strokeWidth={2.5} />
                                                </button>
                                            )}
                                            {status === 'pending' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={decidingId === doc.id}
                                                        onClick={() => handleDecision(doc.id, 'approved')}
                                                        className="bg-tarp/15 hover:bg-tarp/25 text-tarp rounded p-1 disabled:opacity-50"
                                                        title="Approve"
                                                    >
                                                        <Check size={11} strokeWidth={3} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={decidingId === doc.id}
                                                        onClick={() => handleDecision(doc.id, 'rejected')}
                                                        className="bg-rust/15 hover:bg-rust/25 text-rust rounded p-1 disabled:opacity-50"
                                                        title="Reject"
                                                    >
                                                        <X size={11} strokeWidth={3} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
