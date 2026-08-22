// src/components/orders/SavedViews.tsx — a dispatcher's own named filters.
//
// Retyping "remera" every morning is the kind of small tax that a shift makes
// expensive. A saved view is just a filter with a name on it, but naming it is
// what turns "search the queue" into "the thing I check first".
//
// Persisted per user rather than kept in localStorage. On a shared dispatch
// desk, browser-local views appear for whoever sits down next, under someone
// else's login — which is a bug rather than a limitation, and one that gets
// reported as the board changing by itself.
import { useCallback, useEffect, useState } from 'react';
import { Bookmark, BookmarkPlus, X } from 'lucide-react';
import { fetchSavedViews, saveSavedView, deleteSavedView, type SavedView } from '../../utils/api';
import { useSocket } from '../../context/SocketContext';
import { useDialog } from '../DialogProvider';

interface SavedViewsProps {
    /* The filter text a view would capture, and the way to apply one. */
    filter: string;
    onApply: (filter: string) => void;
}

export default function SavedViews({ filter, onApply }: SavedViewsProps) {
    const { jwtToken } = useSocket();
    const { prompt, alert } = useDialog();
    const [views, setViews] = useState<SavedView[]>([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setViews(await fetchSavedViews(jwtToken));
        } catch {
            /* A dispatcher without saved views is a working board, so this
               stays silent rather than putting an error where a convenience
               should be. */
        }
    }, [jwtToken]);

    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        const name = await prompt({
            title: 'Name this view',
            body: 'It will be yours alone, and it will be here tomorrow.',
            placeholder: 'Overdue north',
            confirmLabel: 'Save view',
            required: true,
        });
        if (name === null) return;

        setBusy(true);
        try {
            await saveSavedView(name.trim(), { q: filter.trim() }, jwtToken);
            // Refetch rather than appending. Saving over an existing name is
            // an upsert that returns the same id, so appending would show one
            // view twice under one label.
            await load();
        } catch (err) {
            void alert({ title: 'Could not save that view', body: (err as Error).message || 'Please try again.', tone: 'danger' });
        } finally {
            setBusy(false);
        }
    };

    const remove = async (view: SavedView) => {
        setBusy(true);
        try {
            await deleteSavedView(view.id, jwtToken);
        } catch {
            /* A view that is not yours answers 404, deliberately
               indistinguishable from one that never existed — so there is
               nothing useful to say and the refetch below settles it. */
        } finally {
            await load();
            setBusy(false);
        }
    };

    const canSave = filter.trim().length > 0;
    if (views.length === 0 && !canSave) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {views.map((view) => {
                const q = String((view.filter as { q?: unknown })?.q ?? '');
                const applied = q === filter.trim() && q.length > 0;
                return (
                    <span
                        key={view.id}
                        className={`group flex items-center rounded border text-micro transition-colors ${
                            applied ? 'border-route/40 bg-route/15 text-route' : 'border-line/15 bg-panel text-steel'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onApply(q)}
                            className="focus-ring flex items-center gap-1 rounded-l px-2 py-1 hover:text-paper"
                        >
                            <Bookmark size={11} strokeWidth={2.5} />
                            {view.name}
                        </button>
                        <button
                            type="button"
                            onClick={() => void remove(view)}
                            disabled={busy}
                            title={`Forget "${view.name}"`}
                            aria-label={`Forget ${view.name}`}
                            className="focus-ring rounded-r px-1.5 py-1 opacity-0 transition-opacity hover:text-paper focus-visible:opacity-100 group-hover:opacity-100"
                        >
                            <X size={11} strokeWidth={2.5} />
                        </button>
                    </span>
                );
            })}

            {/* Only offered when there is a filter to capture. "Save view" over
                an empty box would save the whole queue under a name. */}
            {canSave && (
                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                    className="focus-ring flex items-center gap-1 rounded border border-line/15 px-2 py-1 text-micro text-steel transition-colors hover:text-paper disabled:opacity-40"
                >
                    <BookmarkPlus size={11} strokeWidth={2.5} />
                    Save this view
                </button>
            )}
        </div>
    );
}
