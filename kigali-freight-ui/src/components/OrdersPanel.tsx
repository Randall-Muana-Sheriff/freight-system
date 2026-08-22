// src/components/OrdersPanel.tsx
//
// Previously ~540 lines: this file, OrderHistoryToggle, BatchSuggestions,
// OrderRow, and InFlightRow were all defined inline here, four fully
// self-contained components sharing nothing but a common parent. Extracted
// into src/components/orders/ — pure code movement, no behavior changes;
// each one now lives, and is readable, on its own.
import { useState, useEffect, useCallback } from 'react';
import { PackagePlus, MapPin } from 'lucide-react';
import { createOrder, fetchDrivers } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import BatchSuggestions from './orders/BatchSuggestions';
import BulkActionBar from './orders/BulkActionBar';
import BulkPlaceFlow from './orders/BulkPlaceFlow';
import SavedViews from './orders/SavedViews';
import OrderRow from './orders/OrderRow';
import InFlightRow from './orders/InFlightRow';
import { isAssignableDriver, type StaffUser, type LatLng, type Order } from '../types';

interface OrdersPanelProps {
    pickTargetMode: boolean;
    setPickTargetMode: (value: boolean) => void;
    pickedDeliveryCoords: LatLng | null;
    clearPickedDeliveryCoords: () => void;
    /* The queue owns which order is open; the pane lives a level up in the
       layout so it can sit beside the map rather than inside the rail. */
    onOpenOrderChange?: (order: Order | null) => void;
}

const EMPTY_ORDER = { cargoDescription: '', weightKg: '', hubId: '', recipientName: '', recipientPhone: '', priority: 'normal' };

