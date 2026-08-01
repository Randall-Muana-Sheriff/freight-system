// src/components/OrdersPanel.jsx
import { useState, useEffect, useCallback } from 'react';
import { PackagePlus, MapPin, Send, Navigation, ImageIcon, AlertTriangle, Repeat, Undo2, Boxes, RefreshCw, History } from 'lucide-react';
import { createOrder, assignOrders, reassignOrder, fetchNearestDrivers, fetchDrivers, fetchBatchedOrders, fetchOrderHistory } from '../utils/api';
import { useSocket } from '../context/SocketContext';

const EMPTY_ORDER = { cargoDescription: '', weightKg: '', hubId: '', recipientName: '', recipientPhone: '' };

// Read-only status timeline for a single order — dropped into any row that
// already has the order's id in scope.
function OrderHistoryToggle({ orderId, jwtToken }) {
    const { resolveDriverName } = useSocket();
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleToggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && history === null) {
            setLoading(true);
            try {
                setHistory(await fetchOrderHistory(orderId, jwtToken));
            } catch {
                setHistory([]);
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div>
            <button
                type="button"
                onClick={handleToggle}
                className="flex items-center gap-1 text-[9px] text-steel hover:text-paper uppercase font-mono tracking-wide"
            >
                <History size={10} strokeWidth={2.5} />
                {open ? 'Hide history' : 'History'}
            </button>
            {open && (
                <div className="mt-1 space-y-0.5 border-l border-line/15 pl-2">
                    {loading ? (
                        <div className="text-steel text-[9px] font-mono">Loading...</div>
                    ) : history && history.length > 0 ? (
                        history.map((h, idx) => (
                            <div key={idx} className="text-[9px] font-mono text-steel">
                                {h.previous_status ? `${h.previous_status} → ` : ''}
                                <span className="text-paper">{h.new_status}</span>
                                <span className="text-steel/70"> &middot; {resolveDriverName(h.changed_by)} &middot; {new Date(h.changed_at).toLocaleString()}</span>
                            </div>
                        ))
                    ) : (
                        <div className="text-steel text-[9px] font-mono">No status changes logged yet.</div>
                    )}
                </div>
            )}
        </div>
    );
}

