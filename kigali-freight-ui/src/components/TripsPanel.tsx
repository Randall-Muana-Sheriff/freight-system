import { useCallback, useEffect, useState } from 'react';
import { Route as RouteIcon, Wand2, ChevronUp, ChevronDown, Play, X, Loader2 } from 'lucide-react';
import {
    fetchTrips, fetchTrip, createTrip, updateTrip, optimiseTrip, reorderTrip, fetchDrivers,
    type Trip, type TripStop, type TripSummary,
} from '../utils/api';
import type { StaffUser } from '../types';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';
import { useDialog } from './DialogProvider';

// Planning a multi-stop run.
//
// This is the half the old Route Optimizer never had: it plans over real
// orders, and committing it actually dispatches. The optimiser it replaces
// worked on a separate `delivery_stops` table with no link to any order,
// and "committing" wrote a map line no driver could see.
//
// Deliberately not a drag-and-drop list. A dispatcher re-orders a run with
// a phone against their ear on a machine that may be a laptop trackpad;
// up/down buttons are unambiguous, keyboard-reachable, and cannot half-drop
// a stop into the wrong slot. The optimiser does the bulk ordering anyway —
// this is for the one stop that has to move.

const STOP_STATUS_STYLE: Record<TripStop['status'], string> = {
    PENDING: 'text-steel',
    ARRIVED: 'text-hazard',
    DONE: 'text-route',
    FAILED: 'text-rust',
    SKIPPED: 'text-steel/60',
};

const TRIP_STATUS_STYLE: Record<Trip['status'], string> = {
    PLANNED: 'text-tarp border-tarp/40 bg-tarp/10',
    ACTIVE: 'text-route border-route/40 bg-route/10',
    COMPLETED: 'text-steel border-line/20 bg-ink',
    CANCELLED: 'text-rust border-rust/30 bg-rust/5',
};

function km(metres: number | null) {
    if (!metres) return '—';
    return `${(metres / 1000).toFixed(1)} km`;
}

