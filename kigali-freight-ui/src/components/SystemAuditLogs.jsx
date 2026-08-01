// src/components/SystemAuditLogs.jsx
import { useState, useEffect, useCallback } from 'react';
import { ScrollText } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function SystemAuditLogs() {
    const { jwtToken, userRole, socket, resolveDriverName } = useSocket();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch('/api/audit-logs', { token: jwtToken });
            setLogs(data);
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
                fetchLogs();
            }, 0);
        }
    }, [userRole, fetchLogs]);

    // Real-time log updates via Socket.io
    useEffect(() => {
        if (!socket || userRole !== 'admin') return;

        const handleNewLog = (newLog) => {
            setLogs((prev) => [newLog, ...prev.slice(0, 49)]); // Keep last 50 logs
        };

        socket.on('auditLogAppended', handleNewLog);
        return () => {
            socket.off('auditLogAppended', handleNewLog);
        };
    }, [socket, userRole]);

    if (userRole !== 'admin') {
        return null;
    }

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
            <div className="flex justify-between items-center">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <ScrollText size={14} strokeWidth={2.5} className="text-steel" />
                    System audit log
                </h3>
                {loading && <span className="text-[9px] text-carbon animate-pulse">Syncing...</span>}
            </div>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">
                    {error}
                </div>
            )}

            <div className="max-h-[560px] overflow-y-auto space-y-1.5">
                {logs.length === 0 && !loading && (
                    <div className="text-steel text-center py-2">No audit events recorded yet.</div>
                )}
                {logs.map((log, idx) => (
                    <div key={log.id || idx} className="bg-ink/60 p-2.5 rounded border border-line/10 flex justify-between items-start text-[10px]">
                        <div>
                            <span className="text-carbon font-bold uppercase">[{log.actionType}]</span>{' '}
                            <span className="text-steel">{log.description}</span>
                            <div className="text-[9px] text-steel/70 mt-0.5">Operator: {log.username ? resolveDriverName(log.username) : 'System'}</div>
                        </div>
                        <span className="text-[9px] text-steel font-mono whitespace-nowrap ml-2">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
