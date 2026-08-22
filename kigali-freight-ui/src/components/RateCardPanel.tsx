// src/components/RateCardPanel.tsx — every figure a job is priced from, and
// the only way to change one without a developer and a deploy.
//
// Diesel is why this exists. RURA sets it nationally and it moved from 1,757
// to 2,927 RWF a litre in the twelve months to August 2026, in three separate
// steps. Each one left the rate card wrong until somebody edited SQL. An
// operator has to be able to follow that the day it happens.
//
// Saving writes a new card rather than editing the one in force, which is why
// the button says supersede. Jobs already quoted keep the card they were
// quoted on -- a customer cannot be re-billed by a change made after they
// booked, and a commission already taken is never restated.
import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { fetchRateCards, saveRateCard } from '../utils/api';
import { useSocket } from '../context/SocketContext';
import type { RateCard } from '../types';

// Grouped the way an operator thinks about them rather than by column order:
// the thing that changes often first, then the shape of the fare, then the
// terms that rarely move.
const FIELD_GROUPS: { title: string; hint: string; fields: { key: keyof RateCard; label: string; suffix?: string }[] }[] = [
    {
        title: 'Fuel',
        hint: 'The figure that moves. RURA sets the diesel price nationally — change it here the day it changes there.',
        fields: [
            { key: 'fuel_price_per_litre', label: 'Diesel price', suffix: 'RWF / litre' },
            { key: 'fuel_litres_per_100km', label: 'Consumption', suffix: 'L / 100km' },
        ],
    },
    {
        title: 'The fare',
        hint: 'Charged on road distance, which is straight-line distance times the road factor.',
        fields: [
            { key: 'base_fare', label: 'Base fare', suffix: 'RWF' },
            { key: 'per_km', label: 'Per km in the city', suffix: 'RWF' },
            { key: 'per_km_long', label: 'Per km beyond', suffix: 'RWF' },
            { key: 'per_kg', label: 'Per kg', suffix: 'RWF' },
            { key: 'minimum_fare', label: 'Minimum fare', suffix: 'RWF' },
            { key: 'road_distance_factor', label: 'Road vs straight line', suffix: '×' },
        ],
    },
    {
        title: 'Leaving the city',
        hint: 'Beyond the taper the driver is on open road, climbing, and coming home empty unless a return load is found.',
        fields: [
            { key: 'taper_after_km', label: 'City ends after', suffix: 'km' },
            { key: 'terrain_fuel_factor', label: 'Hill fuel penalty', suffix: '×' },
            { key: 'return_leg_beyond_km', label: 'Empty return beyond', suffix: 'km' },
            { key: 'return_leg_share_pct', label: 'Share of it charged', suffix: '%' },
        ],
    },
    {
        title: 'Waiting and commission',
        hint: 'Detention is paid to the driver in full. Commission is charged on the fare only, never on fuel or waiting.',
        fields: [
            { key: 'detention_free_minutes', label: 'Free waiting', suffix: 'min' },
            { key: 'detention_per_hour', label: 'Then per hour', suffix: 'RWF' },
            { key: 'platform_commission_pct', label: 'Commission', suffix: '%' },
            { key: 'platform_minimum_fee', label: 'Minimum fee', suffix: 'RWF' },
        ],
    },
];

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));

