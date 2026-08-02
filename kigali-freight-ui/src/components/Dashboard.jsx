// src/components/Dashboard.jsx
//
// Previously ~235 lines: this held all the "pick a location on the map"
// and playback state, used by none of it directly, purely to drill it
// down as 17 props to FleetMap and 18 to SecondaryPanel. Moved into
// MapInteractionContext — same state, same handlers, just no longer
// passed as props through a component that never read them.
import { MapInteractionProvider } from '../context/MapInteractionContext';
import TopCommandBar from './TopCommandBar';
import OperationsRail from './OperationsRail';
import SecondaryPanel from './SecondaryPanel';
import FleetMap from './FleetMap';

export default function Dashboard() {
    return (
        <MapInteractionProvider>
            <div className="flex flex-col h-screen w-screen bg-ink text-paper overflow-hidden font-sans">
                <TopCommandBar />
                <div className="flex flex-1 overflow-hidden">
                    <OperationsRail />
                    <FleetMap />
                    <SecondaryPanel />
                </div>
            </div>
        </MapInteractionProvider>
    );
}
