// src/components/HubsPanel.tsx — hubs previously only ever existed via a
// one-time hardcoded seed in the backend's migration script; there was no
// way to add, move, or retire one without a direct database edit. This is
// the admin/dispatcher-facing CRUD for them.
import { useState } from 'react';
import { Warehouse, MapPin, Pencil, Trash2, X } from 'lucide-react';
import { createHub, updateHub, deleteHub } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import { useAsyncAction, useKeyedAsyncAction } from '../hooks/useAsyncAction';
import type { Hub, LatLng } from '../types';
import { useDialog } from './DialogProvider';

interface HubsPanelProps {
    hubTargetMode: boolean;
    setHubTargetMode: (value: boolean) => void;
    newHubCoords: LatLng | null;
    clearNewHubCoords: () => void;
}

const EMPTY_FORM = { name: '', code: '' };

export default function HubsPanel({ hubTargetMode, setHubTargetMode, newHubCoords, clearNewHubCoords }: HubsPanelProps) {
    const { confirm } = useDialog();
    const { jwtToken, savedHubs, refreshFeeds } = useSocket();
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState<number | null>(null);
    const { busy: submitting, error: submitError, setError: setSubmitError, run: runSubmit } = useAsyncAction();
    const { busyKey: deletingId, error: deleteError, run: runDelete } = useKeyedAsyncAction<number, void>();
    const error = submitError || deleteError;

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        clearNewHubCoords();
    };

    const startEdit = (hub: Hub) => {
        setEditingId(hub.id);
        setForm({ name: hub.name, code: hub.code });
        setHubTargetMode(false);
        // Clear the picker rather than pre-fill it. The behaviour is right —
        // editingHub's own coordinates are used as the fallback further down,
        // so "just change the name" still works without re-picking — but the
        // comment said the opposite of the line under it and would have
        // misled the next edit.
        clearNewHubCoords();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const coords = newHubCoords;
        const editingHub = editingId ? savedHubs.find((h) => h.id === editingId) : null;
        const lat = coords ? coords[0] : editingHub?.lat;
        const lng = coords ? coords[1] : editingHub?.lng;

        if (!form.name.trim() || !form.code.trim()) {
            setSubmitError('Hub name and code are both required.');
            return;
        }
        if (lat === undefined || lng === undefined) {
            setSubmitError('Pick a location on the map first.');
            return;
        }

        await runSubmit(async () => {
            const payload = { name: form.name.trim(), code: form.code.trim(), lat, lng };
            if (editingId) {
                await updateHub(editingId, payload, jwtToken);
            } else {
                await createHub(payload, jwtToken);
            }
            resetForm();
            void refreshFeeds();
        });
    };

    const handleDelete = async (hub: Hub) => {
        if (!(await confirm({
            title: `Delete hub ${hub.name}?`,
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            tone: 'danger',
        }))) return;
        await runDelete(hub.id, async () => {
            await deleteHub(hub.id, jwtToken);
            void refreshFeeds();
        });
    };

    const editingHub = editingId ? savedHubs.find((h) => h.id === editingId) : null;
    const effectiveCoords: LatLng | null = newHubCoords || (editingHub ? [editingHub.lat, editingHub.lng] : null);

    return (
        <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3">
            <h3 className="flex items-center gap-1.5 text-body font-bold tracking-tight text-paper">
                <Warehouse size={14} strokeWidth={2.5} className="text-steel" />
                Dispatch hubs ({savedHubs.length})
            </h3>

            {error && (
                <div className="p-2 bg-rust/10 border border-rust/30 text-rust text-data rounded font-mono">
                    {error}
                </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 bg-ink/60 p-2.5 rounded border border-line/10">
                <div className="flex items-center justify-between">
                    <div className="text-micro text-steel uppercase tracking-wider font-mono">
                        {editingId ? `Editing hub #${editingId}` : 'New hub'}
                    </div>
                    {editingId && (
                        <button type="button" onClick={resetForm} aria-label="Cancel editing" title="Cancel editing" className="text-steel hover:text-paper">
                            <X size={12} strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <input
                    type="text"
                    placeholder="Hub name (e.g. Kacyiru Distribution Point)"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60 focus:outline-none focus:border-route transition-colors"
                />
                <input
                    type="text"
                    placeholder="Code (e.g. KGL-KCY)"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    className="w-full bg-panel border border-line/15 rounded px-2 py-1 text-data text-paper placeholder-steel/60 font-mono uppercase focus:outline-none focus:border-route transition-colors"
                />
                <button
                    type="button"
                    onClick={() => setHubTargetMode(!hubTargetMode)}
                    className={`w-full flex items-center justify-center gap-2 py-1.5 rounded text-micro font-bold uppercase tracking-wide border transition-colors ${
                        hubTargetMode ? 'bg-rust border-rust/60 text-ink animate-pulse' : effectiveCoords ? 'bg-tarp/15 border-tarp/40 text-tarp' : 'bg-panel border-line/15 text-carbon'
                    }`}
                >
                    <MapPin size={11} strokeWidth={2.5} />
                    {hubTargetMode
                        ? 'Click the map for hub location...'
                        : effectiveCoords
                        ? `Location set (${effectiveCoords[0].toFixed(4)}, ${effectiveCoords[1].toFixed(4)}). Click to change`
                        : 'Pick location on map'}
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-mono font-bold py-1.5 rounded text-data uppercase tracking-wide transition-all disabled:opacity-50"
                >
                    {submitting ? 'Saving...' : editingId ? 'Save changes' : '+ Add hub'}
                </button>
            </form>

            <div className="max-h-52 overflow-y-auto space-y-1.5">
                {savedHubs.length === 0 && (
                    <div className="text-steel text-center py-2 text-data">No hubs registered yet.</div>
                )}
                {savedHubs.map((hub) => (
                    <div key={hub.id} className="flex justify-between items-center bg-ink/60 p-2 rounded border border-line/10">
                        <div className="min-w-0">
                            <div className="text-paper font-bold text-data truncate">{hub.name}</div>
                            <div className="text-micro text-steel font-mono">{hub.code} &middot; {hub.lat.toFixed(4)}, {hub.lng.toFixed(4)}</div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => startEdit(hub)}
                                title="Edit hub"
                                className="flex items-center gap-1 bg-panel border border-line/15 text-carbon rounded px-2 py-1 text-micro font-bold uppercase"
                            >
                                <Pencil size={11} strokeWidth={2.5} />
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleDelete(hub)}
                                disabled={deletingId === hub.id}
                                title="Delete hub"
                                className="flex items-center gap-1 bg-panel border border-rust/40 text-rust rounded px-2 py-1 text-micro font-bold uppercase disabled:opacity-50"
                            >
                                <Trash2 size={11} strokeWidth={2.5} />
                                {deletingId === hub.id ? '...' : ''}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
