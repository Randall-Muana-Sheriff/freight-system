// src/components/orders/BulkPlaceFlow.tsx — walk a stack of unplaced
// bookings, pinning each on the map, then send them in one call.
//
// Every public booking arrives as two lines of free text with no coordinates.
// Nothing can be assigned, routed or priced against a real distance until
// somebody pins it, which puts placing on the critical path of every single
// customer order — not a rare chore, and not something the fixture invented.
//
// One at a time it is four interactions per booking: find the row, expand it,
// start placing, place. This is two clicks per booking and no navigation, and
// it stays on the map where the dispatcher's attention already is.
import { useEffect, useState } from 'react';
import { MapPin, X, SkipForward } from 'lucide-react';
import { useMapInteraction } from '../../context/MapInteractionContext';
import { placeOrdersBatch, type PlacementInput, type PlaceBatchResult } from '../../utils/api';
import type { Order } from '../../types';

interface BulkPlaceFlowProps {
    orders: Order[];
    jwtToken: string;
    onFinished: () => void;
    onCancel: () => void;
}

export default function BulkPlaceFlow({ orders, jwtToken, onFinished, onCancel }: BulkPlaceFlowProps) {
    const { placementStep, placementPickup, placementDelivery, beginPlacement, cancelPlacement } = useMapInteraction();
    const [index, setIndex] = useState(0);
    const [collected, setCollected] = useState<PlacementInput[]>([]);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<PlaceBatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const current = orders[index];

    // Start the first booking, and each subsequent one as the index moves.
    // batch: true tells OrderRow not to submit this order on its own the
    // instant both pins land — the whole point is that they travel together.
    useEffect(() => {
        if (current && !result) beginPlacement(current.id, { batch: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.id, result]);

    // Both pins are down for the booking in hand: bank them and move on.
    useEffect(() => {
        if (!current || !placementPickup || !placementDelivery) return;
        setCollected((prev) => [...prev, {
            orderId: current.id,
            pickupLat: placementPickup[0], pickupLng: placementPickup[1],
            deliveryLat: placementDelivery[0], deliveryLng: placementDelivery[1],
        }]);
        setIndex((i) => i + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placementPickup, placementDelivery]);

    const submit = async (batch: PlacementInput[]) => {
        cancelPlacement();
        if (batch.length === 0) { onCancel(); return; }
        setSaving(true);
        try {
            setResult(await placeOrdersBatch(batch, jwtToken));
        } catch (err) {
            setError((err as Error).message || 'Could not save those placements.');
        } finally {
            setSaving(false);
        }
    };

    // Ran off the end of the stack — send whatever was pinned.
    useEffect(() => {
        if (!result && !saving && index >= orders.length && orders.length > 0) void submit(collected);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, orders.length]);

    if (error) {
        return (
            <div role="alert" className="rounded-md border border-rust/40 bg-rust/10 p-3 text-data text-rust">
                {error}
                <button type="button" onClick={onCancel} className="focus-ring ml-3 underline">Close</button>
            </div>
        );
    }

    // Partial success is the normal outcome here, not the sad path — the
    // endpoint runs without a transaction precisely so one unplaceable
    // booking cannot discard nineteen good pins. So both halves are reported,
    // and the failures name themselves rather than hiding behind a count.
    if (result) {
        return (
            <div className="space-y-2 rounded-md border border-line/15 bg-panel p-3">
                <p className="text-data text-paper">
                    <span className="ops-figure mr-2 text-lead text-tarp">{result.placedCount}</span>
                    placed on the map
                    {result.failedCount > 0 ? <> · <span className="text-rust">{result.failedCount} could not be</span></> : null}
                </p>
                {result.failed.length > 0 && (
                    <ul className="space-y-1">
                        {result.failed.map((f) => (
                            <li key={f.orderId} className="font-mono text-micro text-steel">
                                #{f.orderId} — {f.message}
                            </li>
                        ))}
                    </ul>
                )}
                <button
                    type="button"
                    onClick={onFinished}
                    className="focus-ring rounded bg-route px-3 py-1.5 text-micro font-semibold uppercase tracking-wide text-ink hover:bg-route-deep hover:text-paper"
                >
                    Done
                </button>
            </div>
        );
    }

    if (saving) {
        return <p className="rounded-md border border-line/15 bg-panel p-3 font-mono text-data text-steel">Saving {collected.length} placements…</p>;
    }

    if (!current) return null;

    const wanted = placementStep === 'pickup' ? 'collection' : 'delivery';
    const address = placementStep === 'pickup'
        ? current.pickup_address_text
        : current.delivery_address_text;

    return (
        <div className="space-y-2 rounded-md border border-route/40 bg-route/10 p-3">
            <div className="flex items-baseline justify-between gap-3">
                <p className="data-label text-route">Placing {index + 1} of {orders.length}</p>
                <button
                    type="button"
                    onClick={() => { cancelPlacement(); void submit(collected); }}
                    title="Stop here and save what is already pinned"
                    className="focus-ring flex items-center gap-1 text-micro text-steel transition-colors hover:text-paper"
                >
                    <X size={12} strokeWidth={2.5} />
                    Stop and save
                </button>
            </div>

            <p className="text-data text-paper">{current.cargo_description}</p>

            {/* The address the customer typed, which is the only thing telling
                the dispatcher where this actually goes. */}
            <p className="flex items-start gap-1.5 text-micro text-steel">
                <MapPin size={12} strokeWidth={2.5} className="mt-0.5 shrink-0 text-route" />
                <span>
                    Click the <span className="text-paper">{wanted}</span> point for{' '}
                    <span className="font-mono text-paper">{address || 'an address the customer did not give'}</span>
                </span>
            </p>

            {/* Skipping is not failure. A booking whose address is unusable
                should be left for a phone call rather than pinned at a guess,
                and guessing is the one outcome this flow must not encourage. */}
            <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                className="focus-ring flex items-center gap-1.5 text-micro text-steel transition-colors hover:text-paper"
            >
                <SkipForward size={12} strokeWidth={2.5} />
                Skip this one — the address needs a call
            </button>
        </div>
    );
}
