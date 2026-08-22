// src/components/MonitorRail.tsx — the detail column beside the exception
// home.
//
// These four panels used to sit in the dispatch rail underneath the queue,
// which meant a dispatcher assigning loads scrolled past live ETAs, driver
// incident reports, geofence violations and document expiry to reach the work
// — and someone watching the fleet scrolled past 131 orders to reach any of
// it. They are the watching job, so they live on the watching screen.
//
// The exception home to the left answers "what is wrong". This answers "show
// me the feed" — the same panels, but now the only thing on their screen.
import IncidentReportsPanel from './IncidentReportsPanel';
import IncidentRegistry from './IncidentRegistry';
import LiveFleetStatusPanel from './LiveFleetStatusPanel';
import CompliancePanel from './CompliancePanel';
import FleetAssetList from './FleetAssetList';
import ResizeHandle from './ResizeHandle';
import { useResizableWidth } from '../hooks/useResizableWidth';

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

export default function MonitorRail() {
    const { width, collapsed, toggleCollapse, startResize } = useResizableWidth({
        storageKey: 'monitorRailWidth', defaultWidth: 460, min: 320, max: 680, edge: 'left',
    });

    return (
        <>
            <ResizeHandle onMouseDown={startResize} collapsed={collapsed} onToggleCollapse={toggleCollapse} panelSide="right" />
            {!collapsed && (
                <aside
                    style={{ width }}
                    className="h-full shrink-0 space-y-7 overflow-y-auto border-l border-line/10 bg-panel p-4"
                >
                    {/* Where every moving load is and when it lands — the
                        question a dispatcher is asked on the phone. */}
                    <RailSection label="In progress">
                        <LiveFleetStatusPanel />
                    </RailSection>

                    {/* Reported by a person, or raised automatically. Both
                        want reading rather than working through. */}
                    <RailSection label="Reported">
                        <IncidentReportsPanel />
                        <IncidentRegistry />
                    </RailSection>

                    <RailSection label="Compliance">
                        <CompliancePanel />
                    </RailSection>

                    {/* Raw telemetry. Consulted when something above prompts a
                        question, not read on its own. */}
                    <RailSection label="Reference">
                        <FleetAssetList />
                    </RailSection>
                </aside>
            )}
        </>
    );
}
