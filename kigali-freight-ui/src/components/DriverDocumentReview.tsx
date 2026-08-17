// src/components/DriverDocumentReview.tsx — admin review queue for the 5
// required driver compliance documents. A driver can log in as soon as
// their account is approved, but assignOrderBundle/reassignOrder on the
// backend separately block dispatch until every document here is
// approved — this is where that approval actually happens.
import { useState, useEffect, useCallback } from 'react';
import { FileCheck, Check, X, Eye, RotateCcw, Sparkles, ShieldCheck } from 'lucide-react';
import { fetchDriverDocuments, updateDriverDocumentStatus } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useDialog } from './DialogProvider';

type DocumentType = 'national_id' | 'drivers_license' | 'vehicle_registration' | 'insurance_certificate' | 'roadworthiness_certificate';
type DocumentStatus = 'approved' | 'rejected' | 'pending' | 'not_submitted';

// The three that always carry a date in Rwanda. A national ID and a
// registration document may not, so their expiry stays optional rather than
// forcing a reviewer to invent one.
const EXPIRY_REQUIRED = ['drivers_license', 'insurance_certificate', 'roadworthiness_certificate'];

// Purely an admin-facing triage aid — see documentAnalysisService.js.
// Never changes what buttons render or what status means; an admin's own
// Approve/Reject/Revoke click is still the only thing that actually
// decides anything here.
interface DocumentAiAnalysis {
    documentTypeMatches: boolean;
    extractedName: string;
    nameMatchesAccount: boolean;
    expiryDate: string;
    isExpired: boolean;
    legible: boolean;
    summary: string;
    confidence: 'high' | 'medium' | 'low';
}

interface DriverDocument {
    id: number;
    username: string;
    documentType: DocumentType;
    status: DocumentStatus;
    rejectionReason?: string;
    fileUrl?: string;
    aiAnalysis?: DocumentAiAnalysis | null;
    // Which table this row came from — the two have independent id
    // sequences, so the review PATCH has to say which one it means.
    holderKind?: 'driver' | 'vehicle';
    expiresAt?: string | null;
    plateNumber?: string | null;
}

// Short, unambiguous verdict tags computed straight from the model's
// boolean fields — deliberately NOT restated as prose here. `summary`
// below is the model's own natural-language write-up of the same
// findings, in complete sentences instead of fragments; tags give the
// one-glance scan, summary gives the detail — two tiers, not one list
// repeating the same finding in different words.
function aiVerdictTags(analysis: DocumentAiAnalysis): string[] {
    const tags: string[] = [];
    if (!analysis.documentTypeMatches) tags.push('Wrong document type');
    if (analysis.isExpired) tags.push(analysis.expiryDate ? `Expired ${analysis.expiryDate}` : 'Expired');
    if (analysis.extractedName && !analysis.nameMatchesAccount) tags.push('Name mismatch');
    if (!analysis.legible) tags.push('Illegible');
    return tags;
}

function aiHasIssues(analysis: DocumentAiAnalysis): boolean {
    return aiVerdictTags(analysis).length > 0;
}

const REQUIRED_TYPES: DocumentType[] = ['national_id', 'drivers_license', 'vehicle_registration', 'insurance_certificate', 'roadworthiness_certificate'];
const LABELS: Record<DocumentType, string> = {
    national_id: 'National ID',
    drivers_license: "Driver's license",
    vehicle_registration: 'Vehicle registration',
    insurance_certificate: 'Insurance certificate',
    roadworthiness_certificate: 'Roadworthiness cert.',
};

const STATUS_STYLE: Record<DocumentStatus, string> = {
    approved: 'bg-tarp/15 text-tarp',
    rejected: 'bg-rust/15 text-rust',
    pending: 'bg-hazard/15 text-hazard',
    not_submitted: 'bg-panel-soft text-steel',
};

function groupByDriver(rows: DriverDocument[]): Record<string, Partial<Record<DocumentType, DriverDocument>>> {
    const byDriver: Record<string, Partial<Record<DocumentType, DriverDocument>>> = {};
    for (const row of rows) {
        if (!byDriver[row.username]) byDriver[row.username] = {};
        byDriver[row.username][row.documentType] = row;
    }
    return byDriver;
}

