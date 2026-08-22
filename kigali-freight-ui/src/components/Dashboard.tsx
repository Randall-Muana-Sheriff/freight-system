// src/components/Dashboard.tsx
//
// Previously ~235 lines: this held all the "pick a location on the map"
// and playback state, used by none of it directly, purely to drill it
// down as 17 props to FleetMap and 18 to SecondaryPanel. Moved into
// MapInteractionContext — same state, same handlers, just no longer
// passed as props through a component that never read them.
import { useState } from 'react';
import { MapInteractionProvider, useMapInteraction } from '../context/MapInteractionContext';
import { useResizableWidth } from '../hooks/useResizableWidth';
import TopCommandBar from './TopCommandBar';
import OperationsRail from './OperationsRail';
import SecondaryPanel from './SecondaryPanel';
import FleetMap from './FleetMap';
import ArrivalTimeline from './ArrivalTimeline';
import ExceptionsHome from './ExceptionsHome';
import MonitorRail from './MonitorRail';

// Two jobs, two screens.
//
// The board previously carried roughly fourteen tools at once: a queue turning
// over 131 orders sat on the same screen as 3 hubs, 1 kiosk, 18 users and 11
// rate cards — things read once and changed a few times a year. That is a
// three-orders-of-magnitude frequency mismatch, and it is the real argument
// for splitting rather than any appeal to how other systems look.
//
// Dispatch is the doing: the queue, assignment, and the map, because geography
// matters at the moment you place a load. Monitor is the watching: what has
// gone wrong, sorted worst first, with no map because a list of exceptions is
// not a geographic question. Admin Center was already correctly separate.
export type Workspace = 'dispatch' | 'monitor';

// When the map is wider than this it stops being a reference and starts
// being a work surface, which is what placing a pin or tracing a boundary
// actually needs. Only used while one of those modes is live.
const PLACING_MIN_MAP = 940;

function BoardLayout({ workspace, onSwitch }: { workspace: Workspace; onSwitch: (w: Workspace) => void }) {
    // Which column is allowed to grow is the whole argument.
    //
    // The board used to give the map every pixel the two rails did not
    // claim, so on a wider screen a dispatcher got more geography and not
    // one more row of the queue — even though the queue is the work and the
    // map is how you check it. That is now the other way round: the rail
    // takes the remaining space and the map is the one holding a width.
    //
    // Except while something is being placed. Dropping a delivery point,
    // siting a hub, choosing a dispatch target or drawing a geofence are the
    // four moments when geography *is* the task, and a 640px map is a poor
    // place to do any of them. The map takes over for as long as one of
    // those modes is live and hands the space straight back afterwards, so
    // the layout follows what the dispatcher is doing rather than making
    // them drag a divider twice per order.
    const { drawModeActive, dispatchTargetMode, orderDeliveryTargetMode, hubTargetMode } = useMapInteraction();
    const placing = drawModeActive || dispatchTargetMode || orderDeliveryTargetMode || hubTargetMode;

    // The handle lives on the rail's inner edge — one divider between the
    // two columns, which is what it looks like — but it sizes the map,
    // since the map is now the column with a width. Dragging it right
    // widens the rail, hence the 'left' edge semantics.
    const { width: mapWidth, startResize } = useResizableWidth({
        storageKey: 'mapColumnWidth', defaultWidth: 640, min: 420, max: 1200, edge: 'left',
    });

    // The rail's collapsed flag is read here rather than inside the rail so
    // that the map can claim the freed space when it is folded away —
    // otherwise "give me the whole map" left the map at its own width and a
    // band of empty panel where the queue had been.
    const { collapsed: railCollapsed, toggleCollapse: toggleRail } = useResizableWidth({
        storageKey: 'operationsRailWidth', defaultWidth: 480, min: 260, max: 620, edge: 'right',
    });

    if (workspace === 'monitor') {
        return (
            <div className="flex flex-1 overflow-hidden">
                <div className="min-w-0 flex-1 bg-ink">
                    <ExceptionsHome onGoToDispatch={() => onSwitch('dispatch')} />
                </div>
                <MonitorRail />
            </div>
        );
    }

    return (
        <div className="flex flex-1 overflow-hidden">
            <OperationsRail collapsed={railCollapsed} onToggleCollapse={toggleRail} onStartResize={startResize} />
            {/* The centre column is no longer only the map. Freight is a
                time business and the board had no time dimension at all,
                so the arrivals axis sits above the geography — you read
                when off the band and where off the map. */}
            <div
                style={railCollapsed ? undefined : { width: placing ? Math.max(mapWidth, PLACING_MIN_MAP) : mapWidth }}
                className={`flex flex-col overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none ${
                    railCollapsed ? 'min-w-0 flex-1' : 'shrink-0'
                }`}
            >
                <ArrivalTimeline />
                <FleetMap />
            </div>
            <SecondaryPanel />
        </div>
    );
}

export default function Dashboard() {
    const [workspace, setWorkspace] = useState<Workspace>('dispatch');
    return (
        <MapInteractionProvider>
            {/* font-sans now resolves to Inter rather than the OS UI
                font; the focus-ring colour and the faux-bold guard come from
                ops-surface, which App.tsx puts above all three staff screens. */}
            <div className="flex flex-col h-screen w-screen bg-ink text-paper overflow-hidden font-sans">
                <TopCommandBar workspace={workspace} onSwitchWorkspace={setWorkspace} />
                <BoardLayout workspace={workspace} onSwitch={setWorkspace} />
            </div>
        </MapInteractionProvider>
    );
}
