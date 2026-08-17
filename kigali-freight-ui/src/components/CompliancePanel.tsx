// src/components/CompliancePanel.tsx — documents that have lapsed, or are
// about to.
//
// Expiry without a warning is a trapdoor: a driver who was assignable on
// Tuesday is simply missing from the picker on Wednesday, and the dispatcher
// has no way to find out why from this screen. This panel is the half that
// makes the rule usable in an office — it names the driver or the plate, the
// document, and how long is left, early enough to renew it.
//
// Lives in the "Needs you" band because a certificate three days from lapsing
// is work for a person today, not something to notice later.
import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { fetchComplianceIssues, type ComplianceIssue, type ComplianceReport } from '../utils/api';

const DOCUMENT_LABELS: Record<string, string> = {
    national_id: 'National ID',
    drivers_license: 'Driving licence',
    vehicle_registration: 'Registration',
    insurance_certificate: 'Insurance',
    roadworthiness_certificate: 'Roadworthiness',
};

// "in 3 days" is what a dispatcher needs to decide whether to act now; the
// date itself is secondary and goes in the title attribute.
function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function Row({ issue }: { issue: ComplianceIssue }) {
    const days = daysUntil(issue.expiresAt);
    // Whose problem it is, in the terms the office uses: a plate for a
    // vehicle document, a driver for a personal one.
    const who = issue.holderKind === 'vehicle'
        ? (issue.plateNumber || 'Unassigned vehicle')
        : (issue.holder || 'Unknown driver');

    return (
        <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-line/10 py-2 first:border-t-0">
            <div className="min-w-[9rem] flex-1">
                <p className="text-data text-paper">{DOCUMENT_LABELS[issue.documentType] || issue.documentType}</p>
                <p className="text-micro font-mono text-steel">{who}</p>
            </div>
            <span
                title={new Date(issue.expiresAt).toLocaleString()}
                className={`shrink-0 text-micro font-mono ${issue.expired ? 'text-rust' : 'text-hazard'}`}
            >
                {issue.expired
                    ? (days === 0 ? 'expired today' : `expired ${Math.abs(days)}d ago`)
                    : `${days}d left`}
            </span>
        </li>
    );
}

export default function CompliancePanel() {
    const { jwtToken, userRole } = useSocket();
    const [report, setReport] = useState<ComplianceReport | null>(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setReport(await fetchComplianceIssues(jwtToken));
        } catch {
            /* Leaving the last good report on screen beats replacing a real
               warning with an error box. */
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole !== 'admin' && userRole !== 'dispatcher') return;
        void load();
        // Expiry moves in days, not seconds — this only needs to be fresh
        // enough that a shift-long session does not go stale.
        const id = setInterval(() => void load(), 15 * 60 * 1000);
        return () => clearInterval(id);
    }, [load, userRole]);

    if (userRole !== 'admin' && userRole !== 'dispatcher') return null;

    const expired = report?.expired || [];
    const soon = report?.expiringSoon || [];

    // Nothing lapsing is the normal state and does not need a card of its
    // own competing with real work — the panel disappears entirely.
    if (!report || (expired.length === 0 && soon.length === 0)) return null;

    return (
        <div className={`rounded-md border p-4 ${expired.length ? 'border-rust/40 bg-rust/5' : 'border-line/10 bg-panel'}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                <h3 className="flex min-w-0 items-center gap-2 display-tight text-body text-paper">
                    <ShieldAlert size={15} strokeWidth={2.5} className={expired.length ? 'text-rust' : 'text-steel'} />
                    <span className="truncate">Documents expiring</span>
                </h3>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    title="Check again"
                    className="focus-ring shrink-0 rounded p-1 text-steel transition-colors hover:text-paper disabled:opacity-50"
                >
                    <RefreshCw size={13} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {expired.length > 0 && (
                <>
                    {/* Already lapsed means the driver is out of the picker
                        right now, which is why it is stated as a consequence
                        rather than as a status. */}
                    <p className="data-label mb-1 text-rust">Lapsed — driver cannot be assigned</p>
                    <ul className="mb-3">{expired.map((i) => <Row key={`${i.holderKind}-${i.holder}-${i.documentType}`} issue={i} />)}</ul>
                </>
            )}

            {soon.length > 0 && (
                <>
                    <p className="data-label mb-1 text-steel">Within {report.warningDays} days</p>
                    <ul>{soon.map((i) => <Row key={`${i.holderKind}-${i.holder}-${i.documentType}`} issue={i} />)}</ul>
                </>
            )}
        </div>
    );
}
