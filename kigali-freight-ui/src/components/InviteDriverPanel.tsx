// src/components/InviteDriverPanel.tsx — replaces driver self-signup: a
// dispatcher already knows who this driver is, so the account is created
// directly here (pre-approved, staff ID auto-generated) along with a
// 6-character invite code the driver redeems once from the phone/OTP/PIN
// flow on the mobile app.
import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Copy, Check, KeyRound } from 'lucide-react';
import { inviteDriver, resetDriverPin, fetchUnassignedVehicles, fetchDrivers, type InviteDriverResult } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import type { Vehicle, StaffUser } from '../types';

const EMPTY_FORM = { phoneNumber: '', fullName: '', vehicleId: '' };

export default function InviteDriverPanel() {
    const { jwtToken, userRole } = useSocket();
    const [form, setForm] = useState(EMPTY_FORM);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [drivers, setDrivers] = useState<StaffUser[]>([]);
    const [inviting, setInviting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<InviteDriverResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [resettingId, setResettingId] = useState<number | null>(null);
    const [resetMsg, setResetMsg] = useState<string | null>(null);

    const loadSupportingData = useCallback(async () => {
        try {
            const [vehicleData, driverData] = await Promise.all([
                fetchUnassignedVehicles(jwtToken),
                fetchDrivers(jwtToken),
            ]);
            setVehicles(vehicleData);
            setDrivers(driverData);
        } catch (err) {
            setError((err as Error).message);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin' || userRole === 'dispatcher') {
            setTimeout(() => {
                void loadSupportingData();
            }, 0);
        }
    }, [userRole, loadSupportingData]);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResult(null);
        setCopied(false);
        setInviting(true);
        try {
            const payload = {
                phoneNumber: form.phoneNumber,
                fullName: form.fullName,
                ...(form.vehicleId ? { vehicleId: form.vehicleId } : {}),
            };
            const invited = await inviteDriver(payload, jwtToken);
            setResult(invited);
            setForm(EMPTY_FORM);
            void loadSupportingData();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setInviting(false);
        }
    };

    const handleCopy = () => {
        if (!result?.inviteCode) return;
        void navigator.clipboard?.writeText(result.inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleResetPin = async (driverId: number) => {
        setResetMsg(null);
        setResettingId(driverId);
        try {
            await resetDriverPin(driverId, jwtToken);
            setResetMsg('PIN reset — the driver will set a new one at their next sign-in.');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setResettingId(null);
        }
    };

    if (userRole !== 'admin' && userRole !== 'dispatcher') {
        return null;
    }

    return (
        <div className="space-y-4">
            <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <UserPlus size={14} strokeWidth={2.5} className="text-steel" />
                    Invite driver
                </h3>
                <p className="text-steel text-[10.5px] leading-relaxed font-sans">
                    Drivers don&apos;t self-register. Enter their phone number and name here — we generate a staff ID and a
                    6-character invite code they enter on the app to finish setting up their PIN.
                </p>

                {error && <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">{error}</div>}

                <form onSubmit={(e) => void handleInvite(e)} className="bg-ink/60 p-3.5 rounded border border-line/10 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2.5 items-end">
                        <label className="block">
                            <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Phone number</span>
                            <input
                                type="tel"
                                placeholder="078 123 4567"
                                required
                                value={form.phoneNumber}
                                onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                                className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Full name</span>
                            <input
                                type="text"
                                placeholder="e.g. Jean Mutabazi"
                                required
                                value={form.fullName}
                                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                                className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Vehicle (optional)</span>
                            <select
                                value={form.vehicleId}
                                onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
                                className="w-full bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route"
                            >
                                <option value="">Assign later</option>
                                {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.plateNumber} ({v.vehicleType})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="submit"
                            disabled={inviting}
                            className="bg-route hover:bg-route-deep disabled:opacity-50 rounded px-4 py-1.5 text-[11px] font-bold text-ink hover:text-paper uppercase whitespace-nowrap"
                        >
                            {inviting ? '...' : 'Invite'}
                        </button>
                    </div>
                </form>

                {result && (
                    <div className="p-3 bg-tarp/10 border border-tarp/30 rounded space-y-2">
                        <div className="text-tarp font-bold">Driver invited — {result.staffId}</div>
                        <div className="flex items-center gap-2">
                            <span className="text-steel">Invite code:</span>
                            <span className="text-paper font-bold text-sm tracking-widest">{result.inviteCode}</span>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="flex items-center gap-1 text-[10px] text-carbon hover:text-paper transition-colors"
                            >
                                {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <div className="text-steel text-[10px]">
                            {result.smsSent
                                ? `Also texted to ${result.phoneNumber}.`
                                : `Could not text this automatically — share the code with the driver yourself.`}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <KeyRound size={14} strokeWidth={2.5} className="text-steel" />
                    Drivers
                </h3>
                {resetMsg && <div className="p-2 bg-tarp/10 border border-tarp/30 text-tarp rounded">{resetMsg}</div>}
                <div className="max-h-[360px] overflow-y-auto space-y-1.5">
                    {drivers.length === 0 && <div className="text-steel text-center py-2">No drivers yet.</div>}
                    {drivers.map((d) => (
                        <div key={d.id} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-center">
                            <div className="truncate max-w-[280px]">
                                <div className="text-paper font-bold">{d.fullName || d.username}</div>
                                <div className="text-[9px] text-steel">{d.staffId || `ID: ${d.id}`} · {d.phoneNumber || d.username}</div>
                            </div>
                            {d.phoneNumber ? (
                                <button
                                    type="button"
                                    onClick={() => void handleResetPin(d.id)}
                                    disabled={resettingId === d.id}
                                    className="text-[10px] font-bold uppercase tracking-wide text-rust hover:text-paper disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                    {resettingId === d.id ? '...' : 'Reset PIN'}
                                </button>
                            ) : (
                                <span className="text-[9px] text-steel/60 uppercase tracking-wide whitespace-nowrap">Legacy account</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
