// src/components/orders/BulkActionBar.tsx — act on many loads at once.
//
// The single biggest thing this queue was missing against any production
// dispatch board. Assigning was strictly one order at a time, so a backlog of
// eighty was eighty separate interactions — and the API had taken an array of
// order ids the whole time, so the capability existed and only the UI was
// absent.
//
// Appears only when something is selected. A permanent toolbar of controls
// that are disabled most of the time teaches people to ignore that strip of
// screen, which is exactly where you then want to put something urgent.
import { useState } from 'react';
import { Send, Clock, X } from 'lucide-react';
import { assignOrders, offerOrders } from '../../utils/api';
import { useDialog } from '../DialogProvider';
import type { StaffUser } from '../../types';

interface BulkActionBarProps {
    selectedIds: number[];
    drivers: StaffUser[];
    jwtToken: string;
    onDone: () => void;
    onClear: () => void;
}

export default function BulkActionBar({ selectedIds, drivers, jwtToken, onDone, onClear }: BulkActionBarProps) {
    const { alert, confirm } = useDialog();
    const [driver, setDriver] = useState('');
    const [busy, setBusy] = useState<'assign' | 'offer' | null>(null);

    if (selectedIds.length === 0) return null;

    const count = selectedIds.length;
    const noun = `${count} load${count === 1 ? '' : 's'}`;

    const run = async (kind: 'assign' | 'offer') => {
        if (!driver) return;
        const driverLabel = drivers.find((d) => d.username === driver)?.fullName || driver;

        // Bulk actions are the one place on this board where a misclick is
        // expensive: twenty loads land on the wrong driver at once and undoing
        // it is twenty more interactions. Cheap to confirm, costly not to.
        const ok = await confirm({
            title: kind === 'assign' ? `Assign ${noun} to ${driverLabel}?` : `Offer ${noun} to ${driverLabel}?`,
            body: kind === 'assign'
                ? 'They go straight onto that driver’s manifest.'
                : 'The driver can accept or refuse. Nothing moves until they accept.',
            confirmLabel: kind === 'assign' ? 'Assign' : 'Offer',
        });
        if (!ok) return;

        setBusy(kind);
        try {
            if (kind === 'assign') await assignOrders(selectedIds, driver, jwtToken);
            else await offerOrders(selectedIds, driver, jwtToken);
            setDriver('');
            onClear();
            onDone();
        } catch (err) {
            void alert({
                title: kind === 'assign' ? 'Could not assign those loads' : 'Could not offer those loads',
                body: (err as Error).message || 'Please try again.',
                tone: 'danger',
            });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div
            role="region"
            aria-label={`${count} selected`}
            className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-route/40 bg-route/10 px-3 py-2"
        >
            <span className="shrink-0 font-mono text-data text-paper">{noun} selected</span>

            <label htmlFor="bulk-driver" className="sr-only">Driver for the selected loads</label>
            <select
                id="bulk-driver"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                className="focus-ring min-w-0 flex-1 rounded border border-line/20 bg-ink px-2 py-1 text-data text-paper focus:border-route focus:outline-none"
            >
                <option value="">Select driver…</option>
                {drivers.map((d) => (
                    <option key={d.id} value={d.username}>{d.fullName || d.username}</option>
                ))}
            </select>

            {/* Offer sits quieter than Assign, the same way it does on a single
                row: assigning is the common case and offering is the partner
                path, and that relationship should not flip just because the
                action now covers twenty loads. */}
            <button
                type="button"
                onClick={() => void run('offer')}
                disabled={!driver || busy !== null}
                className="focus-ring flex shrink-0 items-center gap-1.5 rounded border border-line/20 bg-panel px-2.5 py-1 text-micro font-semibold uppercase tracking-wide text-steel transition-colors hover:text-paper disabled:opacity-40"
            >
                <Clock size={12} strokeWidth={2.5} />
                {busy === 'offer' ? 'Offering…' : 'Offer'}
            </button>
            <button
                type="button"
                onClick={() => void run('assign')}
                disabled={!driver || busy !== null}
                className="focus-ring flex shrink-0 items-center gap-1.5 rounded bg-route px-3 py-1 text-micro font-semibold uppercase tracking-wide text-ink transition-colors hover:bg-route-deep hover:text-paper disabled:opacity-40"
            >
                <Send size={12} strokeWidth={2.5} />
                {busy === 'assign' ? 'Assigning…' : 'Assign'}
            </button>

            <button
                type="button"
                onClick={onClear}
                title="Clear selection"
                aria-label="Clear selection"
                className="focus-ring shrink-0 rounded p-1 text-steel transition-colors hover:text-paper"
            >
                <X size={14} strokeWidth={2.5} />
            </button>
        </div>
    );
}
