// src/components/VehicleAssignmentPanel.jsx
import { useState, useEffect, useCallback } from 'react';
import { UserCog } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function VehicleAssignmentPanel() {
    const { jwtToken, userRole } = useSocket();
    const [vehicles, setVehicles] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [selectedDriver, setSelectedDriver] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [vehData, usrData] = await Promise.all([
                apiFetch('/api/vehicles', { token: jwtToken }),
                apiFetch('/api/users', { token: jwtToken }),
            ]);
            setVehicles(vehData);
            setDrivers(usrData.filter((u) => String(u.role).toLowerCase() === 'driver'));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin' || userRole === 'dispatcher') {
            // Call fetch asynchronously to avoid sync setState inside effect
            setTimeout(() => {
                fetchData();
            }, 0);
        }
    }, [userRole, fetchData]);

    const handleAssignment = async (e) => {
        e.preventDefault();
        if (!selectedVehicle || !selectedDriver) {
            setError('Please select both a vehicle asset and a driver.');
            return;
        }
        setError(null);
        setSuccessMsg(null);
        try {
            await apiFetch(`/api/vehicles/${selectedVehicle}/assign`, {
                method: 'PATCH',
                token: jwtToken,
                body: { driverId: selectedDriver },
            });
            setSuccessMsg('Driver successfully assigned to vehicle asset.');
            setSelectedVehicle('');
            setSelectedDriver('');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    if (userRole !== 'admin' && userRole !== 'dispatcher') {
        return null;
    }

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
            <div className="flex justify-between items-center">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <UserCog size={14} strokeWidth={2.5} className="text-steel" />
                    Driver assignment
                </h3>
                {loading && <span className="text-[9px] text-carbon animate-pulse">Syncing...</span>}
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="p-2 bg-tarp/10 border border-tarp/30 text-tarp rounded">
                    {successMsg}
                </div>
            )}

            <form onSubmit={handleAssignment} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <select
                    value={selectedVehicle}
                    onChange={(e) => setSelectedVehicle(e.target.value)}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper"
                >
                    <option value="">Select vehicle asset</option>
                    {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.plateNumber || v.name} ({v.vehicleType || v.type})
                        </option>
                    ))}
                </select>
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper"
                >
                    <option value="">Select available driver</option>
                    {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                            {d.username || d.email}
                        </option>
                    ))}
                </select>
                <button
                    type="submit"
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-bold py-1.5 rounded text-xs uppercase tracking-wide transition-all"
                >
                    Assign driver to asset
                </button>
            </form>
        </div>
    );
}
