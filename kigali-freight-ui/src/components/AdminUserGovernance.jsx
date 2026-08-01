// src/components/AdminUserGovernance.jsx — dispatcher/admin account
// creation and role management. Drivers are onboarded separately via
// InviteDriverPanel, not through this panel.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/api';
import { useSocket } from '../context/SocketContext';

const EMPTY_NEW_USER = { username: '', password: '', role: 'dispatcher' };

export default function AdminUserGovernance() {
    const { jwtToken, userRole } = useSocket();
    const [users, setUsers] = useState([]);
    // Drivers are governed elsewhere (approval + document verification),
    // not through role changes here — /api/users still returns everyone,
    // so filter down to just the accounts this panel is actually meant to
    // manage.
    const staffUsers = useMemo(() => users.filter((u) => u.role !== 'driver'), [users]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
    const [creating, setCreating] = useState(false);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setUsers(await apiFetch('/api/users', { token: jwtToken }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [jwtToken]);

    useEffect(() => {
        if (userRole === 'admin') {
            // Call fetch asynchronously to avoid sync setState inside effect
            setTimeout(() => {
                fetchUsers();
            }, 0);
        }
    }, [userRole, fetchUsers]);

    const handleRoleChange = async (userId, newRole) => {
        setError(null);
        setSuccessMsg(null);
        try {
            await apiFetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                token: jwtToken,
                body: { role: newRole },
            });
            setSuccessMsg(`User role updated to ${newRole}`);
            fetchUsers();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        setCreating(true);
        try {
            await apiFetch('/api/users', {
                method: 'POST',
                token: jwtToken,
                body: newUser,
            });
            setSuccessMsg(`Created ${newUser.role} account "${newUser.username}"`);
            setNewUser(EMPTY_NEW_USER);
            fetchUsers();
        } catch (err) {
            setError(err.message);
        } finally {
            setCreating(false);
        }
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

            <form onSubmit={handleCreateUser} className="bg-ink/60 p-3.5 rounded border border-line/10 space-y-2.5">
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
                            onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
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

            <div className="max-h-[420px] overflow-y-auto space-y-1.5">
                {staffUsers.length === 0 && !loading && (
                    <div className="text-steel text-center py-2">No dispatcher/admin accounts found.</div>
                )}
                {staffUsers.map((u) => (
                    <div key={u.id} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-center">
                        <div className="truncate max-w-[220px]">
                            <div className="text-paper font-bold flex items-center gap-1.5">
                                {u.username || u.email}
                                {u.status === 'rejected' && (
                                    <span className="text-[8px] bg-rust/15 text-rust rounded px-1 py-0.5 uppercase">Rejected</span>
                                )}
                            </div>
                            <div className="text-[9px] text-steel">ID: {u.id}</div>
                        </div>
                        <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-panel border border-line/15 rounded px-2 py-1 text-[10px] text-carbon font-bold focus:outline-none focus:border-route"
                        >
                            <option value="dispatcher">DISPATCHER</option>
                            <option value="admin">ADMIN</option>
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
}
