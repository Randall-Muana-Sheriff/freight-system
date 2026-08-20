import { useEffect, useState } from 'react';
import { trackShipment, type TrackedShipment } from './publicApi';
import { RouteLoader } from '../components/RouteLoader';
import { useLanguage, useApiError } from './i18n';

// Tracking is the road, not the paperwork, so it runs on the dark ground —
// and it is the one page where signal amber earns its keep, marking the
// leg that is actually happening right now.

// Status key plus the dictionary keys for its label and note, so the four
// milestones translate with everything else rather than being the one
// English column left on a French page.
const MILESTONES = [
    { key: 'PENDING', label: 'received', note: 'receivedNote' },
    { key: 'ASSIGNED', label: 'assigned', note: 'assignedNote' },
    { key: 'PICKED_UP', label: 'collected', note: 'collectedNote' },
    { key: 'DELIVERED', label: 'delivered', note: 'deliveredNote' },
] as const;

// Seven backend statuses folded into the four a customer cares about.
// ARRIVED reads the same as IN_TRANSIT from outside the cab.
const REACHED_BY: Record<string, number> = {
    PENDING: 0, ASSIGNED: 1, PICKED_UP: 2, IN_TRANSIT: 2, ARRIVED: 2, DELIVERED: 3,
};

function formatTime(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function TrackPage({ initialCode, onNavigate }: { initialCode: string; onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    const describeError = useApiError();
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
            setError(describeError(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (initialCode) lookup(initialCode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialCode]);

    const reached = shipment ? (REACHED_BY[shipment.status] ?? 0) : -1;
    const cancelled = shipment?.status === 'CANCELLED';
    const delivered = shipment?.status === 'DELIVERED';

    return (
        <div className="min-h-[70vh] bg-pub-ink px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl">
                <p className="data-label text-pub-laterite-soft">{t.track.eyebrow}</p>
                <h1 className="display-wide mt-5 text-[clamp(2.2rem,5vw,3.2rem)] text-pub-onink">
                    {t.track.title}
                </h1>

                <form onSubmit={(e) => { e.preventDefault(); lookup(code); }}
                    className="mt-9 flex items-center border-b border-pub-onink/25 focus-within:border-pub-onink">
                    <label htmlFor="track-code" className="sr-only">{t.track.codeLabel}</label>
                    <input id="track-code" value={code} onChange={(e) => setCode(e.target.value)}
                        placeholder={t.misc.codePlaceholder}
                        className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-lg uppercase tracking-wider text-pub-onink placeholder:text-pub-onink-soft/50 focus:outline-none" />
                    <button type="submit" disabled={loading}
                        className="focus-ring shrink-0 px-3 py-3.5 text-sm font-semibold text-pub-onink hover:text-pub-signal disabled:opacity-50">
                        {loading ? t.actions.looking : `${t.actions.trackSubmit} →`}
                    </button>
                </form>

                {/* The wait after asking "where is it?". Previously the
                    results area stayed empty and only the button changed to
                    "Looking…", so on a slow connection the page looked like
                    it had ignored the question. The route motion answers in
                    the same terms the page just asked in. */}
                {loading && !shipment && !error ? (
                    <RouteLoader tone="public-ink" fullScreen={false} label={t.track.finding} />
                ) : null}

                {error ? (
                    <div role="alert" className="mt-10 border-l-2 border-pub-laterite pl-5">
                        <p className="text-[15px] text-pub-onink">{error}</p>
                        <button onClick={() => onNavigate('/order')}
                            className="focus-ring data-label mt-3 text-pub-laterite-soft hover:text-pub-onink">
                            {t.actions.bookInstead}
                        </button>
                    </div>
                ) : null}

                {shipment ? (
                    <div className="mt-12">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-pub-onink/15 pb-6">
                            <h2 className="display-tight text-2xl text-pub-onink">{shipment.cargo}</h2>
                            <span className={`data-label ${cancelled ? 'text-pub-laterite-soft' : delivered ? 'text-pub-onink-soft' : 'text-pub-signal'}`}>
                                {cancelled ? t.track.statusCancelled : delivered ? t.track.statusDelivered : t.track.statusInProgress}
                            </span>
                        </div>

                        <dl className="grid gap-x-8 gap-y-5 py-7 sm:grid-cols-2">
                            <div>
                                <dt className="data-label text-pub-onink-soft">{t.track.collectFrom}</dt>
                                <dd className="mt-1.5 text-[15px] text-pub-onink">{shipment.pickup || 'Being confirmed'}</dd>
                            </div>
                            <div>
                                <dt className="data-label text-pub-onink-soft">{t.track.deliverTo}</dt>
                                <dd className="mt-1.5 text-[15px] text-pub-onink">{shipment.delivery || 'Being confirmed'}</dd>
                            </div>
                            {shipment.driverFirstName ? (
                                <div>
                                    <dt className="data-label text-pub-onink-soft">{t.track.driver}</dt>
                                    <dd className="mt-1.5 text-[15px] text-pub-onink">{shipment.driverFirstName}</dd>
                                </div>
                            ) : null}
                            <div>
                                <dt className="data-label text-pub-onink-soft">{t.misc.reference}</dt>
                                <dd className="mt-1.5 font-mono text-[15px] tracking-wider text-pub-onink">{shipment.trackingToken}</dd>
                            </div>
                        </dl>

                        {cancelled ? (
                            <p className="border-t border-pub-onink/15 pt-7 text-[15px] text-pub-onink-soft">
                                {t.trackExtra.cancelledNote}
                            </p>
                        ) : (
                            <ol className="relative border-t border-pub-onink/15 pt-8">
                                <span aria-hidden="true" className="absolute bottom-6 left-[5px] top-11 w-px bg-pub-onink/15" />
                                {MILESTONES.map((milestone, index) => {
                                    const done = index <= reached;
                                    const current = index === reached && !delivered;
                                    const entry = shipment.timeline.find((t) => t.status === milestone.key);
                                    const at = index === 0 ? formatTime(shipment.placedAt) : formatTime(entry?.at);
                                    return (
                                        <li key={milestone.key} className="relative flex gap-6 pb-9 last:pb-0">
                                            <span aria-hidden="true"
                                                className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${
                                                    current ? 'bg-pub-signal' : done ? 'bg-pub-onink' : 'border border-pub-onink/30 bg-pub-ink'
                                                }`} />
                                            <div className={done ? '' : 'opacity-40'}>
                                                <p className={`text-[15px] font-semibold ${current ? 'text-pub-signal' : 'text-pub-onink'}`}>
                                                    {t.track.milestones[milestone.label]}
                                                </p>
                                                <p className="mt-0.5 text-sm text-pub-onink-soft">{t.track.milestones[milestone.note]}</p>
                                                <p className="data-label mt-1.5 text-pub-onink-soft/70">{done ? (at || '—') : t.track.notYet}</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}

                        {/* The milestone above has always promised "Signed
                            for, with photo proof". The photo existed the
                            whole time — the driver takes one at every
                            handover — but only dispatch could see it, so the
                            page was making a promise it never kept. */}
                        {shipment.proofOfDelivery ? (
                            <div className="mt-12 border-t border-pub-onink/15 pt-8">
                                <p className="data-label text-pub-onink-soft">{t.track.proofTitle}</p>
                                {shipment.proofOfDelivery.photoUrl ? (
                                    <a href={shipment.proofOfDelivery.photoUrl}
                                        target="_blank" rel="noopener noreferrer"
                                        className="focus-ring mt-4 block overflow-hidden rounded-sm border border-pub-onink/15">
                                        <img
                                            src={shipment.proofOfDelivery.photoUrl}
                                            alt={`Photograph taken at handover of ${shipment.cargo}`}
                                            loading="lazy"
                                            className="max-h-[26rem] w-full bg-pub-ink2 object-contain"
                                        />
                                    </a>
                                ) : null}
                                <p className="mt-4 text-[15px] leading-relaxed text-pub-onink-soft">
                                    {t.trackExtra.photographedAt}
                                    {shipment.proofOfDelivery.confirmedAt
                                        ? ` ${t.trackExtra.onDate} ${formatTime(shipment.proofOfDelivery.confirmedAt)}`
                                        : ''}
                                    {shipment.driverFirstName ? ` ${t.trackExtra.byDriver} ${shipment.driverFirstName}` : ''}.
                                </p>
                                {shipment.proofOfDelivery.notes ? (
                                    <p className="mt-3 border-l-2 border-pub-onink/25 pl-4 text-[15px] leading-relaxed text-pub-onink">
                                        “{shipment.proofOfDelivery.notes}”
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
