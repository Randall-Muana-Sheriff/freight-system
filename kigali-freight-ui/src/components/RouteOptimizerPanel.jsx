// src/components/RouteOptimizerPanel.jsx
import { useState, useEffect } from 'react';
import { Route, MapPin, X, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch, createDeliveryStop, deleteDeliveryStop, optimizeMultiStopRoute, commitOptimizedRoute, fetchDrivers } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function RouteOptimizerPanel({ onRouteOptimized, stopTargetMode, setStopTargetMode, newStopCoords }) {
    const { jwtToken } = useSocket();
    const [stops, setStops] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [optimizedSequence, setOptimizedSequence] = useState([]);

    // Form state for a new stop (including time windows)
    const [newName, setNewName] = useState('');
    const [newLat, setNewLat] = useState('');
    const [newLng, setNewLng] = useState('');
    const [newDemand, setNewDemand] = useState('10');
    const [earliestArrival, setEarliestArrival] = useState('0');
    const [latestArrival, setLatestArrival] = useState('480');

    const depot = { id: 'depot-01', lat: -1.9441, lng: 30.0619, name: 'Kigali Warehouse' };
    const vehicles = [{ id: 1, name: 'Heavy Hauler #01', type: 'HEAVY_HAULER', maxWeight: 500, maxRangeKm: 150 }];

    useEffect(() => {
        async function fetchStops() {
            try {
                const data = await apiFetch('/api/stops', { token: jwtToken });
                if (Array.isArray(data)) setStops(data);
            } catch (err) {
                console.error('Failed to load pending stops', err);
            }
        }
        if (jwtToken) fetchStops();
    }, [jwtToken]);

    useEffect(() => {
        async function loadDrivers() {
            try {
                setDrivers(await fetchDrivers(jwtToken));
            } catch (err) {
                console.error('Failed to load drivers', err);
            }
        }
        if (jwtToken) loadDrivers();
    }, [jwtToken]);

    useEffect(() => {
        if (newStopCoords) {
            // Update form fields asynchronously to avoid sync setState inside effect
            setTimeout(() => {
                setNewLat(newStopCoords[0].toFixed(5));
                setNewLng(newStopCoords[1].toFixed(5));
            }, 0);
        }
    }, [newStopCoords]);

    const handleAddStopSubmit = async (e) => {
        e.preventDefault();
        if (!newName || !newLat || !newLng) {
            setError('Please fill in name, latitude, and longitude.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const createdStop = await createDeliveryStop({
                name: newName,
                lat: parseFloat(newLat),
                lng: parseFloat(newLng),
                demand: parseInt(newDemand, 10) || 1,
                earliestArrival: parseInt(earliestArrival, 10) || 0,
                latestArrival: parseInt(latestArrival, 10) || 480,
            }, jwtToken);
            setStops((prev) => [createdStop, ...prev]);
            setNewName('');
            setNewLat('');
            setNewLng('');
            setNewDemand('10');
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteStop = async (stopId) => {
        setError(null);
        try {
            await deleteDeliveryStop(stopId, jwtToken);
            setStops((prev) => prev.filter((s) => s.id !== stopId));
        } catch (err) {
            setError(err.message);
        }
    };

    const handleRunOptimization = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await optimizeMultiStopRoute(depot, vehicles, stops, 100, jwtToken);
            setResult(data);
            if (data.routes && data.routes[0]) {
                setOptimizedSequence(data.routes[0].sequence);
            }
            if (onRouteOptimized) onRouteOptimized(data.routes);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMoveStopSequence = (index, direction) => {
        const newSequence = [...optimizedSequence];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newSequence.length) return;
        const temp = newSequence[index];
        newSequence[index] = newSequence[targetIndex];
        newSequence[targetIndex] = temp;
        setOptimizedSequence(newSequence);
    };

    const handleCommitRoute = async () => {
        if (optimizedSequence.length === 0 || !result) return;
        if (!selectedDriver) {
            setError('Select a driver to commit this route to.');
            return;
        }
        setCommitting(true);
        setError(null);
        try {
            const totalDemand = optimizedSequence.reduce((sum, node) => sum + (Number(node.demand) || 0), 0);
            await commitOptimizedRoute({
                vehicleId: 1,
                driverName: selectedDriver,
                geojsonPath: optimizedSequence,
                aggregateDistanceKm: result.summary.aggregateDistanceKm,
                totalDemand,
            }, jwtToken);
            alert('Plan saved for reference. This does not dispatch anything — assign real work from the dispatch queue.');
        } catch (err) {
            setError(err.message);
        } finally {
            setCommitting(false);
        }
    };

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper">
                <Route size={14} strokeWidth={2.5} className="text-steel" />
                Route optimizer
                <span className="text-[9px] font-mono font-bold uppercase tracking-wide text-hazard bg-hazard/10 border border-hazard/30 rounded px-1.5 py-0.5">
                    Planning sandbox
                </span>
            </h3>
            <div className="text-[11px] text-steel">
                Multi-stop what-if planning. Saved plans are reference-only — they do <strong className="text-carbon">not</strong> notify a driver or create live orders. Use the dispatch queue to actually send work to a driver.
            </div>
            <div className="text-[11px] text-steel">Active unassigned stops: {stops.length}</div>
            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-[11px] rounded font-mono">
                    {error}
                </div>
            )}

            <form onSubmit={handleAddStopSubmit} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <div className="flex justify-between items-center">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-carbon font-bold">Register stop & windows</div>
                    <button
                        type="button"
                        onClick={() => setStopTargetMode(!stopTargetMode)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all border ${
                            stopTargetMode ? 'bg-rust border-rust/60 text-paper animate-pulse' : 'bg-panel border-line/15 text-carbon hover:text-paper'
                        }`}
                    >
                        <MapPin size={10} strokeWidth={2.5} />
                        {stopTargetMode ? 'Cancel picker' : 'Pick on map'}
                    </button>
                </div>
                <input
                    type="text"
                    placeholder="Stop name (e.g. Kacyiru Hub)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 focus:outline-none focus:border-route font-mono transition-colors"
                />
                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="number"
                        step="any"
                        placeholder="Latitude"
                        value={newLat}
                        onChange={(e) => setNewLat(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                    <input
                        type="number"
                        step="any"
                        placeholder="Longitude"
                        value={newLng}
                        onChange={(e) => setNewLng(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                </div>
                <div className="grid grid-cols-3 gap-1">
                    <input
                        type="number"
                        placeholder="Demand"
                        value={newDemand}
                        onChange={(e) => setNewDemand(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-[11px] text-paper placeholder-steel/60 font-mono"
                    />
                    <input
                        type="number"
                        placeholder="Earliest (min)"
                        value={earliestArrival}
                        onChange={(e) => setEarliestArrival(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-[11px] text-paper placeholder-steel/60 font-mono"
                    />
                    <input
                        type="number"
                        placeholder="Latest (min)"
                        value={latestArrival}
                        onChange={(e) => setLatestArrival(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-[11px] text-paper placeholder-steel/60 font-mono"
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-ink hover:text-paper text-carbon font-mono font-bold py-1.5 rounded text-[11px] transition-all disabled:opacity-50 border border-line/15"
                >
                    {submitting ? 'Saving stop...' : '+ Add stop to queue'}
                </button>
            </form>

            <div className="max-h-24 overflow-y-auto space-y-1 font-mono text-[11px]">
                {stops.map((s) => (
                    <div key={s.id} className="bg-ink/40 p-1.5 rounded flex justify-between items-center border border-line/10 text-steel">
                        <span className="truncate max-w-[120px]">{s.name}</span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-carbon bg-carbon/15 px-1 py-0.5 rounded border border-carbon/30">Load: {s.demand}</span>
                            <button
                                type="button"
                                onClick={() => handleDeleteStop(s.id)}
                                className="text-rust hover:opacity-75 px-1"
                            >
                                <X size={11} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={handleRunOptimization}
                disabled={loading || stops.length === 0}
                className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper py-2 rounded text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-50"
            >
                {loading ? 'Optimizing routes...' : 'Compute optimal routing'}
            </button>

            {optimizedSequence.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-line/10 font-mono text-[11px]">
                    <div className="text-paper font-bold">Optimized sequence:</div>
                    <div className="flex gap-1.5">
                        <select
                            value={selectedDriver}
                            onChange={(e) => setSelectedDriver(e.target.value)}
                            className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                        >
                            <option value="">Save plan for driver...</option>
                            {drivers.map((d) => (
                                <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                            ))}
                        </select>
                        <button
                            onClick={handleCommitRoute}
                            disabled={committing || !selectedDriver}
                            className="shrink-0 px-2 py-0.5 bg-tarp text-ink rounded text-[9px] font-bold uppercase disabled:opacity-50"
                        >
                            {committing ? 'Saving...' : 'Save plan'}
                        </button>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                        {optimizedSequence.map((node, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-ink/60 p-1 rounded border border-line/10 text-steel">
                                <span className="truncate max-w-[110px]">{idx}. {node.name || 'Stop'}</span>
                                <div className="flex gap-1">
                                    <button onClick={() => handleMoveStopSequence(idx, 'up')} className="p-0.5 bg-panel border border-line/10 rounded hover:text-paper">
                                        <ChevronUp size={11} />
                                    </button>
                                    <button onClick={() => handleMoveStopSequence(idx, 'down')} className="p-0.5 bg-panel border border-line/10 rounded hover:text-paper">
                                        <ChevronDown size={11} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result && (
                <div className="pt-2 border-t border-line/10 font-mono text-[10px] text-steel space-y-0.5">
                    <div className="text-paper font-bold">Metrics:</div>
                    <div>Vehicles needed: {result.summary.totalVehiclesNeeded}</div>
                    <div>Total distance: {result.summary.aggregateDistanceKm} km</div>
                </div>
            )}
        </div>
    );
}
