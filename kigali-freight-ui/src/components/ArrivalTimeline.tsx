// src/components/ArrivalTimeline.tsx — the next few hours of arrivals, as a
// line rather than a list.
//
// The board could say where every load was and how far it had to go, but not
// when any of it lands, and "when" is the question a dispatcher is actually
// asked on the phone. Reading that off a column of "34 min / 51 min / 8 min"
// means holding six numbers in your head and sorting them yourself; on an
// axis the same six numbers are a shape you take in at a glance — where the
// gaps are, where three trucks land inside ten minutes of each other.
//
// Fed by the same live fleet report as LiveFleetStatusPanel, which already
// carries estimatedMinutesArrival per order, so this adds a reading of the
// data rather than a new source of truth.
import { useCallback, useEffect, useState } from 'react';
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

// The window grows in half-hour steps to fit the furthest load, so a quiet
// afternoon is not drawn as three hours of empty axis, and stops at three
// hours because anything beyond that is planning rather than dispatching.
const STEP_MINUTES = 30;
const MAX_WINDOW = 180;

// Roughly the width of one truncated label as a share of the band. Held as a
// percentage rather than measured because the band is always the full centre
// column and the labels are capped at 5rem; if either changes materially this
// is the number to revisit.
const LABEL_GAP_PCT = 11;

function windowFor(rows: FleetReportRow[]) {
    const furthest = rows.reduce((max, r) => Math.max(max, r.estimatedMinutesArrival || 0), 0);
    return Math.min(MAX_WINDOW, Math.max(STEP_MINUTES * 2, Math.ceil(furthest / STEP_MINUTES) * STEP_MINUTES));
}

