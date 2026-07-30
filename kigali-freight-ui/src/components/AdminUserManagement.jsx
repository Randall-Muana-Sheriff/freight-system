// src/components/AdminUserManagement.jsx
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api';
import { useSocket } from '../context/SocketContext';

const EMPTY_NEW_USER = { username: '', password: '', role: 'dispatcher' };

export default function AdminUserManagement() {
    const { jwtToken, userRole } = useSocket();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);
    const [newUser, setNewUser] = useState(EMPTY_NEW_USER);
    const [creating, setCreating] = useState(false);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/api/users', { token: jwtToken });
            setUsers(data);
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
                <h3 className="text-sm font-bold tracking-tight text-paper font-sans">User & role governance</h3>
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

            <form onSubmit={handleCreateUser} className="bg-ink/60 p-2.5 rounded border border-line/10 space-y-2">
                <div className="text-[9px] text-steel uppercase tracking-wider">Create dispatcher / admin account</div>
                <div className="flex gap-1.5">
                    <input
                        type="text"
                        placeholder="username"
                        required
                        value={newUser.username}
                        onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                        className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper focus:outline-none focus:border-route transition-colors"
                    />
                    <input
                        type="password"
                        placeholder="password"
                        required
                        value={newUser.password}
                        onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                        className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-paper focus:outline-none focus:border-route transition-colors"
                    />
                    <select
                        value={newUser.role}
                        onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                        className="bg-panel border border-line/15 rounded px-1.5 py-1 text-[10px] text-carbon font-bold focus:outline-none focus:border-route"
                    >
                        <option value="dispatcher">DISPATCHER</option>
                        <option value="admin">ADMIN</option>
                    </select>
                    <button
                        type="submit"
                        disabled={creating}
                        className="bg-route hover:bg-route-deep disabled:opacity-50 rounded px-2.5 py-1 text-[10px] font-bold text-ink hover:text-paper uppercase"
                    >
                        {creating ? '...' : 'Create'}
                    </button>
                </div>
            </form>

            <div className="max-h-36 overflow-y-auto space-y-1.5">
                {users.length === 0 && !loading && (
                    <div className="text-steel text-center py-2">No registered operator profiles found.</div>
                )}
                {users.map((u) => (
                    <div key={u.id} className="bg-ink/60 p-2 rounded border border-line/10 flex justify-between items-center">
                        <div className="truncate max-w-[130px]">
                            <div className="text-paper font-bold">{u.username || u.email}</div>
                            <div className="text-[9px] text-steel">ID: {u.id}</div>
                        </div>
                        <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-panel border border-line/15 rounded px-1.5 py-0.5 text-[10px] text-carbon font-bold focus:outline-none focus:border-route"
                        >
                            <option value="dispatcher">DISPATCHER</option>
                            <option value="admin">ADMIN</option>
                            <option value="driver">DRIVER</option>
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
}
