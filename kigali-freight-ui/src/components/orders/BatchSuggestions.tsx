import { useState } from 'react';
import { Send, Boxes, RefreshCw } from 'lucide-react';
import { assignOrders, fetchBatchedOrders } from '../../utils/api';
import type { OrderBatch, StaffUser } from '../../types';
import { useDialog } from '../DialogProvider';

interface BatchSuggestionsProps {
    drivers: StaffUser[];
    jwtToken: string;
    onAssigned: () => void;
}

// Spatial clustering of PENDING orders into pickup batches (backend groups
// orders within ~1.5km pickup / 3.5km delivery of each other) — a dispatcher
// can send the whole cluster to one driver in a single tap instead of
// assigning each shipment one by one.
export default function BatchSuggestions({ drivers, jwtToken, onAssigned }: BatchSuggestionsProps) {
    const { alert } = useDialog();
    const [open, setOpen] = useState(false);
    const [batches, setBatches] = useState<OrderBatch[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [assigningId, setAssigningId] = useState<string | null>(null);
    const [selectedDrivers, setSelectedDrivers] = useState<Record<string, string>>({});

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
        if (next) void load();
    };

    const handleAssignBatch = async (batch: OrderBatch) => {
        const driver = selectedDrivers[batch.batch_id];
        if (!driver) return;
        setAssigningId(batch.batch_id);
        try {
            await assignOrders(batch.shipments.map((s) => s.id), driver, jwtToken);
            onAssigned();
            void load();
        } catch (err) {
            void alert({ title: 'Could not assign the batch', body: (err as Error).message || 'Failed to assign batch.', tone: 'danger' });
        } finally {
            setAssigningId(null);
        }
    };

    return (
        <div className="pt-2 border-t border-line/10 space-y-1.5">
            <button
                type="button"
                onClick={handleToggle}
                className="w-full flex items-center justify-between text-micro text-steel uppercase tracking-wider font-mono"
            >
                <span className="flex items-center gap-1.5">
                    <Boxes size={11} strokeWidth={2.5} />
                    Suggested batches{batches ? ` (${batches.length})` : ''}
                </span>
                <RefreshCw size={10} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
            </button>
            {open && (
                loading && batches === null ? (
                    <div className="text-steel text-center py-2 text-micro">Clustering nearby pickups...</div>
                ) : batches && batches.length === 0 ? (
                    <div className="text-steel text-center py-2 text-micro">No pending orders cluster into a batch right now.</div>
                ) : batches ? (
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {batches.map((batch) => (
                            <div key={batch.batch_id} className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-1.5">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <div className="text-paper font-bold text-data truncate">{batch.origin_cluster}</div>
                                        <div className="text-micro text-steel font-mono">{batch.shipments.length} shipments &middot; {batch.total_weight_kg} kg</div>
                                    </div>
                                    <span className="shrink-0 text-micro font-mono text-carbon">{batch.batch_id}</span>
                                </div>
                                <div className="text-micro text-steel font-mono truncate">
                                    {batch.shipments.map((s) => s.cargo_description).join(' · ')}
                                </div>
                                <div className="flex gap-1.5">
                                    <select
                                        value={selectedDrivers[batch.batch_id] || ''}
                                        onChange={(e) => setSelectedDrivers((sd) => ({ ...sd, [batch.batch_id]: e.target.value }))}
                                        className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-micro text-paper"
                                    >
                                        <option value="">Assign whole batch to...</option>
                                        {drivers.map((d) => (
                                            <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => void handleAssignBatch(batch)}
                                        disabled={assigningId === batch.batch_id || !selectedDrivers[batch.batch_id]}
                                        className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-micro uppercase disabled:opacity-50"
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
