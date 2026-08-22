// src/components/TopCommandBar.tsx
import { useState, useEffect, type ComponentType } from 'react';
import { LogOut, PlugZap, Unplug, KeyRound, ChevronDown, Radio, Package, AlertTriangle, Truck, ShieldCheck, Copy, Check, Bell, Image as ImageIcon } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { apiFetch, fetchMyAccount, enrollMfa, confirmMfa, disableMfa, type MfaEnrollResult } from '../utils/api';
import { classifyFreshness, useNow } from '../utils/telemetryFreshness';
import { InziraMark } from './InziraMark';
import OrderHistoryToggle from './orders/OrderHistoryToggle';

function ChangePasswordForm({ jwtToken }: { jwtToken: string }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
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
            setStatus({ type: 'error', message: (err as Error).message || 'Failed to update password.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 p-3">
            <div className="text-micro text-steel uppercase tracking-wider font-mono">Change password</div>
            <input
                type="password"
                placeholder="Current password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-data text-paper focus:outline-none focus:border-route transition-colors"
            />
            <input
                type="password"
                placeholder="New password (min 8 characters)"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-data text-paper focus:outline-none focus:border-route transition-colors"
            />
            {status && <div className={`text-micro ${status.type === 'error' ? 'text-rust' : 'text-tarp'}`}>{status.message}</div>}
            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-route hover:bg-route-deep disabled:opacity-50 rounded py-1.5 text-micro font-bold text-ink hover:text-paper uppercase tracking-wide transition-colors"
            >
                {submitting ? 'Updating...' : 'Update password'}
            </button>
        </form>
    );
}

// Opt-in TOTP MFA for the account's own login — enroll (QR + confirm),
// view recovery codes exactly once, or disable (password-gated). Placed
// right alongside ChangePasswordForm in the same account-menu dropdown;
// this is self-service on your own account only, not something an admin
// sets for someone else.
type MfaStep = 'loading' | 'off' | 'enrolling' | 'confirming' | 'recovery-codes' | 'on' | 'disabling';

function TwoFactorSection({ jwtToken }: { jwtToken: string }) {
    const [step, setStep] = useState<MfaStep>('loading');
    const [enrollment, setEnrollment] = useState<MfaEnrollResult | null>(null);
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchMyAccount(jwtToken)
            .then((account) => setStep(account.mfaEnabled ? 'on' : 'off'))
            .catch(() => setStep('off'));
    }, [jwtToken]);

    const startEnroll = async () => {
        setError(null);
        setSubmitting(true);
        try {
            const result = await enrollMfa(jwtToken);
            setEnrollment(result);
            setStep('confirming');
        } catch (err) {
            setError((err as Error).message || 'Could not start MFA enrollment.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const result = await confirmMfa(code, jwtToken);
            setRecoveryCodes(result.recoveryCodes);
            setCode('');
            setStep('recovery-codes');
        } catch (err) {
            setError((err as Error).message || 'Incorrect code.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            await disableMfa(disablePassword, jwtToken);
            setDisablePassword('');
            setStep('off');
        } catch (err) {
            setError((err as Error).message || 'Could not disable MFA.');
        } finally {
            setSubmitting(false);
        }
    };

    const copyRecoveryCodes = () => {
        void navigator.clipboard?.writeText(recoveryCodes.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (step === 'loading') return null;

    return (
        <div className="p-3 border-t border-line/10 space-y-2">
            <div className="text-micro text-steel uppercase tracking-wider font-mono">Two-factor authentication</div>
            {error && <div className="text-micro text-rust">{error}</div>}

            {step === 'off' && (
                <>
                    <p className="text-micro text-steel leading-relaxed">Add a code from an authenticator app to your login, on top of your password.</p>
                    <button
                        type="button"
                        onClick={() => void startEnroll()}
                        disabled={submitting}
                        className="w-full bg-route hover:bg-route-deep disabled:opacity-50 rounded py-1.5 text-micro font-bold text-ink hover:text-paper uppercase tracking-wide transition-colors"
                    >
                        {submitting ? 'Starting...' : 'Enable'}
                    </button>
                </>
            )}

            {step === 'confirming' && enrollment && (
                <form onSubmit={(e) => void handleConfirm(e)} className="space-y-2">
                    <p className="text-micro text-steel leading-relaxed">Scan this with Google Authenticator, Authy, or 1Password:</p>
                    <img src={enrollment.qrCodeDataUrl} alt="MFA QR code" className="w-32 h-32 mx-auto rounded bg-paper p-1.5" />
                    <p className="text-micro text-steel text-center">Can&apos;t scan? Enter this manually: <span className="font-mono text-carbon break-all">{enrollment.manualEntrySecret}</span></p>
                    <input
                        type="text"
                        inputMode="numeric"
                        placeholder="6-digit code"
                        required
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-data text-paper text-center tracking-[0.3em] font-mono focus:outline-none focus:border-route transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={submitting || code.length !== 6}
                        className="w-full bg-route hover:bg-route-deep disabled:opacity-50 rounded py-1.5 text-micro font-bold text-ink hover:text-paper uppercase tracking-wide transition-colors"
                    >
                        {submitting ? 'Confirming...' : 'Confirm'}
                    </button>
                </form>
            )}

            {step === 'recovery-codes' && (
                <div className="space-y-2">
                    <div className="p-2 bg-hazard/10 border border-hazard/30 rounded text-micro text-hazard leading-relaxed">
                        Save these recovery codes now — each works once, and this is the only time they&apos;ll be shown. Use one if you lose your authenticator device.
                    </div>
                    <div className="grid grid-cols-2 gap-1 font-mono text-micro text-paper bg-ink rounded p-2">
                        {recoveryCodes.map((rc) => <div key={rc}>{rc}</div>)}
                    </div>
                    <button
                        type="button"
                        onClick={copyRecoveryCodes}
                        className="w-full flex items-center justify-center gap-1.5 border border-line/15 rounded py-1.5 text-micro font-bold text-steel hover:text-paper uppercase tracking-wide transition-colors"
                    >
                        {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
                        {copied ? 'Copied' : 'Copy all'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setStep('on')}
                        className="w-full bg-route hover:bg-route-deep rounded py-1.5 text-micro font-bold text-ink hover:text-paper uppercase tracking-wide transition-colors"
                    >
                        Done
                    </button>
                </div>
            )}

            {step === 'on' && (
                <>
                    <p className="text-micro text-tarp font-bold">Enabled</p>
                    <button
                        type="button"
                        onClick={() => setStep('disabling')}
                        className="w-full border border-rust/30 text-rust hover:bg-rust/10 rounded py-1.5 text-micro font-bold uppercase tracking-wide transition-colors"
                    >
                        Disable
                    </button>
                </>
            )}

            {step === 'disabling' && (
                <form onSubmit={(e) => void handleDisable(e)} className="space-y-2">
                    <input
                        type="password"
                        placeholder="Current password"
                        required
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        className="w-full bg-ink border border-line/15 rounded px-2 py-1.5 text-data text-paper focus:outline-none focus:border-route transition-colors"
                    />
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => { setStep('on'); setError(null); setDisablePassword(''); }}
                            className="flex-1 border border-line/15 rounded py-1.5 text-micro font-bold text-steel hover:text-paper uppercase tracking-wide transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 bg-rust hover:bg-rust/80 disabled:opacity-50 rounded py-1.5 text-micro font-bold text-ink uppercase tracking-wide transition-colors"
                        >
                            {submitting ? 'Disabling...' : 'Confirm'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

interface StatChipProps {
    icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    label: string;
    value: number;
    /* Whether this figure is currently a problem — not what category it
       belongs to. These four chips each used to carry a fixed colour, so
       "Incidents" was permanently rust-tinted whether there were incidents
       or none, and the row was four different colours at rest. Colour that
       is always on cannot signal anything. Now the row sits neutral while
       the operation is healthy, and exactly the chip that needs a
       dispatcher goes hot. */
    alert?: boolean;
}

function StatChip({ icon: Icon, label, value, alert = false }: StatChipProps) {
    return (
        <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md border shrink-0 transition-colors ${
            alert ? 'bg-rust/10 border-rust/40' : 'bg-ink/60 border-line/10'
        }`}>
            <Icon size={14} strokeWidth={2.5} className={alert ? 'text-rust' : 'text-steel'} />
            <div className="leading-none">
                <div className={`ops-figure text-lead ${alert ? 'text-rust' : 'text-paper'}`}>{value}</div>
                <div className="data-label mt-1 text-steel whitespace-nowrap">{label}</div>
            </div>
        </div>
    );
}

// Full-width app shell header, replacing the old sidebar-embedded brand
// block + separate UserProfile card. Session identity, connection health,
// and the top-line KPIs all live here now so they're visible regardless of
// which secondary tab a dispatcher has open.
// Previously two always-visible feeds squeezed inside OrdersPanel (a
// ~112px scrollable box each), competing for space with the actual
// order-creation form and dispatch queue right next to them. Both were
// already fed by live socket state (orderActivity/recentDeliveries in
// SocketContext), which is exactly what a notification-bell pattern is
// for — glanceable, not something that needs permanent screen real
// estate. Moved here since this header is shown on every dashboard view,
// not just the order-creation panel.
const NOTIF_LAST_SEEN_KEY = 'inzira_notif_last_seen_at';

function NotificationBell() {
    const { jwtToken, orderActivity, recentDeliveries, setViewingImage, resolveDriverName } = useSocket();
    const [open, setOpen] = useState(false);
    // Persisted to localStorage rather than kept as a plain in-memory
    // count — a page refresh remounts this component from scratch, which
    // reset a bare useState count back to 0 while recentDeliveries (fetched
    // fresh from the backend on every load) didn't reset with it, so the
    // badge came back showing things already seen in the previous session.
    // Comparing against a stored timestamp instead survives the reload,
    // and also stays correct if either feed ever evicts old entries — a
    // simple item count doesn't handle a list shrinking, a timestamp
    // comparison doesn't care.
    const [lastSeenAt, setLastSeenAt] = useState(() => localStorage.getItem(NOTIF_LAST_SEEN_KEY) || '');
    const unseenCount =
        orderActivity.filter((a) => a.timestamp > lastSeenAt).length +
        recentDeliveries.filter((d) => d.confirmed_at > lastSeenAt).length;

    const toggle = () => {
        setOpen((v) => !v);
        const now = new Date().toISOString();
        localStorage.setItem(NOTIF_LAST_SEEN_KEY, now);
        setLastSeenAt(now);
    };

    return (
        <div className="relative">
            <button
                onClick={toggle}
                title="Recent activity"
                aria-label="Recent activity"
                aria-expanded={open}
                className="relative flex items-center px-2 py-1.5 rounded-md border border-line/15 text-steel hover:text-paper transition-colors"
            >
                <Bell size={14} strokeWidth={2.5} />
                {unseenCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rust text-ink text-micro font-bold flex items-center justify-center leading-none">
                        {unseenCount > 9 ? '9+' : unseenCount}
                    </span>
                )}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-80 bg-panel border border-line/15 rounded-md shadow-xl z-40 max-h-[80vh] overflow-y-auto p-3 space-y-3">
                        {orderActivity.length === 0 && recentDeliveries.length === 0 ? (
                            <div className="text-micro text-steel text-center py-4">No recent activity yet.</div>
                        ) : (
                            <>
                                {orderActivity.length > 0 && (
                                    <div className="space-y-1">
                                        <div className="text-micro text-steel uppercase tracking-wider font-mono">Recent activity</div>
                                        <div className="space-y-1">
                                            {orderActivity.map((a, idx) => (
                                                <div key={`${a.orderId}-${a.timestamp}-${idx}`} className="flex justify-between text-micro font-mono text-steel">
                                                    <span className="truncate max-w-[180px]">#{a.orderId} {a.cargo_description}</span>
                                                    <span className="text-carbon font-bold">{a.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {recentDeliveries.length > 0 && (
                                    <div className="space-y-1 pt-2 border-t border-line/10">
                                        <div className="text-micro text-steel uppercase tracking-wider font-mono">Recent deliveries &middot; proof of delivery</div>
                                        <div className="space-y-1">
                                            {recentDeliveries.map((d) => (
                                                <div key={d.id} className={`flex justify-between items-center p-1.5 rounded border text-micro ${d.location_flagged ? 'bg-hazard/10 border-hazard/40' : 'bg-ink/60 border-line/10'}`}>
                                                    <div className="min-w-0">
                                                        <div className="text-paper truncate max-w-[160px] flex items-center gap-1">
                                                            {d.location_flagged && (
                                                                <span title={`Confirmed ${Math.round(d.distance_from_target_m || 0)}m from the delivery point`}>
                                                                    <AlertTriangle size={10} strokeWidth={2.5} className="text-hazard shrink-0" />
                                                                </span>
                                                            )}
                                                            #{d.order_id} {d.cargo_description}
                                                        </div>
                                                        <div className="text-steel font-mono">
                                                            {resolveDriverName(d.driver_name)} &middot; {new Date(d.confirmed_at).toLocaleTimeString()}
                                                            {d.location_flagged && <span className="text-hazard"> &middot; {Math.round(d.distance_from_target_m || 0)}m off</span>}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setViewingImage(d.photo_url)}
                                                            className="flex items-center gap-1 bg-tarp/15 border border-tarp/40 text-tarp rounded px-2 py-1 font-bold uppercase"
                                                        >
                                                            <ImageIcon size={10} strokeWidth={2.5} />
                                                            Photo
                                                        </button>
                                                        <OrderHistoryToggle orderId={d.order_id} jwtToken={jwtToken} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// Two workspaces, one segmented control. Deliberately next to the brand and
// not among the account/connection controls on the right: this is where you
// ARE, not something you do. `act` count on Monitor so the switch itself says
// whether anything is waiting over there — otherwise splitting the screens
// just hides problems behind a tab.
export default function TopCommandBar({ workspace, onSwitchWorkspace }: {
    workspace: 'dispatch' | 'monitor';
    onSwitchWorkspace: (w: 'dispatch' | 'monitor') => void;
}) {
    const { userRole, jwtToken, isConnected, toggleNetworkStream, logout, trackedAssets, violations, activeOrders, inFlightOrders, setShowAdminCenter } = useSocket();
    const [menuOpen, setMenuOpen] = useState(false);
    const now = useNow();
    // Matches the map/fleet-list definition of "active" — a driver whose
    // last ping is old shouldn't inflate this count.
    const activeAssetCount = Object.values(trackedAssets).filter((asset) => classifyFreshness(asset.lastSeen, now) !== 'offline').length;

    return (
        <header className="h-16 shrink-0 bg-panel border-b border-line/10 flex items-center justify-between px-5 gap-4 relative z-30">
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-md bg-route/15 border border-route/35 flex items-center justify-center text-route">
                    <InziraMark size={24} />
                </div>
                <div className="hidden sm:block">
                    {/* The wordmark is the one place on the board that uses the
                        display face, so the tool reads as the same product as
                        the site rather than as generic admin software. */}
                    <h1 className="display-tight text-lead text-paper leading-none">Inzira</h1>
                    <p className="data-label mt-1 text-steel">Dispatch Control</p>
                </div>
            </div>

            <nav aria-label="Workspace" className="flex shrink-0 items-center gap-1 rounded-md border border-line/15 p-0.5">
                {([['dispatch', 'Dispatch'], ['monitor', 'Monitor']] as const).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onSwitchWorkspace(id)}
                        aria-current={workspace === id ? 'page' : undefined}
                        className={`focus-ring rounded px-3 py-1.5 text-micro font-semibold uppercase tracking-wide transition-colors ${
                            workspace === id ? 'bg-panel-soft text-paper' : 'text-steel hover:text-paper'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                {/* Ordered as the work actually flows — queued, moving,
                    visible, wrong — rather than as four unrelated counts.
                    "Active assets" used to sit first and it was quietly
                    dishonest: it counts DRIVERS whose last GPS ping is fresh,
                    while "In flight" counts ORDERS. Two different units side
                    by side, so "0 active assets" next to "16 in flight" read
                    as a broken board when it was a true and rather important
                    statement — sixteen loads moving with nobody reporting a
                    position. Renamed to say what it measures, and placed
                    immediately after In flight so the pair reads as the
                    sentence it is. */}
                <StatChip icon={Package} label="Dispatch queue" value={activeOrders.length} />
                <StatChip icon={Radio} label="In flight" value={inFlightOrders.length} />
                <StatChip icon={Truck} label="Reporting now" value={activeAssetCount} />
                <StatChip icon={AlertTriangle} label="Incidents" value={violations.length} alert={violations.length > 0} />
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
                {userRole === 'admin' && (
                    <button
                        onClick={() => setShowAdminCenter(true)}
                        title="Open admin control center"
                        className="focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-micro font-semibold uppercase tracking-wide border border-route/30 bg-route/10 text-route hover:bg-route/20 transition-colors"
                    >
                        <ShieldCheck size={12} strokeWidth={2.5} />
                        Admin center
                    </button>
                )}
                <button
                    onClick={toggleNetworkStream}
                    title={isConnected ? 'Click to disconnect' : 'Click to reconnect'}
                    className={`focus-ring flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-micro font-semibold uppercase tracking-wide border transition-colors ${
                        isConnected ? 'bg-tarp/10 border-tarp/30 text-tarp' : 'bg-rust/10 border-rust/30 text-rust animate-pulse'
                    }`}
                >
                    {isConnected ? <PlugZap size={12} strokeWidth={2.5} /> : <Unplug size={12} strokeWidth={2.5} />}
                    {isConnected ? 'Live' : 'Reconnecting'}
                </button>

                {userRole && (
                    <span className="px-2 py-1 rounded text-micro font-mono font-semibold uppercase bg-carbon/15 border border-carbon/40 text-carbon">
                        {userRole}
                    </span>
                )}

                <NotificationBell />

                <div className="relative">
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        title="Account"
                        aria-label="Account menu"
                        aria-expanded={menuOpen}
                        className="focus-ring flex items-center gap-1 px-2 py-1.5 rounded-md border border-line/15 text-steel hover:text-paper transition-colors"
                    >
                        <KeyRound size={13} strokeWidth={2.5} />
                        <ChevronDown size={11} strokeWidth={2.5} />
                    </button>
                    {menuOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                            <div className="absolute right-0 top-full mt-2 w-60 bg-panel border border-line/15 rounded-md shadow-xl z-40 max-h-[80vh] overflow-y-auto">
                                <ChangePasswordForm jwtToken={jwtToken} />
                                <TwoFactorSection jwtToken={jwtToken} />
                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-2 px-3 py-2.5 text-data font-bold text-rust hover:bg-rust/10 uppercase tracking-wide border-t border-line/10 transition-colors"
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
