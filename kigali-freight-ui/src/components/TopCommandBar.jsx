// src/components/TopCommandBar.jsx
import { useState } from 'react';
import { LogOut, PlugZap, Unplug, KeyRound, ChevronDown, Radio, Package, AlertTriangle, Truck, ShieldCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { apiFetch } from '../utils/api';
import { classifyFreshness, useNow } from '../utils/telemetryFreshness';

function ChangePasswordForm({ jwtToken }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);
        setSubmitting(true);
        try {
            await apiFetch('/api/auth/password', {
                method: 'PATCH',
                token: jwtToken,
                body: { currentPassword, newPassword },
            });
            setStatus({ type: 'success', message: 'Updated. Other sessions were signed out.' });
            setCurrentPassword('');
            setNewPassword('');
        } catch (err) {
            setStatus({ type: 'error', message: err.message || 'Failed to update password.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-2 p-3">
            <div className="text-[9px] text-steel uppercase tracking-wider font-mono">Change password</div>
            <input
                type="password"
                placeholder="Current password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
            />
            <input
                type="password"
                placeholder="New password (min 8 characters)"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
            />
            {status && <div className={`text-[10px] ${status.type === 'error' ? 'text-rust' : 'text-tarp'}`}>{status.message}</div>}
            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-route hover:bg-route-deep disabled:opacity-50 rounded py-1.5 text-[10px] font-bold text-ink hover:text-paper uppercase tracking-wide transition-colors"
            >
                {submitting ? 'Updating...' : 'Update password'}
            </button>
        </form>
    );
}

function StatChip({ icon: Icon, label, value, tone = 'text-paper' }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-ink/60 border border-line/10 shrink-0">
            <Icon size={13} strokeWidth={2.5} className="text-steel" />
            <div className="leading-none">
                <div className={`text-sm font-bold font-mono ${tone}`}>{value}</div>
                <div className="text-[8px] text-steel uppercase tracking-wider font-mono whitespace-nowrap">{label}</div>
            </div>
        </div>
    );
}

// Full-width app shell header, replacing the old sidebar-embedded brand
// block + separate UserProfile card. Session identity, connection health,
// and the top-line KPIs all live here now so they're visible regardless of
// which secondary tab a dispatcher has open.
export default function TopCommandBar() {
    const { userRole, jwtToken, isConnected, toggleNetworkStream, logout, trackedAssets, violations, activeOrders, inFlightOrders, setShowAdminCenter } = useSocket();
    const [menuOpen, setMenuOpen] = useState(false);
    const now = useNow();
    // Matches the map/fleet-list definition of "active" — a driver whose
    // last ping is old shouldn't inflate this count.
    const activeAssetCount = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline').length;

    return (
        <header className="h-16 shrink-0 bg-panel border-b border-line/10 flex items-center justify-between px-5 gap-4 relative z-30">
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-md bg-route/15 border border-route/35 flex items-center justify-center">
                    <span className="text-route font-mono font-black text-xs">KF</span>
                </div>
                <div className="hidden sm:block">
                    <h1 className="text-sm font-bold tracking-tight text-paper leading-tight">Kigali Freight</h1>
                    <p className="text-[9px] text-steel uppercase font-mono tracking-wider">Dispatch Control</p>
                </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                <StatChip icon={Truck} label="Active assets" value={activeAssetCount} tone="text-tarp" />
                <StatChip icon={Package} label="Dispatch queue" value={activeOrders.length} />
                <StatChip icon={Radio} label="In flight" value={inFlightOrders.length} tone="text-carbon" />
                <StatChip icon={AlertTriangle} label="Incidents" value={violations.length} tone={violations.length > 0 ? 'text-rust' : 'text-paper'} />
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
                {userRole === 'admin' && (
                    <button
                        onClick={() => setShowAdminCenter(true)}
                        title="Open admin control center"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide border border-route/30 bg-route/10 text-route hover:bg-route/20 transition-colors"
                    >
                        <ShieldCheck size={12} strokeWidth={2.5} />
                        Admin center
                    </button>
                )}
                <button
                    onClick={toggleNetworkStream}
                    title={isConnected ? 'Click to disconnect' : 'Click to reconnect'}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                        isConnected ? 'bg-tarp/10 border-tarp/30 text-tarp' : 'bg-rust/10 border-rust/30 text-rust animate-pulse'
                    }`}
                >
                    {isConnected ? <PlugZap size={12} strokeWidth={2.5} /> : <Unplug size={12} strokeWidth={2.5} />}
                    {isConnected ? 'Live' : 'Reconnecting'}
                </button>

                {userRole && (
                    <span className="px-2 py-1 rounded text-[9px] font-mono font-bold uppercase bg-carbon/15 border border-carbon/40 text-carbon">
                        {userRole}
                    </span>
                )}

                <div className="relative">
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        title="Account"
                        aria-label="Account menu"
                        aria-expanded={menuOpen}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-line/15 text-steel hover:text-paper transition-colors"
                    >
                        <KeyRound size={13} strokeWidth={2.5} />
                        <ChevronDown size={11} strokeWidth={2.5} />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-2 w-60 bg-panel border border-line/15 rounded-md shadow-xl z-40 overflow-hidden">
                                <ChangePasswordForm jwtToken={jwtToken} />
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold text-rust hover:bg-rust/10 uppercase tracking-wide border-t border-line/10 transition-colors"
                                >
                                    <LogOut size={13} strokeWidth={2.5} />
                                    Sign out
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
