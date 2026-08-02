import { useState } from 'react';
import { Send, Navigation } from 'lucide-react';
import { assignOrders, fetchNearestDrivers } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';

export default function OrderRow({ order, drivers, jwtToken, onAssigned }) {
    const { resolveDriverName } = useSocket();
    const [selectedDriver, setSelectedDriver] = useState('');
    const [suggestions, setSuggestions] = useState(null);
    const [assigning, setAssigning] = useState(false);
    const [suggesting, setSuggesting] = useState(false);

    const handleSuggest = async () => {
        setSuggesting(true);
        try {
            const data = await fetchNearestDrivers(order.id, jwtToken);
            setSuggestions(data.recommendedDrivers || []);
        } catch {
            setSuggestions([]);
        } finally {
            setSuggesting(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedDriver) return;
        setAssigning(true);
        try {
            await assignOrders([order.id], selectedDriver, jwtToken);
            onAssigned();
        } catch (err) {
            alert(err.message || 'Failed to assign order.');
        } finally {
            setAssigning(false);
        }
    };

    return (
        <div className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-2">
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <div className="text-paper font-bold text-[11px] truncate">{order.cargo_description}</div>
                    <div className="text-[9px] text-steel font-mono">{order.origin_hub_name} &middot; {order.weight_kg} kg</div>
                </div>
                <span className="shrink-0 text-[9px] font-mono font-bold uppercase text-hazard bg-hazard/10 border border-hazard/30 rounded px-1.5 py-0.5">
                    {order.status}
                </span>
            </div>
            {suggestions ? (
                <div className="text-[9px] text-carbon font-mono">
                    {suggestions.length === 0
                        ? 'No drivers currently reporting a live position.'
                        : suggestions.map((s) => `${resolveDriverName(s.driverName)} (${s.distanceFromPickupKm}km)`).join(' · ')}
                </div>
            ) : null}
            <div className="flex gap-1.5">
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper"
                >
                    <option value="">Select driver</option>
                    {drivers.map((d) => (
                        <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={handleSuggest}
                    disabled={suggesting}
                    title="Suggest nearest driver"
                    className="shrink-0 flex items-center justify-center bg-panel border border-line/15 text-carbon rounded px-2 disabled:opacity-50"
                >
                    <Navigation size={11} strokeWidth={2.5} />
                </button>
                <button
                    type="button"
                    onClick={handleAssign}
                    disabled={assigning || !selectedDriver}
                    className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-[10px] uppercase disabled:opacity-50"
                >
                    <Send size={10} strokeWidth={2.5} />
                    {assigning ? '...' : 'Assign'}
                </button>
            </div>
        </div>
    );
}
