// src/components/ExceptionsHome.tsx — the Monitor workspace's home.
//
// A control tower's home screen is a list of things that deviate, not a
// display of everything that exists. This reads the eight exception sources
// the backend already computed and nothing previously surfaced.
//
// Two ranks, not eight. `act` means somebody has to do something now; `watch`
// is degrading but not yet blocking. If everything is an exception, nothing
// is — which is exactly what a wall of equally-weighted panels teaches you.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, MapPin } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { fetchExceptions, type ExceptionGroup, type ExceptionReport } from '../utils/api';

// Sixty-one percent of the queue is unplaced. A deviation covering three
// fifths of the data is not a deviation, it is the normal state — and leading
// with it teaches a dispatcher to scroll past the top of this screen every
// time, which is how the two deliveries that arrived and were never closed get
// missed. It gets one line and a way in, not a ranked card.
const BACKLOG_KEY = 'unplaced_orders';

function sinceLabel(iso?: string | null) {
    if (!iso) return null;
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}

function Group({ group }: { group: ExceptionGroup }) {
    const act = group.severity === 'act';
    const rest = group.count - group.items.length;
    return (
        <section className={`rounded-md border p-4 ${act ? 'border-rust/40 bg-rust/5' : 'border-line/10 bg-panel'}`}>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 className="display-tight text-body text-paper">{group.label}</h3>
                <span className={`ops-figure text-lead ${act ? 'text-rust' : 'text-paper'}`}>{group.count}</span>
            </div>
            <ul>
                {group.items.map((item) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-3 border-t border-line/10 py-2 first:border-t-0">
                        <div className="min-w-0">
                            <p className="truncate text-data text-paper">{item.title}</p>
                            {item.subtitle ? (
                                <p className="truncate text-micro font-mono text-steel">{item.subtitle}</p>
                            ) : null}
                        </div>
                        {/* How long it has been wrong is the actionable fact;
                            a timestamp is not. */}
                        {sinceLabel(item.since) ? (
                            <span className="shrink-0 font-mono text-micro text-steel" title={new Date(item.since as string).toLocaleString()}>
                                {sinceLabel(item.since)}
                            </span>
                        ) : null}
                    </li>
                ))}
            </ul>
            {rest > 0 ? (
                <p className="mt-2 text-micro text-steel">+{rest} more, worst first</p>
            ) : null}
        </section>
    );
}

export default function ExceptionsHome({ onGoToDispatch }: { onGoToDispatch: () => void }) {
    const { jwtToken, userRole } = useSocket();
    const [report, setReport] = useState<ExceptionReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setReport(await fetchExceptions(jwtToken));
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole !== 'admin' && userRole !== 'dispatcher') return;
        void load();
        const id = setInterval(() => void load(), 60_000);
        return () => clearInterval(id);
    }, [load, userRole]);

    if (userRole !== 'admin' && userRole !== 'dispatcher') return null;

    const groups = report?.groups || [];
    const backlog = groups.find((g) => g.key === BACKLOG_KEY);
    const act = groups.filter((g) => g.severity === 'act' && g.key !== BACKLOG_KEY);
    const watch = groups.filter((g) => g.severity === 'watch' && g.key !== BACKLOG_KEY);
    const nothingWrong = !loading && !error && act.length === 0 && watch.length === 0;

    return (
        <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="flex items-baseline justify-between gap-4">
                    <div>
                        <h2 className="display-tight text-lead text-paper">What needs a human</h2>
                        <p className="mt-1 text-data text-steel">
                            Everything the system can see going wrong, worst first.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        title="Check again"
                        className="focus-ring shrink-0 rounded p-1.5 text-steel transition-colors hover:text-paper disabled:opacity-50"
                    >
                        <RefreshCw size={15} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {error ? (
                    <p className="rounded border border-rust/30 bg-rust/10 p-3 font-mono text-data text-rust">{error}</p>
                ) : null}

                {/* The backlog line. Deliberately not a ranked card: it is the
                    standing state of the queue, and what it needs is a way in,
                    not a warning. */}
                {backlog && backlog.count > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line/10 bg-panel px-4 py-3">
                        <p className="text-data text-paper">
                            <span className="ops-figure mr-2 text-lead text-paper">{backlog.count}</span>
                            bookings still need placing on the map before anyone can carry them
                        </p>
                        <button
                            type="button"
                            onClick={onGoToDispatch}
                            className="focus-ring flex shrink-0 items-center gap-1.5 rounded border border-route/40 bg-route/15 px-3 py-1.5 text-micro font-semibold uppercase tracking-wide text-route transition-colors hover:bg-route/25"
                        >
                            <MapPin size={13} strokeWidth={2.5} />
                            Place them
                        </button>
                    </div>
                ) : null}

                {act.length > 0 ? (
                    <div className="space-y-3">
                        <h3 className="data-label text-rust">Needs someone now</h3>
                        {act.map((g) => <Group key={g.key} group={g} />)}
                    </div>
                ) : null}

                {watch.length > 0 ? (
                    <div className="space-y-3">
                        <h3 className="data-label text-steel">Worth watching</h3>
                        {watch.map((g) => <Group key={g.key} group={g} />)}
                    </div>
                ) : null}

                {/* An empty control tower is the good outcome and should read
                    as one, rather than as a screen that failed to load. */}
                {nothingWrong ? (
                    <p className="rounded-md border border-line/10 bg-panel px-4 py-6 text-center text-data text-steel">
                        Nothing is going wrong that the system can see.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
