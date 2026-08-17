import { useEffect, useState } from 'react';
import { Send, Navigation, MapPin } from 'lucide-react';
import { assignOrders, fetchNearestDrivers, placeOrderOnMap, setOrderPriority } from '../../utils/api';
import { useMapInteraction } from '../../context/MapInteractionContext';
import { useSocket } from '../../context/SocketContext';
import { describeDriverChecks, type Order, type StaffUser, type DriverSuggestion } from '../../types';
import { useDialog } from '../DialogProvider';

interface OrderRowProps {
    order: Order;
    drivers: StaffUser[];
    jwtToken: string;
    onAssigned: () => void;
}

// A left-border accent rather than a second text badge next to the
// existing status badge — this card already shows one badge (status);
// stacking a second same-style badge right beside it would read as one
// crowded, hard-to-parse label instead of two distinct signals.
// The customer's own words, not a rank — shown to the dispatcher as
// context for the priority they then choose themselves.
const NEEDED_BY_LABEL: Record<string, string> = {
    today: 'today',
    tomorrow: 'tomorrow',
    this_week: 'this week',
    flexible: 'no rush',
};

const PRIORITY_BORDER: Record<'high' | 'normal' | 'low', string> = {
    high: 'border-l-rust',
    normal: 'border-l-carbon',
    low: 'border-l-steel/40',
};

