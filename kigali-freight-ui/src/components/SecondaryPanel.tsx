// src/components/SecondaryPanel.tsx — occasional-use tools, grouped into
// tabs instead of one long scroll. Previously every panel here (route
// optimizer, geofences, vehicle roster, admin, audit logs) sat stacked at
// equal visual weight below the constantly-used operational panels, so
// reaching, say, vehicle registration meant scrolling past everything else.
import { useState, type ComponentType } from 'react';
import { Map, Truck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useMapInteraction } from '../context/MapInteractionContext';
import DispatchPanel from './DispatchPanel';
import RouteOptimizerPanel from './RouteOptimizerPanel';
import RoutesPanel from './RoutesPanel';
import GeofenceDrawer from './GeofenceDrawer';
import AdminControlPanel from './AdminControlPanel';
import VehicleAssignmentPanel from './VehicleAssignmentPanel';
import HubsPanel from './HubsPanel';
import ResizeHandle from './ResizeHandle';
import { useResizableWidth } from '../hooks/useResizableWidth';

interface Tab {
    id: string;
    label: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number }>;
    staffOnly?: boolean;
}

const TABS: Tab[] = [
    { id: 'planning', label: 'Planning', icon: Map },
    { id: 'fleet', label: 'Fleet', icon: Truck, staffOnly: true },
];

export default function SecondaryPanel() {
    const { userRole } = useSocket();
    const {
        dispatchTargetMode, setDispatchTargetMode, dispatchRankings,
        setOptimizedRoutes, stopTargetMode, setStopTargetMode, newStopCoords,
        savedRoutes, routesLoading, playbackCoords, playbackIndex, isPlaying, selectedPlaybackRoute, loadRouteForPlayback, togglePlaybackPlay,
        loadBreadcrumbsForPlayback: onLoadBreadcrumbs, breadcrumbsLoading,
        drawModeActive, setDrawModeActive, drawnPoints, setDrawnPoints,
        hubTargetMode, setHubTargetMode, newHubCoords, clearNewHubCoords,
    } = useMapInteraction();
    const [activeTab, setActiveTab] = useState('planning');
    const isStaff = userRole === 'admin' || userRole === 'dispatcher';
    const { width, startResize } = useResizableWidth({ storageKey: 'secondaryPanelWidth', defaultWidth: 380, min: 280, max: 600, edge: 'left' });

    const visibleTabs = TABS.filter((t) => !t.staffOnly || isStaff);
    const effectiveTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : (visibleTabs[0]?.id ?? 'planning');

    return (
        <>
        <ResizeHandle onMouseDown={startResize} />
        <aside style={{ width }} className="shrink-0 bg-panel border-l border-line/10 h-full flex flex-col overflow-hidden">
            <div className="flex border-b border-line/10 shrink-0">
                {visibleTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = tab.id === effectiveTab;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[10px] font-bold uppercase tracking-wide border-b-2 transition-colors ${
                                isActive ? 'text-route border-route' : 'text-steel border-transparent hover:text-paper'
                            }`}
                        >
                            <Icon size={13} strokeWidth={2.5} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {effectiveTab === 'planning' && (
                    <>
                        <DispatchPanel
                            dispatchTargetMode={dispatchTargetMode}
                            setDispatchTargetMode={setDispatchTargetMode}
                            setDrawModeActive={setDrawModeActive}
                            dispatchRankings={dispatchRankings}
                        />
                        <RouteOptimizerPanel
                            onRouteOptimized={setOptimizedRoutes}
                            stopTargetMode={stopTargetMode}
                            setStopTargetMode={setStopTargetMode}
                            newStopCoords={newStopCoords}
                        />
                        <RoutesPanel
                            routes={savedRoutes}
                            routesLoading={routesLoading}
                            playbackCoords={playbackCoords}
                            playbackIndex={playbackIndex}
                            isPlaying={isPlaying}
                            selectedPlaybackRoute={selectedPlaybackRoute}
                            loadRouteForPlayback={loadRouteForPlayback}
                            togglePlaybackPlay={togglePlaybackPlay}
                            onLoadBreadcrumbs={(driverName, hours) => void onLoadBreadcrumbs(driverName, hours)}
                            breadcrumbsLoading={breadcrumbsLoading}
                        />
                        <GeofenceDrawer
                            drawModeActive={drawModeActive}
                            setDrawModeActive={setDrawModeActive}
                            drawnPoints={drawnPoints}
                            setDrawnPoints={setDrawnPoints}
                            setDispatchTargetMode={setDispatchTargetMode}
                        />
                    </>
                )}

                {effectiveTab === 'fleet' && isStaff && (
                    <>
                        <AdminControlPanel />
                        <VehicleAssignmentPanel />
                        <HubsPanel
                            hubTargetMode={hubTargetMode}
                            setHubTargetMode={setHubTargetMode}
                            newHubCoords={newHubCoords}
                            clearNewHubCoords={clearNewHubCoords}
                        />
                    </>
                )}
            </div>
        </aside>
        </>
    );
}