// Reads the queue and the token straight from context and fetches its own
// driver list, the same way OrdersPanel does — SecondaryPanel already
// threads a dozen props through and this needs none of them.
export default function TripsPanel() {
    const { jwtToken, activeOrders, resolveDriverName, refreshFeeds } = useSocket();
    const { setFocusedTrip } = useMapInteraction();
    const [drivers, setDrivers] = useState<StaffUser[]>([]);
    const { alert, confirm, prompt } = useDialog();
    const [trips, setTrips] = useState<TripSummary[]>([]);
    const [openTrip, setOpenTripState] = useState<Trip | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [driver, setDriver] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        if (!jwtToken) return;
        fetchDrivers(jwtToken).then(setDrivers).catch(() => setDrivers([]));
    }, [jwtToken]);

    // Opening a run here is what draws it on the map, so both go through
    // one setter — otherwise the panel and the map drift apart the first
    // time a code path forgets one of them.
    const setOpenTrip = useCallback((trip: Trip | null) => {
        setOpenTripState(trip);
        setFocusedTrip(trip);
    }, [setFocusedTrip]);

    // A run left drawn on the map after the panel unmounts is a line
    // nobody can dismiss.
    useEffect(() => () => setFocusedTrip(null), [setFocusedTrip]);

    const load = useCallback(async () => {
        try {
            setTrips(await fetchTrips(jwtToken));
        } catch {
            // The panel is one of several on this screen; a failed refresh
            // should not blank the others.
        }
    }, [jwtToken]);

    useEffect(() => { void load(); }, [load]);

    const toggleOrder = (id: number) => {
        setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    };

    const plan = async () => {
        if (selected.length === 0) return;
        setBusy('plan');
        try {
            const trip = await createTrip({ orderIds: selected, driverUsername: driver || null }, jwtToken);
            setSelected([]);
            setDriver('');
            setOpenTrip(trip);
            await load();
            refreshFeeds();
        } catch (err) {
            void alert({ title: 'Could not plan that run', body: (err as Error).message, tone: 'danger' });
        } finally {
            setBusy(null);
        }
    };

    const open = async (tripId: number) => {
        setBusy(`open-${tripId}`);
        try {
            setOpenTrip(await fetchTrip(tripId, jwtToken));
        } catch (err) {
            void alert({ title: 'Could not open that run', body: (err as Error).message, tone: 'danger' });
        } finally {
            setBusy(null);
        }
    };

    const runAction = async (label: string, action: () => Promise<Trip>) => {
        setBusy(label);
        try {
            setOpenTrip(await action());
            await load();
            refreshFeeds();
        } catch (err) {
            void alert({ title: 'That did not work', body: (err as Error).message, tone: 'danger' });
        } finally {
            setBusy(null);
        }
    };

    // Moving one stop swaps it with its neighbour and sends the whole
    // sequence, because the API insists on the complete list — a partial
    // one would leave stops holding stale positions.
    const move = (trip: Trip, index: number, direction: -1 | 1) => {
        const ids = trip.stops.map((s) => s.id);
        const target = index + direction;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        void runAction('reorder', () => reorderTrip(trip.id, ids, jwtToken));
    };

    const cancel = async (trip: Trip) => {
        const ok = await confirm({
            title: `Cancel run #${trip.id}?`,
            body: 'Its remaining stops are released, so the orders can be planned onto another run. Stops already completed stay as they are.',
            confirmLabel: 'Cancel run',
            tone: 'danger',
        });
        if (!ok) return;
        void runAction('cancel', () => updateTrip(trip.id, { status: 'CANCELLED' }, jwtToken));
    };

    const assign = async (trip: Trip) => {
        const username = await prompt({
            title: 'Assign this run',
            body: `Type the driver's phone number exactly as it appears in the roster.\n\n${drivers.map((d) => `${d.fullName || d.username} — ${d.username}`).join('\n')}`,
            placeholder: '+2507…',
            required: true,
        });
        if (!username) return;
        void runAction('assign', () => updateTrip(trip.id, { driverUsername: username.trim() }, jwtToken));
    };

    const plannable = activeOrders.filter((o) => o.status === 'PENDING');

    return (
        <div className="bg-panel border border-line/10 p-3 rounded-md space-y-3">
            <h3 className="flex items-center gap-1.5 text-[10px] font-bold text-steel uppercase tracking-wider">
                <RouteIcon size={12} strokeWidth={2.5} />
                Multi-stop runs
            </h3>

            {/* ── Plan a new run ─────────────────────────────────────── */}
            <div className="space-y-1.5">
                <div className="text-[9px] font-mono uppercase tracking-wider text-steel">
                    Pick orders {selected.length > 0 ? `· ${selected.length} selected` : ''}
                </div>
                {plannable.length === 0 ? (
                    <p className="text-[10px] text-steel">No pending orders to plan.</p>
                ) : (
                    <div className="max-h-[136px] overflow-y-auto space-y-1">
                        {plannable.map((order) => {
                            const on = selected.includes(order.id);
                            return (
                                <button
                                    key={order.id}
                                    type="button"
                                    onClick={() => toggleOrder(order.id)}
                                    aria-pressed={on}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-left transition-colors ${
                                        on ? 'border-route/50 bg-route/10' : 'border-line/10 bg-ink/60 hover:border-line/25'
                                    }`}
                                >
                                    <span className={`w-3 h-3 shrink-0 rounded-sm border ${on ? 'bg-route border-route' : 'border-line/30'}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] text-paper font-bold truncate">{order.cargo_description}</span>
                                        <span className="block text-[9px] font-mono text-steel truncate">
                                            {order.delivery_address_text || order.origin_hub_name || 'No address yet'}
                                        </span>
                                    </span>
                                    {order.priority === 'high' && <span className="text-[9px] font-mono font-bold text-rust">HIGH</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex gap-1.5">
                    <select
                        value={driver}
                        onChange={(e) => setDriver(e.target.value)}
                        className="flex-1 min-w-0 bg-ink border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                    >
                        <option value="">Assign later</option>
                        {drivers.map((d) => (
                            <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => void plan()}
                        disabled={selected.length === 0 || busy === 'plan'}
                        className="shrink-0 bg-route hover:bg-route-deep text-ink font-bold rounded px-3 text-[10px] uppercase disabled:opacity-40"
                    >
                        {busy === 'plan' ? 'Planning…' : `Plan run`}
                    </button>
                </div>
            </div>

            {/* ── Existing runs ──────────────────────────────────────── */}
            <div className="space-y-1 border-t border-line/10 pt-2">
                {trips.length === 0 ? (
                    <p className="text-[10px] text-steel">No runs yet.</p>
                ) : trips.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => void open(t.id)}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-ink/60 border border-line/10 hover:border-line/25 text-left"
                    >
                        <span className="min-w-0">
                            <span className="block text-[11px] text-paper font-bold truncate">
                                Run #{t.id} · {t.driver_username ? resolveDriverName(t.driver_username) : 'Unassigned'}
                            </span>
                            <span className="block text-[9px] font-mono text-steel">
                                {t.completed_stop_count}/{t.stop_count} stops · {km(t.planned_distance_m)}
                                {t.failed_stop_count > 0 && <span className="text-rust"> · {t.failed_stop_count} failed</span>}
                            </span>
                            {/* Customer orders arrive without coordinates, so a
                                run planned from them has nothing to draw and
                                nothing to sequence. Said here rather than
                                leaving the map blank and the dispatcher
                                wondering which of the two is broken. */}
                            {t.unplaced_stop_count > 0 && (
                                <span className="block text-[9px] font-mono text-hazard">
                                    {t.unplaced_stop_count} stop{t.unplaced_stop_count === 1 ? '' : 's'} need placing on the map
                                </span>
                            )}
                        </span>
                        <span className={`shrink-0 text-[9px] font-mono font-bold uppercase border rounded px-1.5 py-0.5 ${TRIP_STATUS_STYLE[t.status]}`}>
                            {t.status}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── One run, opened ────────────────────────────────────── */}
            {openTrip && (
                <div className="border-t border-line/10 pt-2 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-paper">
                            Run #{openTrip.id} · {openTrip.stopCount} stops · {km(openTrip.planned_distance_m)}
                        </span>
                        <button type="button" onClick={() => setOpenTrip(null)} className="text-steel hover:text-paper" aria-label="Close run">
                            <X size={13} />
                        </button>
                    </div>

                    {openTrip.stops.some((s) => s.lat == null || s.lng == null) && (
                        <p className="text-[9px] font-mono text-hazard leading-relaxed">
                            Some stops have no location, so they are missing from the map and the
                            optimiser cannot order them. Place their orders on the map from the
                            dispatch queue first.
                        </p>
                    )}

                    <ol className="space-y-1">
                        {openTrip.stops.map((stop, index) => (
                            <li key={stop.id} className="flex items-start gap-1.5 bg-ink/60 border border-line/10 rounded px-2 py-1.5">
                                <span className="mt-0.5 w-4 shrink-0 text-[10px] font-mono font-bold text-steel">{stop.sequence}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className={`text-[9px] font-mono font-bold uppercase ${stop.kind === 'PICKUP' ? 'text-tarp' : 'text-carbon'}`}>
                                            {stop.kind}
                                        </span>
                                        <span className={`text-[9px] font-mono uppercase ${STOP_STATUS_STYLE[stop.status]}`}>{stop.status}</span>
                                    </span>
                                    {/* Placed-on-the-map stops have coordinates and no street text;
                                        saying "no address" there would send a dispatcher
                                        chasing a problem that does not exist. */}
                                    <span className="block text-[10px] text-paper truncate">
                                        {stop.address_text
                                            || (stop.lat != null && stop.lng != null
                                                ? `${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`
                                                : 'No location — place it on the map')}
                                    </span>
                                    <span className="block text-[9px] font-mono text-steel truncate">{stop.cargo_description}</span>
                                    {stop.failure_reason && (
                                        <span className="block text-[9px] text-rust">{stop.failure_reason}</span>
                                    )}
                                </span>
                                {/* Only stops still ahead of the driver can move. */}
                                {['PENDING', 'ARRIVED'].includes(stop.status) && (
                                    <span className="flex flex-col shrink-0">
                                        <button type="button" onClick={() => move(openTrip, index, -1)} disabled={index === 0 || busy === 'reorder'}
                                            className="text-steel hover:text-paper disabled:opacity-25" aria-label={`Move stop ${stop.sequence} earlier`}>
                                            <ChevronUp size={12} />
                                        </button>
                                        <button type="button" onClick={() => move(openTrip, index, 1)} disabled={index === openTrip.stops.length - 1 || busy === 'reorder'}
                                            className="text-steel hover:text-paper disabled:opacity-25" aria-label={`Move stop ${stop.sequence} later`}>
                                            <ChevronDown size={12} />
                                        </button>
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>

                    {openTrip.status !== 'COMPLETED' && (
                        <div className="flex flex-wrap gap-1.5">
                            <button type="button" onClick={() => void runAction('optimise', () => optimiseTrip(openTrip.id, jwtToken))}
                                disabled={busy === 'optimise'}
                                title="Re-order the stops still ahead, shortest first, keeping every pickup before its own drop"
                                className="flex items-center gap-1 bg-ink border border-line/15 text-carbon rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">
                                {busy === 'optimise' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                                Optimise
                            </button>
                            <button type="button" onClick={() => void assign(openTrip)} disabled={busy === 'assign'}
                                className="bg-ink border border-line/15 text-carbon rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">
                                {openTrip.driver_username ? 'Reassign' : 'Assign driver'}
                            </button>
                            {openTrip.status === 'PLANNED' && openTrip.driver_username && (
                                <button type="button" onClick={() => void runAction('start', () => updateTrip(openTrip.id, { status: 'ACTIVE' }, jwtToken))}
                                    disabled={busy === 'start'}
                                    className="flex items-center gap-1 bg-route text-ink rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">
                                    <Play size={10} /> Start
                                </button>
                            )}
                            <button type="button" onClick={() => void cancel(openTrip)} disabled={busy === 'cancel'}
                                className="bg-ink border border-rust/30 text-rust rounded px-2 py-1 text-[10px] font-bold uppercase disabled:opacity-40">
                                Cancel run
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
