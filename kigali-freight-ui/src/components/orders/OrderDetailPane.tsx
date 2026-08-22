// src/components/orders/OrderDetailPane.tsx — the open order, beside the
// queue rather than inside it.
//
// Expanding a row in place pushed everything below it down, so working one
// order moved the rest of the queue under the dispatcher's cursor and lost
// their place in it. A detail pane is the convention for a reason: the list
// never moves, the detail gets room, and "which one am I working on" stays
// answerable at a glance.
//
// This is not a density feature. It is right at three orders and at three
// hundred — keeping context while acting on one item is about attention, not
// about how many rows fit.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import OrderRow from './OrderRow';
import { fetchDrivers } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import { isAssignableDriver, type Order, type StaffUser } from '../../types';

interface OrderDetailPaneProps {
    order: Order | null;
    onClose: () => void;
}

// Takes its own session and driver list rather than having them threaded down
// from the layout. The pane sits beside the map, several components away from
// the queue that knows about drivers, and passing them through every level in
// between would be four files touched to add one prop.
export default function OrderDetailPane({ order, onClose }: OrderDetailPaneProps) {
    const { jwtToken, refreshFeeds } = useSocket();
    const [drivers, setDrivers] = useState<StaffUser[]>([]);

    // Same filter the queue uses: only drivers actually cleared for dispatch.
    // Offering anyone else here would be rejected server-side anyway.
    useEffect(() => {
        let cancelled = false;
        fetchDrivers(jwtToken)
            .then((all) => { if (!cancelled) setDrivers(all.filter(isAssignableDriver)); })
            .catch(() => { /* the row degrades to an empty driver list */ });
        return () => { cancelled = true; };
    }, [jwtToken]);
    if (!order) {
        // An empty pane says what it is for rather than sitting blank, so the
        // column does not read as something that failed to load.
        return (
            <div className="flex h-full items-center justify-center border-l border-line/10 bg-panel p-6">
                <p className="max-w-[18rem] text-center text-data text-steel">
                    Pick a load from the queue to work on it. Its addresses, driver and pricing appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden border-l border-line/10 bg-panel">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/10 p-4">
                <div className="min-w-0">
                    <h3 className="display-tight text-body text-paper">{order.cargo_description}</h3>
                    <p className="mt-0.5 font-mono text-micro text-steel">
                        #{order.id}
                        {order.tracking_token ? ` · ${order.tracking_token}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    title="Close"
                    aria-label="Close order detail"
                    className="focus-ring shrink-0 rounded p-1 text-steel transition-colors hover:text-paper"
                >
                    <X size={15} strokeWidth={2.5} />
                </button>
            </div>

            {/* The row itself, permanently open. Every control a dispatcher
                needs on one order already lives there — placement, offer,
                assign, priority, return loads, pricing — and duplicating them
                here would be two places to keep in step and one to forget. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <OrderRow
                    order={order}
                    drivers={drivers}
                    jwtToken={jwtToken}
                    onAssigned={() => void refreshFeeds()}
                    selected={false}
                    onToggleSelected={() => {}}
                    variant="detail"
                />
            </div>
        </div>
    );
}
