// src/components/VehicleAssignmentPanel.tsx
import { useState, useEffect, useCallback } from 'react';
import { UserCog } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { Vehicle, StaffUser } from '../types';

export default function VehicleAssignmentPanel() {
    const { jwtToken, userRole } = useSocket();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<StaffUser[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [selectedDriver, setSelectedDriver] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const { busy: assigning, error: assignError, run: runAssign } = useAsyncAction();
    const displayError = error || assignError;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [vehData, usrData] = await Promise.all([
                apiFetch('/api/vehicles', { token: jwtToken }) as Promise<Vehicle[]>,
                apiFetch('/api/users', { token: jwtToken }) as Promise<StaffUser[]>,
            ]);
            setVehicles(vehData);
            setDrivers(usrData.filter((u) => String(u.role).toLowerCase() === 'driver'));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin' || userRole === 'dispatcher') {
            // Call fetch asynchronously to avoid sync setState inside effect
            setTimeout(() => {
                void fetchData();
            }, 0);
        }
    }, [userRole, fetchData]);

    const handleAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedVehicle || !selectedDriver) {
            setError('Please select both a vehicle asset and a driver.');
            return;
        }
        setError(null);
        setSuccessMsg(null);
        await runAssign(async () => {
            await apiFetch(`/api/vehicles/${selectedVehicle}/assign`, {
                method: 'PATCH',
                token: jwtToken,
                body: { driverId: selectedDriver },
            });
            setSuccessMsg('Driver successfully assigned to vehicle asset.');
            setSelectedVehicle('');
            setSelectedDriver('');
            void fetchData();
        });
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

            {displayError && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">
                    {displayError}
                </div>
            )}

            {successMsg && (
                <div className="p-2 bg-tarp/10 border border-tarp/30 text-tarp rounded">
                    {successMsg}
                </div>
            )}

            <form onSubmit={(e) => void handleAssignment(e)} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
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
                            {d.fullName || d.username || d.email}
                        </option>
                    ))}
                </select>
                <button
                    type="submit"
                    disabled={assigning}
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-bold py-1.5 rounded text-xs uppercase tracking-wide transition-all disabled:opacity-50"
                >
                    {assigning ? 'Assigning...' : 'Assign driver to asset'}
                </button>
            </form>
        </div>
    );
}