export default function OrdersPanel({ pickTargetMode, setPickTargetMode, pickedDeliveryCoords, clearPickedDeliveryCoords, onOpenOrderChange }: OrdersPanelProps) {
    const { jwtToken, userRole, activeOrders, inFlightOrders, savedHubs, refreshFeeds } = useSocket();
    const [drivers, setDrivers] = useState<StaffUser[]>([]);
    const [form, setForm] = useState(EMPTY_ORDER);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Collapsed by default: creating an order is an occasional task, while
    // this panel's primary job — moment to moment — is browsing and
    // assigning the queue below. Stacking a 7-field form permanently above
    // that queue made the two read as one long list instead of two
    // different modes (enter data vs. manage what already exists).
    const [showCreateForm, setShowCreateForm] = useState(false);
    // With 131 loads queued, scrolling is not how anyone finds one. Every
    // production TMS puts a filter above the queue and expects you to narrow
    // rather than scroll — the list is a work surface, not an archive.
    const [filter, setFilter] = useState('');
    // Selection lives here rather than in the rows so that "select all" and
    // the action bar can see it, and so it survives a row expanding or
    // collapsing underneath it.
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [placingBatch, setPlacingBatch] = useState<Order[] | null>(null);
    // Which order is open in the detail pane, and which row the keyboard is
    // on. Held as ids rather than indexes so a refresh that reorders the
    // queue cannot silently move the cursor onto a different load.
    const [cursorId, setCursorId] = useState<number | null>(null);

    const loadDrivers = useCallback(async () => {
        try {
            // Only drivers cleared for dispatch (documents approved + a
            // fleet vehicle assigned) are offered here — assigning to
            // anyone else would just be rejected server-side anyway (see
            // isDriverVerified in orderController.js), so there's no
            // point letting a dispatcher pick them only to hit an error.
            setDrivers((await fetchDrivers(jwtToken)).filter(isAssignableDriver));
        } catch (err) {
            console.error('Failed to load drivers', err);
        }
    }, [jwtToken]);

    useEffect(() => {
        setTimeout(() => { void loadDrivers(); }, 0);
    }, [loadDrivers]);

    // Tell the layout which order is open. Resolved from the live list so a
    // load that leaves the queue — assigned by someone else, say — closes the
    // pane rather than stranding a stale copy in it.
    useEffect(() => {
        onOpenOrderChange?.(activeOrders.find((o) => o.id === cursorId) ?? null);
    }, [cursorId, activeOrders, onOpenOrderChange]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!form.cargoDescription.trim() || !form.weightKg || !form.hubId) {
            setError('Cargo description, weight, and origin hub are all required.');
            return;
        }
        if (!pickedDeliveryCoords) {
            setError('Pick a delivery point on the map first.');
            return;
        }

        setCreating(true);
        try {
            await createOrder({
                cargo_description: form.cargoDescription.trim(),
                weight_kg: parseFloat(form.weightKg),
                origin_hub_id: form.hubId,
                delivery_lng: pickedDeliveryCoords[1],
                delivery_lat: pickedDeliveryCoords[0],
                recipient_name: form.recipientName.trim() || null,
                recipient_phone: form.recipientPhone.trim() || null,
                priority: form.priority as 'high' | 'normal' | 'low',
            }, jwtToken);
            setForm(EMPTY_ORDER);
            clearPickedDeliveryCoords();
            setShowCreateForm(false);
            void refreshFeeds();
        } catch (err) {
            setError((err as Error).message || 'Failed to create order.');
        } finally {
            setCreating(false);
        }
    };

    if (userRole !== 'admin' && userRole !== 'dispatcher') {
        return null;
    }

    // Matches what a dispatcher actually has in front of them when someone
    // rings: a cargo description, a hub, a name, or the tracking code off a
    // confirmation text.
    const needle = filter.trim().toLowerCase();
    const visibleOrders = needle
        ? activeOrders.filter((o) => [
            o.cargo_description, o.origin_hub_name, o.customer_name,
            o.customer_phone, o.tracking_token,
            o.pickup_address_text, o.delivery_address_text,
        ].some((f) => String(f || '').toLowerCase().includes(needle)))
        : activeOrders;

    const toggleOne = (id: number) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // Select-all applies to what is on screen, not to the whole queue. With a
    // filter active, "all" meaning 131 when 4 are shown is how someone assigns
    // the wrong hundred loads.
    const visibleIds = visibleOrders.map((o) => o.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    const toggleAllVisible = () => setSelected((prev) => {
        const next = new Set(prev);
        if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
        else visibleIds.forEach((id) => next.add(id));
        return next;
    });

    const selectedIds = [...selected];

    // Keyboard navigation. A dispatcher lives at this desk all day, and
    // reaching for the mouse to step down a queue is the kind of small tax
    // that adds up over a shift. j/k rather than arrows so the list can be
    // walked without leaving the home row, and because arrows are already
    // scrolling the panel.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            // Never steal a keystroke from something being typed into.
            if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (visibleOrders.length === 0) return;

            const at = visibleOrders.findIndex((o) => o.id === cursorId);
            const move = (delta: number) => {
                e.preventDefault();
                const next = at === -1 ? 0 : Math.min(visibleOrders.length - 1, Math.max(0, at + delta));
                setCursorId(visibleOrders[next].id);
            };

            if (e.key === 'j') move(1);
            else if (e.key === 'k') move(-1);
            else if (e.key === 'x' && at !== -1) { e.preventDefault(); toggleOne(visibleOrders[at].id); }
            else if (e.key === 'Escape') { e.preventDefault(); setCursorId(null); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [visibleOrders, cursorId]);
    // Only the ones that can actually be placed. Offering "place 12" when
    // nine of them already have coordinates would walk a dispatcher through
    // re-pinning work that was already done.
    const selectedUnplaced = activeOrders.filter(
        (o) => selected.has(o.id) && o.source === 'public' && o.pickup_lat == null,
    );

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            {/* flex-wrap and min-w-0 because this row is the widest thing in
                the rail — title, count and action all on one line — and the
                rail can be dragged down to 260px. It wraps rather than
                overflowing there. */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                <h3 className="flex min-w-0 items-center gap-2 display-tight text-body text-paper">
                    <PackagePlus size={15} strokeWidth={2.5} className="shrink-0 text-steel" />
                    <span className="truncate">Dispatch queue</span>
                    <span className="shrink-0 font-mono text-micro text-steel">{activeOrders.length} pending</span>
                </h3>
                <button
                    type="button"
                    onClick={() => setShowCreateForm((v) => !v)}
                    className={`focus-ring shrink-0 flex items-center gap-1 px-2 py-1 rounded text-micro font-semibold uppercase tracking-wide border transition-colors ${
                        showCreateForm ? 'bg-panel border-line/20 text-steel hover:text-paper' : 'bg-route/15 border-route/40 text-route hover:bg-route/25'
                    }`}
                >
                    {showCreateForm ? 'Cancel' : '+ New order'}
                </button>
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-data rounded font-mono">
                    {error}
                </div>
            )}

            {showCreateForm && (
            <form onSubmit={(e) => void handleCreate(e)} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <div className="text-micro text-steel uppercase tracking-wider font-mono">New manifest entry</div>
                <input
                    type="text"
                    placeholder="Cargo description"
                    value={form.cargoDescription}
                    onChange={(e) => setForm((f) => ({ ...f, cargoDescription: e.target.value }))}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60 focus:outline-none focus:border-route transition-colors"
                />
                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="text"
                        placeholder="Recipient name"
                        value={form.recipientName}
                        onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60"
                    />
                    <input
                        type="tel"
                        placeholder="Recipient phone"
                        value={form.recipientPhone}
                        onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60 font-mono"
                    />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    <input
                        type="number"
                        placeholder="Weight (kg)"
                        value={form.weightKg}
                        onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60 font-mono"
                    />
                    <select
                        value={form.hubId}
                        onChange={(e) => setForm((f) => ({ ...f, hubId: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper font-mono"
                    >
                        <option value="">Pickup hub</option>
                        {savedHubs.map((h) => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                    </select>
                    <select
                        value={form.priority}
                        onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper font-mono"
                    >
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => setPickTargetMode(!pickTargetMode)}
                    className={`w-full flex items-center justify-center gap-2 py-1.5 rounded text-micro font-bold uppercase tracking-wide border transition-colors ${
                        pickTargetMode ? 'bg-rust border-rust/60 text-ink animate-pulse' : pickedDeliveryCoords ? 'bg-tarp/15 border-tarp/40 text-tarp' : 'bg-panel border-line/15 text-carbon'
                    }`}
                >
                    <MapPin size={11} strokeWidth={2.5} />
                    {pickTargetMode ? 'Click the map for delivery point...' : pickedDeliveryCoords ? 'Delivery point set — click to change' : 'Pick delivery point on map'}
                </button>
                <button
                    type="submit"
                    disabled={creating}
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-mono font-bold py-1.5 rounded text-data uppercase tracking-wide transition-all disabled:opacity-50"
                >
                    {creating ? 'Logging manifest...' : '+ Create order'}
                </button>
            </form>
            )}

            {activeOrders.length > 6 && (
                <div className="flex items-center gap-2">
                    <label htmlFor="queue-filter" className="sr-only">Filter the dispatch queue</label>
                    <input
                        id="queue-filter"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter by cargo, address, customer or code"
                        className="focus-ring w-full rounded border border-line/15 bg-ink px-2 py-1.5 text-data text-paper placeholder-steel/60 focus:border-route focus:outline-none"
                    />
                    {needle && (
                        <span className="shrink-0 font-mono text-micro text-steel">
                            {visibleOrders.length}/{activeOrders.length}
                        </span>
                    )}
                </div>
            )}

            {activeOrders.length > 6 && <SavedViews filter={filter} onApply={setFilter} />}

            {placingBatch ? (
                <BulkPlaceFlow
                    orders={placingBatch}
                    jwtToken={jwtToken}
                    onFinished={() => { setPlacingBatch(null); setSelected(new Set()); void refreshFeeds(); }}
                    onCancel={() => setPlacingBatch(null)}
                />
            ) : (
                <BulkActionBar
                    selectedIds={selectedIds}
                    drivers={drivers}
                    jwtToken={jwtToken}
                    placeableCount={selectedUnplaced.length}
                    onPlace={() => setPlacingBatch(selectedUnplaced)}
                    onDone={() => void refreshFeeds()}
                    onClear={() => setSelected(new Set())}
                />
            )}

            {visibleOrders.length > 1 && (
                <label className="flex w-fit items-center gap-2 text-micro text-steel">
                    <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        className="focus-ring accent-route"
                    />
                    {allVisibleSelected ? 'Clear all' : `Select all ${visibleOrders.length} shown`}
                </label>
            )}

            {/* 46vh rather than a fixed 208px: at 131 queued this box was
                showing 1.6 orders out of 131 — 25,000px of content behind a
                208px window, with the rail scrolling underneath it. Sizing to
                the viewport means the queue gets the space it deserves on a
                dispatcher's monitor instead of a fixed sliver. */}
            <div className="max-h-[46vh] min-h-24 overflow-y-auto space-y-1.5">
                {activeOrders.length === 0 && (
                    <div className="text-steel text-center py-2 text-data">No pending orders — dispatch queue is clear.</div>
                )}
                {activeOrders.length > 0 && visibleOrders.length === 0 && (
                    <div className="py-2 text-center text-data text-steel">
                        Nothing matches &ldquo;{filter.trim()}&rdquo;. Clear the filter to see all {activeOrders.length}.
                    </div>
                )}
                {visibleOrders.map((order) => (
                    <OrderRow
                        key={order.id}
                        order={order}
                        drivers={drivers}
                        jwtToken={jwtToken}
                        onAssigned={() => void refreshFeeds()}
                        selected={selected.has(order.id)}
                        onToggleSelected={() => toggleOne(order.id)}
                        active={cursorId === order.id}
                        onOpen={() => setCursorId(cursorId === order.id ? null : order.id)}
                    />
                ))}
            </div>

            {inFlightOrders.length > 0 && (
                <div className="pt-2 border-t border-line/10 space-y-1.5">
                    <div className="text-micro text-steel uppercase tracking-wider font-mono">Awaiting pickup ({inFlightOrders.length}) &middot; reassign or unassign</div>
                    <div className="max-h-[32vh] overflow-y-auto space-y-1.5">
                        {inFlightOrders.map((order) => (
                            <InFlightRow key={order.id} order={order} drivers={drivers} jwtToken={jwtToken} onChanged={() => void refreshFeeds()} />
                        ))}
                    </div>
                </div>
            )}

            <BatchSuggestions drivers={drivers} jwtToken={jwtToken} onAssigned={() => void refreshFeeds()} />
        </div>
    );
}
