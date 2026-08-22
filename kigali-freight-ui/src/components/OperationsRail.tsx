// src/components/OperationsRail.tsx — the Dispatch workspace's left column.
//
// It used to hold five panels: the queue, driver incident reports, document
// compliance, live ETAs, geofence violations and raw telemetry, stacked in one
// scroll. Grouping them by urgency helped, but the real problem was that they
// are two different jobs sharing a screen — assigning loads, and watching the
// fleet. The watching half now lives in the Monitor workspace (MonitorRail),
// and this column does one thing.
import OrdersPanel from './OrdersPanel';
import type { Order } from '../types';
import ResizeHandle from './ResizeHandle';
import { useMapInteraction } from '../context/MapInteractionContext';

interface OperationsRailProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    onStartResize: (e: React.MouseEvent) => void;
    onOpenOrderChange?: (order: Order | null) => void;
}

// This column no longer carries a width of its own — it takes whatever the
// map leaves, so a wider screen buys more of the queue rather than more
// geography. Both the collapse flag and the drag handle now belong to
// Dashboard, which is the only place that can see all three columns at once;
// the handle on this rail's inner edge sizes the map, which is the same
// divider from the dispatcher's side of the screen.
export default function OperationsRail({ collapsed, onToggleCollapse, onStartResize, onOpenOrderChange }: OperationsRailProps) {
    const { orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, clearNewOrderDeliveryCoords } = useMapInteraction();

    return (
        <>
            {!collapsed && (
                <aside className="min-w-0 flex-1 bg-panel border-r border-line/10 h-full flex flex-col overflow-y-auto p-4 space-y-7">
                    {/* One job on this screen: the queue, and getting a
                        driver onto it. Live ETAs, incident reports, geofence
                        violations, document expiry and raw telemetry all moved
                        to the Monitor workspace — a dispatcher assigning loads
                        was scrolling past five feeds to reach the work, and
                        someone watching the fleet was scrolling past 131 orders
                        to reach any of them. */}
                    <OrdersPanel
                        pickTargetMode={orderDeliveryTargetMode}
                        setPickTargetMode={setOrderDeliveryTargetMode}
                        pickedDeliveryCoords={newOrderDeliveryCoords}
                        clearPickedDeliveryCoords={clearNewOrderDeliveryCoords}
                        onOpenOrderChange={onOpenOrderChange}
                    />
                </aside>
            )}
            <ResizeHandle onMouseDown={onStartResize} collapsed={collapsed} onToggleCollapse={onToggleCollapse} panelSide="left" />
        </>
    );
}
