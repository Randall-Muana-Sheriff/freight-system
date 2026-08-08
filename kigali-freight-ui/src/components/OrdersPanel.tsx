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
import OrderRow from './orders/OrderRow';
import InFlightRow from './orders/InFlightRow';
import { isAssignableDriver, type StaffUser, type LatLng } from '../types';

interface OrdersPanelProps {
    pickTargetMode: boolean;
    setPickTargetMode: (value: boolean) => void;
    pickedDeliveryCoords: LatLng | null;
    clearPickedDeliveryCoords: () => void;
}

const EMPTY_ORDER = { cargoDescription: '', weightKg: '', hubId: '', recipientName: '', recipientPhone: '', priority: 'normal' };

export default function OrdersPanel({ pickTargetMode, setPickTargetMode, pickedDeliveryCoords, clearPickedDeliveryCoords }: OrdersPanelProps) {
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

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper">
                    <PackagePlus size={14} strokeWidth={2.5} className="text-steel" />
                    Dispatch queue ({activeOrders.length} pending)
                </h3>
                <button
                    type="button"
                    onClick={() => setShowCreateForm((v) => !v)}
                    className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        showCreateForm ? 'bg-panel border-line/20 text-steel hover:text-paper' : 'bg-route/15 border-route/40 text-route hover:bg-route/25'
                    }`}
                >
                    {showCreateForm ? 'Cancel' : '+ New order'}
                </button>
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-[11px] rounded font-mono">
                    {error}
                </div>
            )}

            {showCreateForm && (
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
                <div className="grid grid-cols-3 gap-1.5">
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
                    <select
                        value={form.priority}
                        onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper font-mono"
                    >
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
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
            )}

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

            <BatchSuggestions drivers={drivers} jwtToken={jwtToken} onAssigned={() => void refreshFeeds()} />
        </div>
    );
}