export default function OrderRow({ order, drivers, jwtToken, onAssigned }: OrderRowProps) {
    const { alert } = useDialog();
    const { resolveDriverName } = useSocket();
    const {
        placingOrderId, placementStep, placementPickup, placementDelivery,
        beginPlacement, cancelPlacement,
    } = useMapInteraction();
    const [placing, setPlacing] = useState(false);
    const [changingPriority, setChangingPriority] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [suggestions, setSuggestions] = useState<DriverSuggestion[] | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [suggesting, setSuggesting] = useState(false);

    const handleSuggest = async () => {
        setSuggesting(true);
        try {
            const data = await fetchNearestDrivers(order.id, jwtToken);
            setSuggestions(data.recommendedDrivers || []);
        } catch {
            setSuggestions([]);
        } finally {
            setSuggesting(false);
        }
    };

    // A customer order arrives as free text with no coordinates, so until a
    // dispatcher pins it the fleet map, the ETA and the route-progress bar
    // have nothing to work from.
    const isThisOrder = placingOrderId === order.id;
    const needsPlacing = order.source === 'public' && order.pickup_lat == null;

    useEffect(() => {
        if (!isThisOrder || !placementPickup || !placementDelivery || placing) return;
        setPlacing(true);
        placeOrderOnMap(order.id, {
            pickupLat: placementPickup[0], pickupLng: placementPickup[1],
            deliveryLat: placementDelivery[0], deliveryLng: placementDelivery[1],
        }, jwtToken)
            .then(() => { cancelPlacement(); onAssigned(); })
            .catch((err) => void alert({ title: 'Could not save those locations', body: (err as Error).message || 'Please try again.', tone: 'danger' }))
            .finally(() => setPlacing(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isThisOrder, placementPickup, placementDelivery]);

    const handlePriority = async (next: string) => {
        setChangingPriority(true);
        try {
            await setOrderPriority(order.id, next as 'high' | 'normal' | 'low', jwtToken);
            onAssigned(); // refreshes the queue, which re-sorts on priority
        } catch (err) {
            void alert({ title: 'Could not change the priority', body: (err as Error).message || 'Please try again.', tone: 'danger' });
        } finally {
            setChangingPriority(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedDriver) return;
        setAssigning(true);
        try {
            await assignOrders([order.id], selectedDriver, jwtToken);
            onAssigned();
        } catch (err) {
            void alert({ title: 'Could not assign the order', body: (err as Error).message || 'Failed to assign order.', tone: 'danger' });
        } finally {
            setAssigning(false);
        }
    };

    const priority = order.priority || 'normal';

    return (
        <div className={`bg-ink/60 p-2.5 rounded border border-line/10 border-l-4 ${PRIORITY_BORDER[priority]} space-y-2`}>
            <div className="flex flex-wrap justify-between items-start gap-x-2 gap-y-1.5">
                <div className="min-w-0">
                    <div className="text-paper font-bold text-data truncate">{order.cargo_description}</div>
                    {/* truncate, not wrap: at the rail's 260px minimum a long
                        hub name pushed this line past the panel edge. The
                        cargo title above it already truncates for the same
                        reason, and a clipped hub name costs less than a row
                        that reflows to three lines. */}
                    <div className="text-micro text-steel font-mono truncate">
                        {order.origin_hub_name || 'No hub yet'} &middot; {order.weight_kg} kg
                        {priority !== 'normal' && (
                            <span className={priority === 'high' ? 'text-rust' : 'text-steel'}>
                                {' '}&middot; {priority === 'high' ? 'High priority' : 'Low priority'}
                            </span>
                        )}
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                    {/* The queue sorts on this, so it belongs where the
                        sorting is looked at rather than behind a detail
                        view. A customer's stated timing sits in the block
                        below; this is the dispatcher's own call. */}
                    <select
                        value={priority}
                        disabled={changingPriority}
                        onChange={(e) => void handlePriority(e.target.value)}
                        title="Change priority — the dispatch queue sorts on this"
                        aria-label={`Priority for ${order.cargo_description}`}
                        className={`bg-panel border rounded px-1 py-0.5 text-micro font-mono font-bold uppercase disabled:opacity-50 ${
                            priority === 'high' ? 'border-rust/50 text-rust'
                                : priority === 'low' ? 'border-line/15 text-steel'
                                : 'border-line/15 text-carbon'
                        }`}
                    >
                        <option value="high">HIGH</option>
                        <option value="normal">NORMAL</option>
                        <option value="low">LOW</option>
                    </select>
                    <span className="text-micro font-mono font-bold uppercase text-hazard bg-hazard/10 border border-hazard/30 rounded px-1.5 py-0.5">
                        {order.status}
                    </span>
                </div>
            </div>

            {/* A customer-submitted order carries no coordinates and no hub
                — the addresses below are free text the customer typed, and
                are the only thing telling the dispatcher where this goes.
                Called out rather than blended in, because it needs checking
                and a phone call before a driver is sent anywhere. */}
            {order.source === 'public' ? (
                <div className="rounded border border-tarp/30 bg-tarp/5 p-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-micro font-mono font-bold uppercase tracking-wider text-tarp">
                            Customer request
                        </span>
                        {order.tracking_token ? (
                            <span className="text-micro font-mono text-steel">{order.tracking_token}</span>
                        ) : null}
                    </div>
                    <div className="text-micro text-paper leading-snug">
                        <span className="text-steel">From </span>{order.pickup_address_text || '—'}
                        <span className="text-steel"> → </span>{order.delivery_address_text || '—'}
                    </div>
                    {order.customer_name || order.customer_phone ? (
                        <div className="text-micro text-paper">
                            <span className="text-steel">Contact </span>
                            {order.customer_name}
                            {order.customer_phone ? (
                                <a href={`tel:${order.customer_phone}`} className="ml-1 font-mono text-carbon hover:underline">
                                    {order.customer_phone}
                                </a>
                            ) : null}
                        </div>
                    ) : null}
                    {order.needed_by ? (
                        <div className="text-micro text-paper">
                            <span className="text-steel">Needed </span>
                            {NEEDED_BY_LABEL[order.needed_by]}
                        </div>
                    ) : null}
                    {order.special_instructions ? (
                        <div className="text-micro text-hazard leading-snug">
                            <span className="text-steel">Note </span>{order.special_instructions}
                        </div>
                    ) : null}

                    {needsPlacing ? (
                        isThisOrder && placementStep ? (
                            <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="text-micro text-hazard font-mono animate-pulse">
                                    {placementStep === 'pickup'
                                        ? 'Click the pickup point on the map…'
                                        : 'Now click the delivery point…'}
                                </span>
                                <button type="button" onClick={cancelPlacement}
                                    className="text-micro font-mono uppercase text-steel hover:text-paper">
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => beginPlacement(order.id)}
                                disabled={placing}
                                title="Pin this order's pickup and delivery on the map"
                                className="w-full mt-1 flex items-center justify-center gap-1.5 bg-panel border border-tarp/40 text-tarp rounded px-2 py-1.5 text-micro font-bold disabled:opacity-50"
                            >
                                <MapPin size={11} />
                                {placing ? 'Saving…' : 'Place on map'}
                            </button>
                        )
                    ) : null}
                </div>
            ) : null}
            {suggestions ? (
                <div className="text-micro text-carbon font-mono">
                    {suggestions.length === 0
                        ? 'No drivers currently reporting a live position.'
                        : suggestions.map((s) => `${resolveDriverName(s.driverName)} (${s.distanceFromPickupKm}km)`).join(' · ')}
                </div>
            ) : null}
            <div className="flex gap-1.5">
                <select
                    value={selectedDriver}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="flex-1 min-w-0 bg-panel border border-line/15 rounded px-1.5 py-1 text-micro text-paper"
                >
                    <option value="">Select driver</option>
                    {/* Today's checks shown inline: the dispatcher is
                        choosing a driver here, which is the one moment the
                        information can change a decision. Not a filter —
                        an unchecked driver is still selectable, and the
                        dispatcher can ring them. */}
                    {drivers.map((d) => {
                        const checks = describeDriverChecks(d);
                        return (
                            <option key={d.id} value={d.username}>
                                {d.fullName || d.username}{checks ? ` — ${checks}` : ''}
                            </option>
                        );
                    })}
                </select>
                <button
                    type="button"
                    onClick={() => void handleSuggest()}
                    disabled={suggesting}
                    title="Suggest nearest driver"
                    className="shrink-0 flex items-center justify-center bg-panel border border-line/15 text-carbon rounded px-2 disabled:opacity-50"
                >
                    <Navigation size={11} strokeWidth={2.5} />
                </button>
                <button
                    type="button"
                    onClick={() => void handleAssign()}
                    disabled={assigning || !selectedDriver}
                    className="shrink-0 flex items-center gap-1 bg-route hover:bg-route-deep text-ink hover:text-paper font-bold rounded px-2 text-micro uppercase disabled:opacity-50"
                >
                    <Send size={10} strokeWidth={2.5} />
                    {assigning ? '...' : 'Assign'}
                </button>
            </div>
        </div>
    );
}
