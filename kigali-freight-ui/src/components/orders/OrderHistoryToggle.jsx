import { useState } from 'react';
import { History } from 'lucide-react';
import { fetchOrderHistory } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';

// Read-only status timeline for a single order — dropped into any row that
// already has the order's id in scope.
export default function OrderHistoryToggle({ orderId, jwtToken }) {
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
