import { useState } from 'react';
import { History } from 'lucide-react';
import { fetchOrderHistory } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import type { OrderHistoryEntry } from '../../types';

interface OrderHistoryToggleProps {
    orderId: number;
    jwtToken: string;
}

// Read-only status timeline for a single order — dropped into any row that
// already has the order's id in scope.
export default function OrderHistoryToggle({ orderId, jwtToken }: OrderHistoryToggleProps) {
    const { resolveDriverName } = useSocket();
    const [open, setOpen] = useState(false);
    const [history, setHistory] = useState<OrderHistoryEntry[] | null>(null);
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
                onClick={() => void handleToggle()}
                className="flex items-center gap-1 text-[9px] text-steel hover:text-paper uppercase font-mono tracking-wide"
            >
                <History size={10} strokeWidth={2.5} />
                {open ? 'Hide history' : 'History'}
            </button>
            {open && (
                <div className="mt-1 space-y-1.5 border-l border-line/15 pl-2 overflow-x-hidden">
                    {loading ? (
                        <div className="text-steel text-[9px] font-mono">Loading...</div>
                    ) : history && history.length > 0 ? (
                        history.map((h, idx) => (
                            // Three separate lines, not one run-on string — a full
                            // "PREVIOUS → NEW · driver · date, time" sentence has no
                            // good place to wrap in a ~250px sidebar column, so it was
                            // forcing horizontal scroll instead of wrapping. Splitting
                            // by meaning (what changed / who / when) means each piece
                            // wraps independently and never needs to scroll sideways.
                            <div key={idx} className="text-[9px] font-mono min-w-0">
                                <div className="text-paper break-words">
                                    {h.previous_status ? `${h.previous_status} → ` : ''}
                                    {h.new_status}
                                </div>
                                <div className="text-steel/70 break-words">{resolveDriverName(h.changed_by)}</div>
                                <div className="text-steel/70 break-words">{new Date(h.changed_at).toLocaleString()}</div>
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
