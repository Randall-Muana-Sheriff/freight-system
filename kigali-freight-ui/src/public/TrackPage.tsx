import { useEffect, useState } from 'react';
import { trackShipment, type TrackedShipment } from './publicApi';

// The four milestones a customer cares about, mapped from the seven
// statuses the backend actually uses — ARRIVED is folded into "In transit"
// because from outside the cab there is no meaningful difference between
// nearly there and there.
const MILESTONES = [
    { key: 'PENDING', label: 'Order received' },
    { key: 'ASSIGNED', label: 'Driver assigned' },
    { key: 'PICKED_UP', label: 'Cargo picked up' },
    { key: 'DELIVERED', label: 'Delivered & confirmed' },
];

const REACHED_BY: Record<string, number> = {
    PENDING: 0, ASSIGNED: 1, PICKED_UP: 2, IN_TRANSIT: 2, ARRIVED: 2, DELIVERED: 3,
};

function statusLabel(status: string) {
    if (status === 'CANCELLED') return 'Cancelled';
    return status.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatTime(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TrackPage({ initialCode, onNavigate }: { initialCode: string; onNavigate: (path: string) => void }) {
    const [code, setCode] = useState(initialCode);
    const [shipment, setShipment] = useState<TrackedShipment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const lookup = async (value: string) => {
        if (!value.trim()) return;
        setLoading(true);
        setError(null);
        setShipment(null);
        try {
            setShipment(await trackShipment(value));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not look that up.');
        } finally {
            setLoading(false);
        }
    };

    // Arriving from the hero widget or the confirmation screen already
    // carries the code, so don't make them type it twice.
    useEffect(() => {
        if (initialCode) lookup(initialCode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCode]);

    const reached = shipment ? (REACHED_BY[shipment.status] ?? 0) : -1;
    const cancelled = shipment?.status === 'CANCELLED';

    return (
        <div className="mx-auto max-w-2xl px-5 py-14">
            <h1 className="font-display text-4xl font-black tracking-tight text-brand-text">Track shipment</h1>
            <p className="mt-2 font-body text-sm text-brand-muted">Enter the code from your confirmation SMS.</p>

            <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="mt-8 flex gap-2">
                <label htmlFor="track-code" className="sr-only">Tracking code</label>
                <input id="track-code" value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="INZ-XXXXXXXX"
                    className="min-w-0 flex-1 rounded-xl border border-brand-line bg-brand-surface2 px-4 py-3 font-mono text-sm uppercase text-brand-text placeholder:text-brand-muted/60 focus:border-brand-jade focus:outline-none" />
                <button type="submit" disabled={loading}
                    className="rounded-xl bg-brand-jade px-7 font-body font-bold text-brand-ink hover:bg-brand-jade-deep disabled:opacity-60">
                    {loading ? '…' : 'Track'}
                </button>
            </form>

            {error ? (
                <div role="alert" className="mt-8 rounded-2xl border border-brand-line bg-brand-surface2 p-7 text-center">
                    <p className="font-body text-sm text-brand-text">{error}</p>
                    <button onClick={() => onNavigate('/order')} className="mt-4 font-body text-sm font-bold text-brand-jade hover:underline">
                        Place a new order instead
                    </button>
                </div>
            ) : null}

            {shipment ? (
                <>
                    <section className="mt-8 rounded-2xl border border-brand-line bg-brand-surface2 p-6 sm:p-7">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-mono text-xs tracking-wider text-brand-muted">{shipment.trackingToken}</p>
                                <h2 className="mt-1.5 font-display text-2xl font-black tracking-tight text-brand-text">{shipment.cargo}</h2>
                            </div>
                            <span className={`shrink-0 rounded-full border px-3 py-1 font-body text-xs font-bold uppercase tracking-wider ${
                                cancelled ? 'border-red-500/40 text-red-400' : 'border-brand-jade/40 text-brand-jade'
                            }`}>
                                {statusLabel(shipment.status)}
                            </span>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-brand-line bg-brand-ink p-4">
                                <p className="font-body text-xs font-bold uppercase tracking-widest text-brand-muted">From</p>
                                <p className="mt-1 font-body text-sm text-brand-text">{shipment.pickup || 'To be confirmed'}</p>
                            </div>
                            <div className="rounded-xl border border-brand-line bg-brand-ink p-4">
                                <p className="font-body text-xs font-bold uppercase tracking-widest text-brand-muted">To</p>
                                <p className="mt-1 font-body text-sm text-brand-text">{shipment.delivery || 'To be confirmed'}</p>
                            </div>
                        </div>

                        {shipment.driverFirstName ? (
                            <p className="mt-4 font-body text-sm text-brand-muted">
                                Driver: <span className="text-brand-text">{shipment.driverFirstName}</span>
                            </p>
                        ) : null}
                    </section>

                    {cancelled ? null : (
                        <section className="mt-4 rounded-2xl border border-brand-line bg-brand-surface2 p-6 sm:p-7">
                            <h3 className="mb-5 font-body text-xs font-bold uppercase tracking-widest text-brand-muted">Timeline</h3>
                            <ol>
                                {MILESTONES.map((milestone, index) => {
                                    const done = index <= reached;
                                    const entry = shipment.timeline.find((t) => t.status === milestone.key);
                                    const at = index === 0 ? formatTime(shipment.placedAt) : formatTime(entry?.at);
                                    return (
                                        <li key={milestone.key} className="flex gap-4">
                                            <div className="flex flex-col items-center">
                                                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                                                    done ? 'bg-brand-jade text-brand-ink' : 'border border-brand-line'
                                                }`}>
                                                    {done ? '✓' : ''}
                                                </span>
                                                {index < MILESTONES.length - 1 ? (
                                                    <span className={`w-px flex-1 ${index < reached ? 'bg-brand-jade' : 'bg-brand-line'}`} />
                                                ) : null}
                                            </div>
                                            <div className={`pb-6 ${done ? '' : 'opacity-45'}`}>
                                                <p className="font-body text-sm font-bold text-brand-text">{milestone.label}</p>
                                                <p className="mt-0.5 font-mono text-xs text-brand-muted">{done ? (at || '—') : 'Pending'}</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    )}
                </>
            ) : null}
        </div>
    );
}