// Clock time, not "in 34 minutes" — a dispatcher relaying this to a customer
// says "about twenty past four", and doing that arithmetic in your head all
// day is exactly the kind of small tax an instrument should absorb.
function clockAt(minutesFromNow: number) {
    const t = new Date(Date.now() + minutesFromNow * 60_000);
    return t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function ArrivalTimeline() {
    const { jwtToken, userRole, resolveDriverName } = useSocket();
    const [report, setReport] = useState<FleetStatusReport | null>(null);

    const load = useCallback(async () => {
        try {
            setReport(await fetchLiveFleetStatus(jwtToken) as FleetStatusReport);
        } catch {
            /* The panel below surfaces the error; a band that silently keeps
               its last good state is better here than one that shouts. */
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole !== 'admin' && userRole !== 'dispatcher') return;
        void load();
        const id = setInterval(() => void load(), 60_000);
        return () => clearInterval(id);
    }, [load, userRole]);

    if (userRole !== 'admin' && userRole !== 'dispatcher') return null;

    const rows = (report?.fleetReport || []).filter((r) => typeof r.estimatedMinutesArrival === 'number');
    const span = windowFor(rows);
    const ticks = Array.from({ length: span / STEP_MINUTES + 1 }, (_, i) => i * STEP_MINUTES);

    // Two loads landing minutes apart put their labels on top of each other —
    // with real data "111 bags of cement" and "TVs and fridges" overprinted
    // into an unreadable smudge, which is worse than one of them being
    // unlabelled. Walking left to right and dropping any label that would
    // collide keeps the earliest of a cluster legible; every marker still
    // carries its full detail on hover, and the dots themselves are the point
    // — a cluster is meant to *look* like a cluster.
    const placed = rows
        .map((row) => ({ row, mins: Math.max(0, Math.min(span, row.estimatedMinutesArrival)) }))
        .sort((a, b) => a.mins - b.mins)
        .map((entry, i, all) => {
            const pct = (entry.mins / span) * 100;
            let lastLabelled = -Infinity;
            for (let j = 0; j < i; j++) {
                const p = (all[j].mins / span) * 100;
                if (p - lastLabelled >= LABEL_GAP_PCT) lastLabelled = p;
            }
            return { ...entry, labelled: pct - lastLabelled >= LABEL_GAP_PCT };
        });

    return (
        <section aria-label="Arrivals over the next few hours"
            className="shrink-0 border-b border-line/10 bg-panel px-5 pb-2 pt-2.5">
            <div className="flex items-baseline justify-between">
                <h2 className="data-label text-steel">Arriving</h2>
                <span className="data-label text-steel">
                    {rows.length ? `next ${span / 60 >= 1 ? `${span / 60}h` : `${span}m`}` : ''}
                </span>
            </div>

            {rows.length === 0 ? (
                /* An empty axis would read as a broken instrument. Say which
                   of the two it is: nothing moving, or nothing trackable. */
                <p className="py-2 text-micro text-steel">
                    No load is currently reporting an ETA. Assign a driver with live telemetry and arrivals appear here.
                </p>
            ) : (
                <div className="relative mt-3 h-11">
                    {/* The axis itself, with a half-hour rule under each tick. */}
                    <div aria-hidden="true" className="absolute inset-x-0 top-3.5 h-px bg-line/15" />
                    {ticks.map((t, i) => {
                        // The first and last ticks sit on the container edges, so
                        // centring them puts half the timestamp outside the band —
                        // the closing one wrapped onto two lines and clipped. They
                        // hang inward instead; only the interior ticks centre.
                        const edge = i === 0 ? 'translate-x-0 text-left'
                            : i === ticks.length - 1 ? '-translate-x-full text-right'
                            : '-translate-x-1/2 text-center';
                        return (
                            <div key={t} aria-hidden="true" className={`absolute top-0 ${edge}`}
                                style={{ left: `${(t / span) * 100}%` }}>
                                <span className={`block h-2 w-px bg-line/20 ${i === ticks.length - 1 ? 'ml-auto' : i === 0 ? '' : 'mx-auto'}`} />
                                <span className="mt-1 block whitespace-nowrap font-mono text-[0.625rem] text-steel">{clockAt(t)}</span>
                            </div>
                        );
                    })}

                    {placed.map(({ row: r, mins, labelled }) => {
                        // Only two states earn colour: a load already past its
                        // estimate, and one whose position is guesswork because
                        // the signal went quiet. A load running to time is the
                        // majority case and gets none — it was green here at
                        // first, which meant most of the axis lit up for "fine"
                        // and the one marker that mattered had to compete with
                        // it. Steel is also the only one of the three that a
                        // red-green colourblind dispatcher can tell from rust:
                        // rust against tarp is 1.3:1 in luminance, so hue alone
                        // was never carrying this distinction.
                        const overdue = r.estimatedMinutesArrival <= 0;
                        const stale = r.telemetryStatus === 'STALE_SIGNAL';
                        const tone = overdue ? 'bg-rust' : stale ? 'bg-hazard' : 'bg-steel';
                        // Same edge problem as the ticks, and it bit hardest exactly
                        // where it mattered: an overdue load sits at 0% and had half
                        // its dot outside the band with its name clipped to "ofing
                        // sheets". The one marker a dispatcher must not miss was the
                        // one being cut in half, so the ends hang inward.
                        const pct = (mins / span) * 100;
                        const edge = pct <= 2 ? 'translate-x-0 items-start text-left'
                            : pct >= 98 ? '-translate-x-full items-end text-right'
                            : '-translate-x-1/2 items-center text-center';
                        return (
                            <div key={r.orderId}
                                className={`absolute top-[9px] flex flex-col group ${edge}`}
                                style={{ left: `${pct}%` }}
                                title={`${r.cargo} · ${resolveDriverName(r.driver)} · ${r.distanceRemainingKm}km out · ${overdue ? 'overdue' : clockAt(mins)}${stale ? ' · stale signal' : ''}`}>
                                <span className={`block h-2.5 w-2.5 rounded-full ring-2 ring-panel ${tone}`} />
                                {labelled ? (
                                    <span className="mt-1.5 block max-w-20 truncate text-[0.625rem] leading-tight text-steel group-hover:text-paper">
                                        {r.cargo}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
