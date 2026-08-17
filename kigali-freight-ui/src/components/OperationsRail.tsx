// src/components/OperationsRail.tsx — always-visible left rail: the things
// a dispatcher checks constantly (dispatch queue, incidents, live fleet),
// as opposed to the occasional-use tools tabbed on the right.
//
// Grouped by what the dispatcher is expected to *do* with each panel, not
// by subject. Previously all five sat in one flat stack at identical visual
// weight, so a queue that needs someone right now looked exactly like a list
// of raw driver pings, and the rail gave no answer to the only question it
// is really asked: what needs me first. The three groups are ordered by
// urgency and labelled, so the answer is the top of the column.
import OrdersPanel from './OrdersPanel';
import IncidentReportsPanel from './IncidentReportsPanel';
import CompliancePanel from './CompliancePanel';
import IncidentRegistry from './IncidentRegistry';
import FleetAssetList from './FleetAssetList';
import LiveFleetStatusPanel from './LiveFleetStatusPanel';
import ResizeHandle from './ResizeHandle';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';

// A labelled band in the rail. The rule and the label are the whole device:
// they cost one line each and they turn a scroll of equal boxes into three
// ranks a dispatcher can learn once and then navigate by muscle memory.
function RailSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div className="flex items-center gap-3">
                <h2 className="data-label shrink-0 text-steel">{label}</h2>
                <span aria-hidden="true" className="h-px flex-1 bg-line/10" />
            </div>
            {children}
        </section>
    );
}

interface OperationsRailProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    onStartResize: (e: React.MouseEvent) => void;
}

// This column no longer carries a width of its own — it takes whatever the
// map leaves, so a wider screen buys more of the queue rather than more
// geography. Both the collapse flag and the drag handle now belong to
// Dashboard, which is the only place that can see all three columns at once;
// the handle on this rail's inner edge sizes the map, which is the same
// divider from the dispatcher's side of the screen.
export default function OperationsRail({ collapsed, onToggleCollapse, onStartResize }: OperationsRailProps) {
    const { userRole } = useSocket();
    const { orderDeliveryTargetMode, setOrderDeliveryTargetMode, newOrderDeliveryCoords, clearNewOrderDeliveryCoords } = useMapInteraction();

    return (
        <>
            {!collapsed && (
                <aside className="min-w-0 flex-1 bg-panel border-r border-line/10 h-full flex flex-col overflow-y-auto p-4 space-y-7">
                    {/* Work waiting on a person: an unassigned load, a driver
                        who has reported a problem. Top of the column because
                        it is the reason to look at the rail at all. */}
                    <RailSection label="Needs you">
                        {(userRole === 'admin' || userRole === 'dispatcher') && (
                            <OrdersPanel
                                pickTargetMode={orderDeliveryTargetMode}
                                setPickTargetMode={setOrderDeliveryTargetMode}
                                pickedDeliveryCoords={newOrderDeliveryCoords}
                                clearPickedDeliveryCoords={clearNewOrderDeliveryCoords}
                            />
                        )}
                        <IncidentReportsPanel />
                        <CompliancePanel />
                    </RailSection>

                    {/* Running on its own and only watched. ETAs come first
                        of the two: how far out and how soon is the question
                        a dispatcher is actually asked on the phone, whereas
                        the automated geofence and speed violations are a
                        feed you scan rather than work. */}
                    <RailSection label="In progress">
                        <LiveFleetStatusPanel />
                        <IncidentRegistry />
                    </RailSection>

                    {/* Raw telemetry. Consulted when something above prompts
                        a question, not read on its own. */}
                    <RailSection label="Reference">
                        <FleetAssetList />
                    </RailSection>
                </aside>
            )}
            <ResizeHandle onMouseDown={onStartResize} collapsed={collapsed} onToggleCollapse={onToggleCollapse} panelSide="left" />
        </>
    );
}
