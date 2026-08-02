// src/components/OperationsRail.jsx — always-visible left rail: the things
// a dispatcher checks constantly (dispatch queue, incidents, live fleet),
// as opposed to the occasional-use tools tabbed on the right.
import OrdersPanel from './OrdersPanel';
import IncidentReportsPanel from './IncidentReportsPanel';
import IncidentRegistry from './IncidentRegistry';
import FleetAssetList from './FleetAssetList';
import LiveFleetStatusPanel from './LiveFleetStatusPanel';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';

export default function OperationsRail() {
    const { userRole } = useSocket();
    const { orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, clearNewOrderDeliveryCoords } = useMapInteraction();

    return (
        <aside className="w-[360px] shrink-0 bg-panel border-r border-line/10 h-full flex flex-col overflow-y-auto p-4 space-y-4">
            {(userRole === 'admin' || userRole === 'dispatcher') && (
                <OrdersPanel
                    pickTargetMode={orderDeliveryTargetMode}
                    setPickTargetMode={setOrderDeliveryTargetMode}
                    pickedDeliveryCoords={newOrderDeliveryCoords}
                    clearPickedDeliveryCoords={clearNewOrderDeliveryCoords}
                />
            )}
            <IncidentReportsPanel />
            <IncidentRegistry />
            <LiveFleetStatusPanel />
            <FleetAssetList />
        </aside>
    );
}