// Spatial clustering of PENDING orders into pickup batches (backend groups
// orders within ~1.5km pickup / 3.5km delivery of each other) — a dispatcher
// can send the whole cluster to one driver in a single tap instead of
// assigning each shipment one by one.
function BatchSuggestions({ drivers, jwtToken, onAssigned }) {
    const [open, setOpen] = useState(false);
    const [batches, setBatches] = useState(null);
    const [loading, setLoading] = useState(false);
    const [assigningId, setAssigningId] = useState(null);
    const [selectedDrivers, setSelectedDrivers] = useState({});

    const load = async () => {
        setLoading(true);
        try {
            setBatches(await fetchBatchedOrders(jwtToken));
        } catch {
            setBatches([]);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next) load();
    };

    const handleAssignBatch = async (batch) => {
        const driver = selectedDrivers[batch.batch_id];
        if (!driver) return;
        setAssigningId(batch.batch_id);
        try {
            await assignOrders(batch.shipments.map((s) => s.id), driver, jwtToken);
            onAssigned();
            load();
        } catch (err) {
            alert(err.message || 'Failed to assign batch.');
        } finally {
            setAssigningId(null);
        }
    };

    return (
        <div className="pt-2 border-t border-line/10 space-y-1.5">
            <button
                type="button"
                onClick={handleToggle}
                className="w-full flex items-center justify-between text-[9px] text-steel uppercase tracking-wider font-mono"
            >
                <span className="flex items-center gap-1.5">
                    <Boxes size={11} strokeWidth={2.5} />
                    Suggested batches{batches ? ` (${batches.length})` : ''}
                </span>
                <RefreshCw size={10} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
            </button>
            {open && (
                loading && batches === null ? (
                    <div className="text-steel text-center py-2 text-[10px]">Clustering nearby pickups...</div>
                ) : batches && batches.length === 0 ? (
                    <div className="text-steel text-center py-2 text-[10px]">No pending orders cluster into a batch right now.</div>
                ) : batches ? (
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {batches.map((batch) => (
                            <div key={batch.batch_id} className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-1.5">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <div className="text-paper font-bold text-[11px] truncate">{batch.origin_cluster}</div>
                                        <div className="text-[9px] text-steel font-mono">{batch.shipments.length} shipments &middot; {batch.total_weight_kg} kg</div>
                                    </div>
                                    <span className="shrink-0 text-[9px] font-mono text-carbon">{batch.batch_id}</span>
                                </div>
                                <div className="text-[9px] text-steel font-mono truncate">
                                    {batch.shipments.map((s) => s.cargo_description).join(' · ')}
                                </div>
                                <div className="flex gap-1.5">
                                    <select
                                        value={selectedDrivers[batch.batch_id] || ''}
                                        onChange={(e) => setSelectedDrivers((sd) => ({ ...sd, [batch.batch_id]: e.target.value }))}
                                        className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                                    >
                                        <option value="">Assign whole batch to...</option>
                                        {drivers.map((d) => (
                                            <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => handleAssignBatch(batch)}
                                        disabled={assigningId === batch.batch_id || !selectedDrivers[batch.batch_id]}
                                        className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                                    >
                                        <Send size={10} strokeWidth={2.5} />
                                        {assigningId === batch.batch_id ? '...' : 'Assign'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : null
            )}
        </div>
    );
}

function OrderRow({ order, drivers, jwtToken, onAssigned }) {
    const { resolveDriverName } = useSocket();
    const [selectedDriver, setSelectedDriver] = useState('');
    const [suggestions, setSuggestions] = useState(null);
    const [assigning, setAssigning] = useState(false);
    const [suggesting, setSuggesting] = useState(false);

    const handleSuggest = async () => {
        setSuggesting(true);
        try {
            const data = await fetchNearestDrivers(order.id, jwtToken);
            setSuggestions(data.recommendedDrivers || []);
        } catch {
            setSuggestions([]);
        } finally {
            setSuggesting(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedDriver) return;
        setAssigning(true);
        try {
            await assignOrders([order.id], selectedDriver, jwtToken);
            onAssigned();
        } catch (err) {
            alert(err.message || 'Failed to assign order.');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-2">
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <div className="text-paper font-bold text-[11px] truncate">{order.cargo_description}</div>
                    <div className="text-[9px] text-steel font-mono">{order.origin_hub_name} &middot; {order.weight_kg} kg</div>
                </div>
                <span className="shrink-0 text-[9px] font-mono font-bold uppercase text-hazard bg-hazard/10 border border-hazard/30 rounded px-1.5 py-0.5">
                    {order.status}
                </span>
            </div>
            {suggestions ? (
                <div className="text-[9px] text-carbon font-mono">
                    {suggestions.length === 0
                        ? 'No drivers currently reporting a live position.'
                        : suggestions.map((s) => `${resolveDriverName(s.driverName)} (${s.distanceFromPickupKm}km)`).join(' · ')}
                </div>
            ) : null}
            <div className="flex gap-1.5">
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                >
                    <option value="">Select driver</option>
                    {drivers.map((d) => (
                        <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting}
                    title="Suggest nearest driver"
                    className="shrink-0 flex items-center justify-center bg-panel border border-line/15 text-carbon rounded px-2 disabled:opacity-50"
                >
                    <Navigation size={11} strokeWidth={2.5} />
                </button>
                <button
                    type="button"
                    onClick={handleAssign}
                    disabled={assigning || !selectedDriver}
                    className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                >
                    <Send size={10} strokeWidth={2.5} />
                    {assigning ? '...' : 'Assign'}
                </button>
            </div>
        </div>
    );
}

function InFlightRow({ order, drivers, jwtToken, onChanged }) {
    const { resolveDriverName } = useSocket();
    const [selectedDriver, setSelectedDriver] = useState('');
    const [busy, setBusy] = useState(false);

    const handleReassign = async () => {
        if (!selectedDriver) return;
        setBusy(true);
        try {
            await reassignOrder(order.id, selectedDriver, jwtToken);
            onChanged();
        } catch (err) {
            alert(err.message || 'Failed to reassign order.');
        } finally {
            setBusy(false);
        }
    };

    const handleUnassign = async () => {
        if (!confirm(`Unassign order #${order.id} from ${resolveDriverName(order.assigned_to)} and send it back to the dispatch queue?`)) return;
        setBusy(true);
        try {
            await reassignOrder(order.id, null, jwtToken);
            onChanged();
        } catch (err) {
            alert(err.message || 'Failed to unassign order.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-2">
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <div className="text-paper font-bold text-[11px] truncate">{order.cargo_description}</div>
                    <div className="text-[9px] text-steel font-mono">Awaiting pickup &middot; {resolveDriverName(order.assigned_to)}</div>
                </div>
                <span className="shrink-0 text-[9px] font-mono font-bold uppercase text-carbon bg-carbon/10 border border-carbon/30 rounded px-1.5 py-0.5">
                    {order.status}
                </span>
            </div>
            <div className="flex gap-1.5">
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                >
                    <option value="">Reassign to...</option>
                    {drivers.filter((d) => d.username !== order.assigned_to).map((d) => (
                        <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={handleReassign}
                    disabled={busy || !selectedDriver}
                    title="Reassign to selected driver"
                    className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                >
                    <Repeat size={10} strokeWidth={2.5} />
                </button>
                <button
                    type="button"
                    onClick={handleUnassign}
                    disabled={busy}
                    title="Unassign — send back to dispatch queue"
                    className="shrink-0 flex items-center gap-1 bg-panel border border-rust/40 text-rust font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                >
                    <Undo2 size={10} strokeWidth={2.5} />
                </button>
            </div>
            <OrderHistoryToggle orderId={order.id} jwtToken={jwtToken} />
        </div>
    );
}

export default function OrdersPanel({ pickTargetMode, setPickTargetMode, pickedDeliveryCoords, clearPickedDeliveryCoords }) {
    const { jwtToken, userRole, activeOrders, orderActivity, recentDeliveries, inFlightOrders, savedHubs, refreshFeeds, setViewingImage, resolveDriverName } = useSocket();
    const [drivers, setDrivers] = useState([]);
    const [form, setForm] = useState(EMPTY_ORDER);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);

    const loadDrivers = useCallback(async () => {
        try {
            setDrivers(await fetchDrivers(jwtToken));
        } catch (err) {
            console.error('Failed to load drivers', err);
        }
    }, [jwtToken]);

    useEffect(() => {
        setTimeout(() => { loadDrivers(); }, 0);
    }, [loadDrivers]);

    const handleCreate = async (e) => {
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
            }, jwtToken);
            setForm(EMPTY_ORDER);
            clearPickedDeliveryCoords();
            refreshFeeds();
        } catch (err) {
            setError(err.message || 'Failed to create order.');
        } finally {
            setCreating(false);
        }
    };

    if (userRole !== 'admin' && userRole !== 'dispatcher') {
        return null;
    }

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper">
                <PackagePlus size={14} strokeWidth={2.5} className="text-steel" />
                Dispatch queue ({activeOrders.length} pending)
            </h3>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-[11px] rounded font-mono">
                    {error}
                </div>
            )}

            <form onSubmit={handleCreate} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <div className="text-[9px] text-steel uppercase tracking-wider font-mono">New manifest entry</div>
                <input
                    type="text"
                    placeholder="Cargo description"
                    value={form.cargoDescription}
                    onChange={(e) => setForm((f) => ({ ...f, cargoDescription: e.target.value }))}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 focus:outline-none focus:border-route transition-colors"
                />
                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="text"
                        placeholder="Recipient name"
                        value={form.recipientName}
                        onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60"
                    />
                    <input
                        type="tel"
                        placeholder="Recipient phone"
                        value={form.recipientPhone}
                        onChange={(e) => setForm((f) => ({ ...f, recipientPhone: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="number"
                        placeholder="Weight (kg)"
                        value={form.weightKg}
                        onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                    <select
                        value={form.hubId}
                        onChange={(e) => setForm((f) => ({ ...f, hubId: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper font-mono"
                    >
                        <option value="">Pickup hub</option>
                        {savedHubs.map((h) => (
                            <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                    </select>
                </div>
                <button
                    type="button"
                    onClick={() => setPickTargetMode(!pickTargetMode)}
                    className={`w-full flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        pickTargetMode ? 'bg-rust border-rust/60 text-paper animate-pulse' : pickedDeliveryCoords ? 'bg-tarp/15 border-tarp/40 text-tarp' : 'bg-panel border-line/15 text-carbon'
                    }`}
                >
                    <MapPin size={11} strokeWidth={2.5} />
                    {pickTargetMode ? 'Click the map for delivery point...' : pickedDeliveryCoords ? 'Delivery point set — click to change' : 'Pick delivery point on map'}
                </button>
                <button
                    type="submit"
                    disabled={creating}
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-mono font-bold py-1.5 rounded text-[11px] uppercase tracking-wide transition-all disabled:opacity-50"
                >
                    {creating ? 'Logging manifest...' : '+ Create order'}
                </button>
            </form>

            <div className="max-h-52 overflow-y-auto space-y-1.5">
                {activeOrders.length === 0 && (
                    <div className="text-steel text-center py-2 text-[11px]">No pending orders — dispatch queue is clear.</div>
                )}
                {activeOrders.map((order) => (
                    <OrderRow key={order.id} order={order} drivers={drivers} jwtToken={jwtToken} onAssigned={refreshFeeds} />
                ))}
            </div>

            {inFlightOrders.length > 0 && (
                <div className="pt-2 border-t border-line/10 space-y-1.5">
                    <div className="text-[9px] text-steel uppercase tracking-wider font-mono">Awaiting pickup ({inFlightOrders.length}) &middot; reassign or unassign</div>
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {inFlightOrders.map((order) => (
                            <InFlightRow key={order.id} order={order} drivers={drivers} jwtToken={jwtToken} onChanged={refreshFeeds} />
                        ))}
                    </div>
                </div>
            )}

            {orderActivity.length > 0 && (
                <div className="pt-2 border-t border-line/10 space-y-1">
                    <div className="text-[9px] text-steel uppercase tracking-wider font-mono">Recent activity</div>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                        {orderActivity.map((a, idx) => (
                            <div key={`${a.orderId}-${a.timestamp}-${idx}`} className="flex justify-between text-[10px] font-mono text-steel">
                                <span className="truncate max-w-[180px]">#{a.orderId} {a.cargo_description}</span>
                                <span className="text-carbon font-bold">{a.status}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {recentDeliveries.length > 0 && (
                <div className="pt-2 border-t border-line/10 space-y-1">
                    <div className="text-[9px] text-steel uppercase tracking-wider font-mono">Recent deliveries &middot; proof of delivery</div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                        {recentDeliveries.map((d) => (
                            <div key={d.id} className={`flex justify-between items-center p-1.5 rounded border text-[10px] ${d.location_flagged ? 'bg-hazard/10 border-hazard/40' : 'bg-ink/60 border-line/10'}`}>
                                <div className="min-w-0">
                                    <div className="text-paper truncate max-w-[160px] flex items-center gap-1">
                                        {d.location_flagged && (
                                            <span title={`Confirmed ${Math.round(d.distance_from_target_m)}m from the delivery point`}>
                                                <AlertTriangle size={10} strokeWidth={2.5} className="text-hazard shrink-0" />
                                            </span>
                                        )}
                                        #{d.order_id} {d.cargo_description}
                                    </div>
                                    <div className="text-steel font-mono">
                                        {resolveDriverName(d.driver_name)} &middot; {new Date(d.confirmed_at).toLocaleTimeString()}
                                        {d.location_flagged && <span className="text-hazard"> &middot; {Math.round(d.distance_from_target_m)}m off</span>}
                                    </div>
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setViewingImage(d.photo_url)}
                                        className="flex items-center gap-1 bg-tarp/15 border border-tarp/40 text-tarp rounded px-2 py-1 font-bold uppercase"
                                    >
                                        <ImageIcon size={10} strokeWidth={2.5} />
                                        Photo
                                    </button>
                                    <OrderHistoryToggle orderId={d.order_id} jwtToken={jwtToken} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <BatchSuggestions drivers={drivers} jwtToken={jwtToken} onAssigned={refreshFeeds} />
        </div>
    );
}
