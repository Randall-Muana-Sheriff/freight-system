// src/components/AdminUserGovernance.tsx — dispatcher/admin account
// creation and role management. Drivers are onboarded separately via
// InviteDriverPanel, not through this panel.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch, setUserStatus } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import type { StaffUser, UserRole } from '../types';
import { useDialog } from './DialogProvider';

const EMPTY_NEW_USER = { username: '', password: '', role: 'dispatcher' as UserRole };

export default function AdminUserGovernance() {
    const { confirm } = useDialog();
    const { jwtToken, userRole } = useSocket();
    const [users, setUsers] = useState<StaffUser[]>([]);
    // Drivers are governed elsewhere (approval + document verification),
    // not through role changes here — /api/users still returns everyone,
    // so filter down to just the accounts this panel is actually meant to
    // manage.
    const staffUsers = useMemo(() => users.filter((u) => u.role !== 'driver'), [users]);
    // Drivers are listed here too now, for one reason: suspension. When
    // somebody leaves, this is the only screen that can stop their account
    // signing back in, and drivers are who actually leave.
    const driverUsers = useMemo(
        () => users.filter((u) => u.role === 'driver').sort((a, b) => (a.status === 'suspended' ? -1 : 0) - (b.status === 'suspended' ? -1 : 0)),
        [users]
    );
    const [loading, setLoading] = useState(false);
    // Shared by fetchUsers and handleRoleChange, which unlike account
    // creation have no "busy" concept in the UI today — left as plain
    // state rather than forced into the hook below just for consistency.
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
    const { busy: creating, error: createError, run: runCreate } = useAsyncAction();
    const displayError = error || createError;

    // Confirmed first: suspending signs someone out immediately and stops
    // dispatch assigning them, which is not something to do on a misclick.
    const handleStatusChange = async (user: StaffUser) => {
        const next = user.status === 'suspended' ? 'approved' : 'suspended';
        const who = user.fullName || user.username;
        if (next === 'suspended' && !(await confirm({
            title: `Suspend ${who}?`,
            body: 'They will be signed out immediately and cannot log in or be assigned work.\n\nTheir history is kept, and you can reinstate them at any time.',
            confirmLabel: 'Suspend',
            tone: 'danger',
        }))) return;

        setError(null);
        try {
            await setUserStatus(user.id, next, jwtToken);
            setSuccessMsg(next === 'suspended' ? `${who} suspended` : `${who} reinstated`);
            await fetchUsers();
        } catch (err) {
            setError((err as Error).message || 'Could not change that account.');
        }
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setUsers(await apiFetch('/api/users', { token: jwtToken }) as StaffUser[]);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin') {
            // Call fetch asynchronously to avoid sync setState inside effect
            setTimeout(() => {
                void fetchUsers();
            }, 0);
        }
    }, [userRole, fetchUsers]);

    const handleRoleChange = async (userId: number, newRole: string) => {
        setError(null);
        setSuccessMsg(null);
        try {
            await apiFetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                token: jwtToken,
                body: { role: newRole },
            });
            setSuccessMsg(`User role updated to ${newRole}`);
            void fetchUsers();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        await runCreate(async () => {
            await apiFetch('/api/users', {
                method: 'POST',
                token: jwtToken,
                body: newUser,
            });
            setSuccessMsg(`Created ${newUser.role} account "${newUser.username}"`);
            setNewUser(EMPTY_NEW_USER);
            void fetchUsers();
        });
    };

    if (userRole !== 'admin') {
        return null;
    }

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold tracking-tight text-paper font-sans">User &amp; role governance</h3>
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

            <form onSubmit={(e) => void handleCreateUser(e)} className="bg-ink/60 p-3.5 rounded border border-line/10 space-y-2.5">
                <div className="text-[9px] text-steel uppercase tracking-wider">Create dispatcher / admin account</div>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_120px_auto] gap-2.5 items-end">
                    <label className="block">
                        <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Username</span>
                        <input
                            type="text"
                            placeholder="e.g. peter.k"
                            required
                            value={newUser.username}
                            onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                            className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
                        />
                    </label>
                    <label className="block">
                        <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Password</span>
                        <input
                            type="password"
                            placeholder="min. 8 characters"
                            required
                            value={newUser.password}
                            onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                            className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors"
                        />
                    </label>
                    <label className="block">
                        <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Role</span>
                        <select
                            value={newUser.role}
                            onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as UserRole }))}
                            className="w-full bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-carbon font-bold focus:outline-none focus:border-route"
                        >
                            <option value="dispatcher">DISPATCHER</option>
                            <option value="admin">ADMIN</option>
                        </select>
                    </label>
                    <button
                        type="submit"
                        disabled={creating}
                        className="bg-route hover:bg-route-deep disabled:opacity-50 rounded px-4 py-1.5 text-[11px] font-bold text-ink hover:text-paper uppercase whitespace-nowrap"
                    >
                        {creating ? '...' : 'Create'}
                    </button>
                </div>
            </form>

            <div className="max-h-[420px] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {staffUsers.length === 0 && !loading && (
                    <div className="text-steel text-center py-2 md:col-span-2">No dispatcher/admin accounts found.</div>
                )}
                {staffUsers.map((u) => (
                    <div key={u.id} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-center">
                        <div className="truncate max-w-[220px]">
                            <div className="text-paper font-bold flex items-center gap-1.5">
                                {u.username || u.email}
                                {u.status === 'rejected' && (
                                    <span className="text-[8px] bg-rust/15 text-rust rounded px-1 py-0.5 uppercase">Rejected</span>
                                )}
                                {u.status === 'suspended' && (
                                    <span className="text-[8px] bg-rust/15 text-rust rounded px-1 py-0.5 uppercase">Suspended</span>
                                )}
                            </div>
                            <div className="text-[9px] text-steel">ID: {u.id}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <select
                                value={u.role}
                                onChange={(e) => void handleRoleChange(u.id, e.target.value)}
                                disabled={u.status === 'suspended'}
                                className="bg-panel border border-line/15 rounded px-2 py-1 text-[10px] text-carbon font-bold focus:outline-none focus:border-route disabled:opacity-40"
                            >
                                <option value="dispatcher">DISPATCHER</option>
                                <option value="admin">ADMIN</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => void handleStatusChange(u)}
                                title={u.status === 'suspended' ? 'Reinstate this account' : 'Suspend this account'}
                                className={`rounded px-2 py-1 text-[9px] font-bold uppercase border ${
                                    u.status === 'suspended'
                                        ? 'border-tarp/40 text-tarp hover:bg-tarp/10'
                                        : 'border-rust/40 text-rust hover:bg-rust/10'
                                }`}
                            >
                                {u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Drivers, for suspension only — role changes and document
                verification stay where they already live. Without this the
                one group that actually leaves a freight company had no
                account control anywhere in the dashboard. */}
            {driverUsers.length > 0 && (
                <div className="pt-3 mt-3 border-t border-line/10 space-y-1.5">
                    <div className="text-[9px] text-steel uppercase tracking-wider font-mono">
                        Drivers ({driverUsers.length}) &middot; suspend or reinstate
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                        {driverUsers.map((d) => (
                            <div key={d.id} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-center gap-2">
                                <div className="truncate">
                                    <div className="text-paper font-bold flex items-center gap-1.5 text-[11px]">
                                        {d.fullName || d.username}
                                        {d.status === 'suspended' && (
                                            <span className="text-[8px] bg-rust/15 text-rust rounded px-1 py-0.5 uppercase">Suspended</span>
                                        )}
                                    </div>
                                    <div className="text-[9px] text-steel font-mono">{d.username}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleStatusChange(d)}
                                    className={`shrink-0 rounded px-2 py-1 text-[9px] font-bold uppercase border ${
                                        d.status === 'suspended'
                                            ? 'border-tarp/40 text-tarp hover:bg-tarp/10'
                                            : 'border-rust/40 text-rust hover:bg-rust/10'
                                    }`}
                                >
                                    {d.status === 'suspended' ? 'Reinstate' : 'Suspend'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