export default function RateCardPanel() {
    const { jwtToken } = useSocket();
    const [cards, setCards] = useState<RateCard[]>([]);
    const [active, setActive] = useState<string>('');
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState<string | null>(null);

    const load = (selectClass?: string) =>
        fetchRateCards(jwtToken)
            .then((result) => {
                setCards(result.rates);
                const chosen = selectClass || result.rates[0]?.vehicle_class || '';
                setActive(chosen);
                const card = result.rates.find((r) => r.vehicle_class === chosen);
                if (card) {
                    setDraft(Object.fromEntries(
                        FIELD_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, num(card[f.key] as string | number | null)]),
                    ));
                }
            })
            .catch((err) => setError((err as Error).message))
            .finally(() => setLoading(false));

    useEffect(() => {
        void load();
        // Loaded once: a rate card is not a live feed, and refetching under a
        // half-typed form would throw away what the operator was writing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jwtToken]);

    const selectClass = (vehicleClass: string) => {
        setActive(vehicleClass);
        setSaved(null);
        setError(null);
        const card = cards.find((r) => r.vehicle_class === vehicleClass);
        if (card) {
            setDraft(Object.fromEntries(
                FIELD_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, num(card[f.key] as string | number | null)]),
            ));
        }
    };

    const current = cards.find((r) => r.vehicle_class === active);

    // Only what actually differs from the card in force. Sending the whole
    // form would write a new row on every save even when nothing changed.
    const changes = Object.fromEntries(
        Object.entries(draft)
            .filter(([key, value]) => value !== '' && current && Number(value) !== Number(current[key as keyof RateCard]))
            .map(([key, value]) => [key, Number(value)]),
    );
    const changeCount = Object.keys(changes).length;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaved(null);
        setSaving(true);
        try {
            await saveRateCard(active, changes, note, jwtToken);
            setNote('');
            setSaved(`${active} superseded. Jobs quoted before now keep the card they were quoted on.`);
            await load(active);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="font-mono text-data text-steel">Reading the rate card…</div>;

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-2">
                <Coins size={16} strokeWidth={2.5} className="text-steel" />
                <h2 className="display-tight text-lead text-paper">Rate card</h2>
            </header>

            {/* Which vehicle class you are pricing. Was styled with `signal`,
                which is a PUBLIC-site token and does not exist on the staff
                palette — so the selected class rendered with no background and
                no accent at all, and you could not tell which one you were
                editing. Same segmented control as the workspace switcher, so
                "where am I" looks the same everywhere on the board. */}
            <nav aria-label="Vehicle class" className="flex w-fit items-center gap-1 rounded-md border border-line/15 p-0.5">
                {cards.map((card) => (
                    <button
                        key={card.vehicle_class}
                        type="button"
                        onClick={() => selectClass(card.vehicle_class)}
                        aria-current={card.vehicle_class === active ? 'true' : undefined}
                        className={`focus-ring rounded px-3 py-1.5 text-micro font-semibold uppercase tracking-wide transition-colors ${
                            card.vehicle_class === active
                                ? 'bg-panel-soft text-paper'
                                : 'text-steel hover:text-paper'
                        }`}
                    >
                        {card.vehicle_class}
                    </button>
                ))}
            </nav>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
                {FIELD_GROUPS.map((group) => (
                    <fieldset key={group.title} className="space-y-3">
                        <legend className="display-tight text-body text-paper">{group.title}</legend>
                        <p className="max-w-prose text-data leading-relaxed text-steel">{group.hint}</p>
                        {/* Wider than two columns where there is room: this is
                            the full-width admin console, not a 400px rail. */}
                        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.fields.map((field) => (
                                <label key={String(field.key)} className="block">
                                    <span className="data-label text-steel">{field.label}</span>
                                    <div className="mt-1 flex items-center gap-2">
                                        {/* text-data, not text-micro. Every
                                            figure here is money someone is
                                            charged, and 11px is no size to
                                            check a diesel price at. */}
                                        <input
                                            type="number"
                                            step="any"
                                            min="0"
                                            value={draft[field.key as string] ?? ''}
                                            onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                                            className="focus-ring w-full rounded border border-line/15 bg-ink px-2 py-1.5 font-mono text-data tabular-nums text-paper focus:border-route focus:outline-none"
                                        />
                                        {field.suffix ? (
                                            <span className="shrink-0 whitespace-nowrap text-micro text-steel">{field.suffix}</span>
                                        ) : null}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}

                <label className="block max-w-xl">
                    <span className="data-label text-steel">Why — kept on the card</span>
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="RURA raised diesel to 3,200"
                        className="focus-ring mt-1 w-full rounded border border-line/15 bg-ink px-2 py-1.5 text-data text-paper placeholder-steel/60 focus:border-route focus:outline-none"
                    />
                </label>

                {/* rust for a failure, tarp for a success. Previously hazard
                    and signal — one of which meant "degrading" rather than
                    "wrong", and the other of which rendered as nothing. */}
                {error ? (
                    <p role="alert" className="rounded border border-rust/30 bg-rust/10 p-2.5 font-mono text-data text-rust">{error}</p>
                ) : null}
                {saved ? (
                    <p className="rounded border border-tarp/30 bg-tarp/10 p-2.5 text-data text-tarp">{saved}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                    {/* The primary action on this screen, so it looks like one.
                        It previously carried bg-signal/15, which resolved to no
                        background whatsoever — a button that writes a new rate
                        card was rendering as bare text. */}
                    <button
                        type="submit"
                        disabled={saving || changeCount === 0}
                        className="focus-ring rounded bg-route px-4 py-2 text-micro font-semibold uppercase tracking-wide text-ink transition-colors hover:bg-route-deep hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving
                            ? 'Saving…'
                            : changeCount === 0
                                ? 'Change a figure to supersede'
                                : `Supersede ${active} — ${changeCount} change${changeCount === 1 ? '' : 's'}`}
                    </button>
                    {current?.note ? (
                        <p className="text-data text-steel">Card in force: {current.note}</p>
                    ) : null}
                </div>
            </form>
        </div>
    );
}