export default function DriverDocumentReview() {
    const { confirm, prompt } = useDialog();
    const { jwtToken, userRole, setViewingImage, resolveDriverName } = useSocket();
    const [rows, setRows] = useState<DriverDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [decidingId, setDecidingId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(await fetchDriverDocuments(jwtToken) as DriverDocument[]);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin') {
            setTimeout(() => { void load(); }, 0);
        }
    }, [userRole, load]);

    const handleDecision = async (
        id: number,
        status: 'approved' | 'rejected',
        documentType?: string,
        holderKind?: 'driver' | 'vehicle'
    ) => {
        const rejectionReason = status === 'rejected'
            ? await prompt({
                title: 'Why is this being rejected?',
                body: 'The driver sees this, so say what they need to fix.',
                placeholder: 'e.g. Photo is blurred — the expiry date is unreadable',
                confirmLabel: 'Reject',
                tone: 'danger',
                required: true,
            })
            : undefined;
        if (status === 'rejected' && rejectionReason === null) return; // cancelled

        // Asked at approval because this is the only point in the process
        // where a person is actually holding the certificate. Required for
        // the three that always carry a date — approving an insurance
        // certificate without one re-creates exactly the hole this closes.
        let expiresAt: string | null = null;
        if (status === 'approved') {
            const needsExpiry = EXPIRY_REQUIRED.includes(documentType || '');
            const answer = await prompt({
                title: 'When does this document expire?',
                body: needsExpiry
                    ? 'Read it off the document. The driver stops being assignable on this date, and dispatch is warned three weeks before.'
                    : 'Optional for this document. Leave blank if it does not carry an expiry date.',
                placeholder: 'YYYY-MM-DD',
                confirmLabel: 'Approve',
                required: needsExpiry,
            });
            if (answer === null) return; // cancelled
            expiresAt = answer.trim() ? new Date(`${answer.trim()}T23:59:59`).toISOString() : null;
        }

        setError(null);
        setDecidingId(id);
        try {
            await updateDriverDocumentStatus(id, status, rejectionReason ?? null, jwtToken, { holderKind, expiresAt });
            void load();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDecidingId(null);
        }
    };

    // Separate from handleDecision above (rather than just also allowing
    // 'rejected' from the pending buttons) because the stakes are
    // different: a pending document has never granted anything yet, but
    // revoking an approved one actively pulls this driver back out of
    // "verified" — assignOrderBundle/reassignOrder recompute that live off
    // every document's current status, so the effect is immediate. The
    // confirmation step exists specifically so that's a deliberate choice,
    // not a misclick.
    const handleRevoke = async (id: number, driverLabel: string, docLabel: string) => {
        const confirmed = await confirm({
            title: 'Revoke this approval?',
            body: `${docLabel} for ${driverLabel} is already approved. Revoking it will mark them unverified again until they resubmit and it's re-approved. Continue?`,
            confirmLabel: 'Revoke',
            tone: 'danger',
        });
        if (!confirmed) return;

        const rejectionReason = await prompt({
            title: 'Why is this approval being revoked?',
            body: 'The driver sees this, so say what they need to fix.',
            placeholder: 'e.g. Insurance certificate has expired',
            confirmLabel: 'Revoke',
            tone: 'danger',
            required: true,
        });
        if (rejectionReason === null) return; // cancelled

        setError(null);
        setDecidingId(id);
        try {
            await updateDriverDocumentStatus(id, 'rejected', rejectionReason, jwtToken);
            void load();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setDecidingId(null);
        }
    };

    // The one-click payoff of the whole feature: the AI already wrote the
    // exact reason ("name mismatch...", "wrong document type...") — an
    // admin agreeing with it shouldn't have to retype what's already on
    // screen into a free-text box. Still one explicit confirm, since
    // rejecting is still a real decision the AI doesn't get to make alone.
    const handleRejectWithAiReason = async (id: number, reason: string) => {
        if (!(await confirm({
            title: "Reject using the AI's finding as the reason?",
            body: reason,
            confirmLabel: 'Reject',
            tone: 'danger',
        }))) return;
        setError(null);
        setDecidingId(id);
        try {
            await updateDriverDocumentStatus(id, 'rejected', reason, jwtToken);
            void load();
        } catch (err) {
            setError((err as Error).message);
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
    const flaggedCount = rows.filter((r) => r.status === 'pending' && r.aiAnalysis && aiHasIssues(r.aiAnalysis)).length;

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <FileCheck size={15} strokeWidth={2.5} className="text-steel" />
                    <h2 className="text-body font-bold tracking-tight text-paper font-sans">Driver document verification</h2>
                </div>
                <div className="flex items-center gap-1.5">
                    {flaggedCount > 0 && (
                        <span className="flex items-center gap-1 bg-rust/15 text-rust rounded-full px-2 py-0.5 text-micro font-bold font-mono">
                            <Sparkles size={9} strokeWidth={2.5} />
                            {flaggedCount} AI-flagged
                        </span>
                    )}
                    {pendingCount > 0 && (
                        <span className="bg-hazard/15 text-hazard rounded-full px-2 py-0.5 text-micro font-bold font-mono">{pendingCount} pending review</span>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded text-data font-mono mb-3">{error}</div>
            )}

            {drivers.length === 0 && !loading ? (
                <div className="bg-panel border border-line/10 rounded-md p-4 text-steel text-data font-mono text-center">
                    No driver documents submitted yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {drivers.map((username) => (
                        <div key={username} className="bg-panel border border-line/10 rounded-md p-4 space-y-2">
                            <div className="text-paper font-bold text-body font-sans mb-1">{resolveDriverName(username)}</div>
                            {REQUIRED_TYPES.map((type) => {
                                const doc = byDriver[username][type];
                                const status: DocumentStatus = doc?.status || 'not_submitted';
                                const analysis = status === 'pending' ? doc?.aiAnalysis : null;
                                const tags = analysis ? aiVerdictTags(analysis) : null;
                                const hasIssues = analysis ? aiHasIssues(analysis) : null;
                                // Rail color communicates AI status at a glance, before reading
                                // any text — null (no analysis yet, or AI disabled) stays the
                                // same neutral border every other row already has.
                                const railClass = hasIssues === null ? 'border-line/10' : hasIssues ? 'border-l-rust' : 'border-l-tarp';
                                return (
                                    <div key={type} className={`relative flex items-start justify-between gap-2 bg-ink/60 rounded border ${railClass} ${hasIssues !== null ? 'border-l-[3px]' : ''} px-2.5 py-2 text-data font-mono`}>
                                        <div className="min-w-0">
                                            <div className="text-paper truncate">{LABELS[type]}</div>
                                            {status === 'rejected' && doc?.rejectionReason ? (
                                                <div className="text-micro text-rust mt-0.5">Reason: {doc.rejectionReason}</div>
                                            ) : null}
                                            {analysis && tags !== null && hasIssues !== null ? (
                                                <div className="mt-1 space-y-1">
                                                    {hasIssues ? (
                                                        <>
                                                            {tags.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {tags.map((tag) => (
                                                                        <span key={tag} className="px-1.5 py-0.5 rounded text-micro font-bold uppercase bg-rust/15 text-rust">
                                                                            {tag}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <div className="flex items-start gap-1 text-steel leading-snug">
                                                                <Sparkles size={8} strokeWidth={2.5} className="shrink-0 mt-0.5 text-rust" />
                                                                <span>{analysis.summary}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={decidingId === doc!.id}
                                                                onClick={() => void handleRejectWithAiReason(doc!.id, analysis.summary)}
                                                                className="text-micro text-rust underline decoration-dotted hover:text-hazard disabled:opacity-50"
                                                            >
                                                                Reject with this reason
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-start gap-1 text-tarp leading-snug">
                                                                <ShieldCheck size={9} strokeWidth={2.5} className="shrink-0 mt-0.5" />
                                                                <span>{analysis.summary}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={decidingId === doc!.id}
                                                                onClick={() => void handleDecision(doc!.id, 'approved', doc!.documentType, doc!.holderKind)}
                                                                className="text-micro text-tarp underline decoration-dotted hover:text-paper disabled:opacity-50"
                                                            >
                                                                Approve
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className={`px-1.5 py-0.5 rounded text-micro font-bold uppercase ${STATUS_STYLE[status]}`}>
                                                {status.replace('_', ' ')}
                                            </span>
                                            {doc?.fileUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingImage(doc.fileUrl as string)}
                                                    className="text-carbon hover:text-paper"
                                                    title="View file"
                                                >
                                                    <Eye size={12} strokeWidth={2.5} />
                                                </button>
                                            )}
                                            {status === 'pending' && doc && (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={decidingId === doc.id}
                                                        onClick={() => void handleDecision(doc.id, 'approved', doc.documentType, doc.holderKind)}
                                                        className="bg-tarp/15 hover:bg-tarp/25 text-tarp rounded p-1 disabled:opacity-50"
                                                        title="Approve"
                                                    >
                                                        <Check size={11} strokeWidth={3} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={decidingId === doc.id}
                                                        onClick={() => void handleDecision(doc.id, 'rejected', doc.documentType, doc.holderKind)}
                                                        className="bg-rust/15 hover:bg-rust/25 text-rust rounded p-1 disabled:opacity-50"
                                                        title="Reject"
                                                    >
                                                        <X size={11} strokeWidth={3} />
                                                    </button>
                                                </>
                                            )}
                                            {status === 'approved' && doc && (
                                                <button
                                                    type="button"
                                                    disabled={decidingId === doc.id}
                                                    onClick={() => void handleRevoke(doc.id, resolveDriverName(username), LABELS[type])}
                                                    className="bg-rust/15 hover:bg-rust/25 text-rust rounded p-1 disabled:opacity-50"
                                                    title="Revoke approval — send back for re-verification"
                                                >
                                                    <RotateCcw size={11} strokeWidth={3} />
                                                </button>
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
