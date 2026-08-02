import { useState } from 'react';
import { Repeat, Undo2 } from 'lucide-react';
import { reassignOrder } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import OrderHistoryToggle from './OrderHistoryToggle';
import type { Order, StaffUser } from '../../types';

interface InFlightRowProps {
    order: Order;
    drivers: StaffUser[];
    jwtToken: string;
    onChanged: () => void;
}

export default function InFlightRow({ order, drivers, jwtToken, onChanged }: InFlightRowProps) {
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
            alert((err as Error).message || 'Failed to reassign order.');
        } finally {
            setBusy(false);
        }
    };

    const handleUnassign = async () => {
        if (!confirm(`Unassign order #${order.id} from ${resolveDriverName(order.assigned_to || '')} and send it back to the dispatch queue?`)) return;
        setBusy(true);
        try {
            await reassignOrder(order.id, null, jwtToken);
            onChanged();
        } catch (err) {
            alert((err as Error).message || 'Failed to unassign order.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-2">
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <div className="text-paper font-bold text-[11px] truncate">{order.cargo_description}</div>
                    <div className="text-[9px] text-steel font-mono">Awaiting pickup &middot; {resolveDriverName(order.assigned_to || '')}</div>
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
                    onClick={() => void handleReassign()}
                    disabled={busy || !selectedDriver}
                    title="Reassign to selected driver"
                    className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                >
                    <Repeat size={10} strokeWidth={2.5} />
                </button>
                <button
                    type="button"
                    onClick={() => void handleUnassign()}
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
