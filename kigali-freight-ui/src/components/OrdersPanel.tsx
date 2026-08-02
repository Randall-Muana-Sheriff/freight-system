// src/components/OrdersPanel.tsx
//
// Previously ~540 lines: this file, OrderHistoryToggle, BatchSuggestions,
// OrderRow, and InFlightRow were all defined inline here, four fully
// self-contained components sharing nothing but a common parent. Extracted
// into src/components/orders/ — pure code movement, no behavior changes;
// each one now lives, and is readable, on its own.
import { useState, useEffect, useCallback } from 'react';
import { PackagePlus, MapPin, ImageIcon, AlertTriangle } from 'lucide-react';
import { createOrder, fetchDrivers } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import OrderHistoryToggle from './orders/OrderHistoryToggle';
import BatchSuggestions from './orders/BatchSuggestions';
import OrderRow from './orders/OrderRow';
import InFlightRow from './orders/InFlightRow';
import { isAssignableDriver, type StaffUser, type LatLng } from '../types';

interface OrdersPanelProps {
    pickTargetMode: boolean;
    setPickTargetMode: (value: boolean) => void;
    pickedDeliveryCoords: LatLng | null;
    clearPickedDeliveryCoords: () => void;
}

const EMPTY_ORDER = { cargoDescription: '', weightKg: '', hubId: '', recipientName: '', recipientPhone: '' };

export default function OrdersPanel({ pickTargetMode, setPickTargetMode, pickedDeliveryCoords, clearPickedDeliveryCoords }: OrdersPanelProps) {
    const { jwtToken, userRole, activeOrders, orderActivity, recentDeliveries, inFlightOrders, savedHubs, refreshFeeds, setViewingImage, resolveDriverName } = useSocket();
    const [drivers, setDrivers] = useState<StaffUser[]>([]);
    const [form, setForm] = useState(EMPTY_ORDER);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            }, jwtToken);
            setForm(EMPTY_ORDER);
            clearPickedDeliveryCoords();
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

            <form onSubmit={(e) => void handleCreate(e)} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
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
                    <OrderRow key={order.id} order={order} drivers={drivers} jwtToken={jwtToken} onAssigned={() => void refreshFeeds()} />
                ))}
            </div>

            {inFlightOrders.length > 0 && (
                <div className="pt-2 border-t border-line/10 space-y-1.5">
                    <div className="text-[9px] text-steel uppercase tracking-wider font-mono">Awaiting pickup ({inFlightOrders.length}) &middot; reassign or unassign</div>
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {inFlightOrders.map((order) => (
                            <InFlightRow key={order.id} order={order} drivers={drivers} jwtToken={jwtToken} onChanged={() => void refreshFeeds()} />
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
                                            <span title={`Confirmed ${Math.round(d.distance_from_target_m || 0)}m from the delivery point`}>
                                                <AlertTriangle size={10} strokeWidth={2.5} className="text-hazard shrink-0" />
                                            </span>
                                        )}
                                        #{d.order_id} {d.cargo_description}
                                    </div>
                                    <div className="text-steel font-mono">
                                        {resolveDriverName(d.driver_name)} &middot; {new Date(d.confirmed_at).toLocaleTimeString()}
                                        {d.location_flagged && <span className="text-hazard"> &middot; {Math.round(d.distance_from_target_m || 0)}m off</span>}
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

            <BatchSuggestions drivers={drivers} jwtToken={jwtToken} onAssigned={() => void refreshFeeds()} />
        </div>
    );
}
