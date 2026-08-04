// src/components/KioskDevicesPanel.tsx — admin-only provisioning for
// read-only wall displays (control room, dispatch desk, warehouse). Each
// device gets its own long-lived, individually revocable token — see
// services/kioskAuthService.js — rather than sharing a staff login or a
// single unrevocable secret.
import { useState, useEffect, useCallback } from 'react';
import { MonitorPlay, Copy, Check, Trash2 } from 'lucide-react';
import { createKioskDevice, listKioskDevices, revokeKioskDevice, type CreateKioskDeviceResult } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { formatLastSeen, useNow } from '../utils/telemetryFreshness';
import type { KioskDevice } from '../types';

// The kiosk frontend heartbeats every 3 minutes (see KioskApp.tsx) — this
// is deliberately looser than that (enough room for one or two missed
// beats from a slow network) rather than reusing telemetryFreshness.ts's
// vehicle-ping thresholds, which are tuned for a ~15-25s GPS cadence and
// would flag a perfectly healthy display as stale within two minutes.
const KIOSK_STALE_AFTER_MS = 10 * 60 * 1000;

export default function KioskDevicesPanel() {
    const { jwtToken, userRole } = useSocket();
    const now = useNow(30 * 1000);
    const [devices, setDevices] = useState<KioskDevice[]>([]);
    const [label, setLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreateKioskDeviceResult | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokingId, setRevokingId] = useState<number | null>(null);

    const loadDevices = useCallback(async () => {
        try {
            setDevices(await listKioskDevices(jwtToken));
        } catch (err) {
            setError((err as Error).message);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole !== 'admin') return;
        void loadDevices();
        // Refetches while this panel stays open so "last seen" reflects
        // reality without the admin needing to manually reload — a stuck
        // display should visibly go stale on its own.
        const interval = setInterval(() => void loadDevices(), 30 * 1000);
        return () => clearInterval(interval);
    }, [userRole, loadDevices]);

    const kioskUrl = created ? `${window.location.origin}/kiosk?token=${created.token}` : '';

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setCreated(null);
        setCopied(false);
        setCreating(true);
        try {
            const device = await createKioskDevice(label, jwtToken);
            setCreated(device);
            setLabel('');
            void loadDevices();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = () => {
        if (!kioskUrl) return;
        void navigator.clipboard?.writeText(kioskUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevoke = async (id: number) => {
        if (!window.confirm('Revoke this display? It will lose access on its next data refresh.')) return;
        setRevokingId(id);
        try {
            await revokeKioskDevice(id, jwtToken);
            void loadDevices();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setRevokingId(null);
        }
    };

    if (userRole !== 'admin') {
        return null;
    }

    const activeDevices = devices.filter((d) => !d.revokedAt);

    return (
        <div className="space-y-4">
            <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <MonitorPlay size={14} strokeWidth={2.5} className="text-steel" />
                    Kiosk displays
                </h3>
                <p className="text-steel text-[10.5px] leading-relaxed font-sans">
                    Generate a link for a wall-mounted screen — control room, dispatch desk, warehouse. It shows the live
                    fleet map and status with no login and no way to change anything. Open the link once on that screen's
                    browser; it stays signed in from then on.
                </p>

                {error && <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">{error}</div>}

                <form onSubmit={(e) => void handleCreate(e)} className="bg-ink/60 p-3.5 rounded border border-line/10 flex items-end gap-2.5">
                    <label className="block flex-1">
                        <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Label</span>
                        <input
                            type="text"
                            placeholder="e.g. Control Room"
                            required
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={creating}
                        className="bg-route hover:bg-route-deep disabled:opacity-50 rounded px-4 py-1.5 text-[11px] font-bold text-ink hover:text-paper uppercase whitespace-nowrap"
                    >
                        {creating ? '...' : 'Generate link'}
                    </button>
                </form>

                {created && (
                    <div className="p-3 bg-tarp/10 border border-tarp/30 rounded space-y-2">
                        <div className="text-tarp font-bold">Display &quot;{created.label}&quot; provisioned</div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-paper break-all">{kioskUrl}</span>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="flex items-center gap-1 text-[10px] text-carbon hover:text-paper transition-colors shrink-0"
                            >
                                {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                        <div className="text-steel text-[10px] font-sans">This link won&apos;t be shown again — open it on the display now, or copy it somewhere safe.</div>
                    </div>
                )}
            </div>

            <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
                <h3 className="text-sm font-bold tracking-tight text-paper font-sans">Active displays</h3>
                <div className="space-y-1.5">
                    {activeDevices.length === 0 && <div className="text-steel text-center py-2">No kiosk displays yet.</div>}
                    {activeDevices.map((d) => {
                        const isStale = !d.lastSeenAt || now - new Date(d.lastSeenAt).getTime() > KIOSK_STALE_AFTER_MS;
                        return (
                            <div key={d.id} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-center">
                                <div>
                                    <div className="text-paper font-bold">{d.label}</div>
                                    <div className="text-[9px] text-steel">Provisioned {new Date(d.createdAt).toLocaleDateString()}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide ${isStale ? 'text-rust' : 'text-tarp'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isStale ? 'bg-rust' : 'bg-tarp'}`} />
                                        {d.lastSeenAt ? `Seen ${formatLastSeen(d.lastSeenAt, now)}` : 'Never connected'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void handleRevoke(d.id)}
                                        disabled={revokingId === d.id}
                                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rust hover:text-paper disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                        <Trash2 size={11} strokeWidth={2.5} />
                                        {revokingId === d.id ? '...' : 'Revoke'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
