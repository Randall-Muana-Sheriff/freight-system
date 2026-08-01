// src/components/AdminControlPanel.jsx
import { useState, useEffect, useCallback } from 'react';
import { Truck, Trash2, UserMinus, Tag, X } from 'lucide-react';
import { apiFetch, createVehicleType, deleteVehicleType } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function AdminControlPanel() {
    const { jwtToken, userRole, savedVehicleTypes, refreshFeeds } = useSocket();
    const [plateNumber, setPlateNumber] = useState('');
    const [vehicleType, setVehicleType] = useState('');
    const [maxWeight, setMaxWeight] = useState('500');
    const [maxRangeKm, setMaxRangeKm] = useState('150');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [vehicles, setVehicles] = useState([]);
    const [deletingId, setDeletingId] = useState(null);
    const [unassigningId, setUnassigningId] = useState(null);
    const [newTypeName, setNewTypeName] = useState('');
    const [typeBusy, setTypeBusy] = useState(false);
    const [managingTypes, setManagingTypes] = useState(false);

    // Default the form to the first available type once the list loads,
    // rather than leaving the select on a blank option every time.
    useEffect(() => {
        if (!vehicleType && savedVehicleTypes.length > 0) {
            setVehicleType(savedVehicleTypes[0].name);
        }
    }, [savedVehicleTypes, vehicleType]);

    const loadVehicles = useCallback(async () => {
        try {
            setVehicles(await apiFetch('/api/vehicles', { token: jwtToken }));
        } catch (err) {
            console.error('Failed to load fleet roster', err);
        }
    }, [jwtToken]);

    useEffect(() => {
        setTimeout(() => { loadVehicles(); }, 0);
    }, [loadVehicles]);

    const handleRegisterVehicle = async (e) => {
        e.preventDefault();
        if (!plateNumber) {
            setError('Please provide a license plate.');
            return;
        }
        setSubmitting(true);
        setError(null);
        setSuccessMsg(null);

        try {
            // The backend's createVehicle endpoint calls this field `name`
            // and stores it straight into fleet_vehicles.plate_number — it's
            // the same value shown as "Plate" everywhere else (driver
            // profile, fleet roster, audit log). Keep sending it as `name`
            // here to match the API, even though every user-facing label in
            // this form now correctly calls it a license plate.
            await apiFetch('/api/vehicles', {
                method: 'POST',
                token: jwtToken,
                body: {
                    name: plateNumber,
                    type: vehicleType,
                    maxWeight: parseFloat(maxWeight),
                    maxRangeKm: parseFloat(maxRangeKm),
                },
            });
            setSuccessMsg(`Vehicle ${plateNumber} successfully registered!`);
            setPlateNumber('');
            loadVehicles();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteVehicle = async (vehicle) => {
        if (!confirm(`Delete "${vehicle.plateNumber}" from the fleet roster? This can't be undone.`)) return;
        setDeletingId(vehicle.id);
        setError(null);
        setSuccessMsg(null);
        try {
            await apiFetch(`/api/vehicles/${vehicle.id}`, { method: 'DELETE', token: jwtToken });
            setSuccessMsg(`Vehicle ${vehicle.plateNumber} deleted.`);
            loadVehicles();
        } catch (err) {
            setError(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const handleUnassignVehicle = async (vehicle) => {
        setUnassigningId(vehicle.id);
        setError(null);
        setSuccessMsg(null);
        try {
            await apiFetch(`/api/vehicles/${vehicle.id}/assign`, {
                method: 'PATCH',
                token: jwtToken,
                body: { driverId: null },
            });
            setSuccessMsg(`Vehicle ${vehicle.plateNumber} unassigned.`);
            loadVehicles();
        } catch (err) {
            setError(err.message);
        } finally {
            setUnassigningId(null);
        }
    };

    const handleAddType = async (e) => {
        e.preventDefault();
        if (!newTypeName.trim()) return;
        setTypeBusy(true);
        setError(null);
        try {
            await createVehicleType(newTypeName.trim(), jwtToken);
            setNewTypeName('');
            refreshFeeds();
        } catch (err) {
            setError(err.message);
        } finally {
            setTypeBusy(false);
        }
    };

    const handleDeleteType = async (type) => {
        setTypeBusy(true);
        setError(null);
        try {
            await deleteVehicleType(type.id, jwtToken);
            refreshFeeds();
        } catch (err) {
            setError(err.message);
        } finally {
            setTypeBusy(false);
        }
    };

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper">
                <Truck size={14} strokeWidth={2.5} className="text-steel" />
                Fleet asset control
            </h3>
            <div className="text-[11px] text-carbon font-mono uppercase tracking-wider">Access level: {userRole || 'Guest'}</div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-[11px] rounded font-mono">
                    {error}
                </div>
            )}

            {successMsg && (
                <div className="p-2 bg-tarp/10 border border-tarp/30 text-tarp text-[11px] rounded font-mono">
                    {successMsg}
                </div>
            )}

            <form onSubmit={handleRegisterVehicle} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <div className="text-[10px] font-mono uppercase tracking-wider text-carbon font-bold">Register new fleet asset</div>
                <input
                    type="text"
                    placeholder="License plate (e.g. RAD 123 A)"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value)}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 focus:outline-none focus:border-route font-mono transition-colors"
                />
                <div className="flex gap-1.5">
                    <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper font-mono"
                    >
                        {savedVehicleTypes.length === 0 && <option value="">No types defined</option>}
                        {savedVehicleTypes.map((t) => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setManagingTypes((v) => !v)}
                        title="Manage vehicle types"
                        className={`shrink-0 flex items-center justify-center px-2 rounded border transition-colors ${
                            managingTypes ? 'bg-route/15 border-route/40 text-route' : 'bg-panel border-line/15 text-carbon'
                        }`}
                    >
                        <Tag size={12} strokeWidth={2.5} />
                    </button>
                </div>

                {managingTypes && (
                    <div className="space-y-1.5 bg-panel p-2 rounded border border-line/10">
                        <div className="flex gap-1.5">
                            <input
                                type="text"
                                placeholder="New type name"
                                value={newTypeName}
                                onChange={(e) => setNewTypeName(e.target.value)}
                                className="flex-1 min-w-0 bg-ink border border-line/15 rounded px-2 py-1 text-[11px] text-paper placeholder-steel/60 focus:outline-none focus:border-route transition-colors"
                            />
                            <button
                                type="button"
                                onClick={handleAddType}
                                disabled={typeBusy || !newTypeName.trim()}
                                className="shrink-0 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2.5 text-[10px] uppercase disabled:opacity-50"
                            >
                                Add
                            </button>
                        </div>
                        <div className="max-h-28 overflow-y-auto space-y-1">
                            {savedVehicleTypes.map((t) => (
                                <div key={t.id} className="flex justify-between items-center bg-ink/60 px-2 py-1 rounded border border-line/10">
                                    <span className="text-[11px] text-steel">{t.name}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteType(t)}
                                        disabled={typeBusy}
                                        title="Remove type"
                                        className="text-steel hover:text-rust disabled:opacity-50"
                                    >
                                        <X size={12} strokeWidth={2.5} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="number"
                        placeholder="Max weight (kg)"
                        value={maxWeight}
                        onChange={(e) => setMaxWeight(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                    <input
                        type="number"
                        placeholder="Max range (km)"
                        value={maxRangeKm}
                        onChange={(e) => setMaxRangeKm(e.target.value)}
                        className="bg-panel border border-line/15 rounded px-2 py-1 text-xs text-paper placeholder-steel/60 font-mono"
                    />
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-mono font-bold py-1.5 rounded text-xs uppercase tracking-wide transition-all disabled:opacity-50"
                >
                    {submitting ? 'Registering asset...' : '+ Add asset to fleet'}
                </button>
            </form>

            <div className="pt-1 space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-carbon font-bold">Fleet roster ({vehicles.length})</div>
                {vehicles.length === 0 ? (
                    <div className="text-steel text-center py-2 text-[11px]">No vehicles registered yet.</div>
                ) : (
                    <div className="max-h-52 overflow-y-auto space-y-1.5">
                        {vehicles.map((v) => (
                            <div key={v.id} className="flex justify-between items-center bg-ink/60 p-2 rounded border border-line/10">
                                <div className="min-w-0">
                                    <div className="text-paper font-bold text-[11px] truncate">{v.plateNumber}</div>
                                    <div className="text-[9px] text-steel font-mono">
                                        {v.vehicleType}
                                        {v.currentDriverId ? ' · assigned' : ' · unassigned'}
                                        {v.maxWeightKg ? ` · ${v.maxWeightKg}kg` : ''}
                                    </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                    {v.currentDriverId ? (
                                        <button
                                            type="button"
                                            onClick={() => handleUnassignVehicle(v)}
                                            disabled={unassigningId === v.id}
                                            title="Unassign from driver"
                                            className="flex items-center gap-1 bg-panel border border-line/15 text-carbon rounded px-2 py-1 text-[9px] font-bold uppercase disabled:opacity-50"
                                        >
                                            <UserMinus size={11} strokeWidth={2.5} />
                                            {unassigningId === v.id ? '...' : 'Unassign'}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteVehicle(v)}
                                        disabled={deletingId === v.id}
                                        title="Delete vehicle"
                                        className="flex items-center gap-1 bg-panel border border-rust/40 text-rust rounded px-2 py-1 text-[9px] font-bold uppercase disabled:opacity-50"
                                    >
                                        <Trash2 size={11} strokeWidth={2.5} />
                                        {deletingId === v.id ? '...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
