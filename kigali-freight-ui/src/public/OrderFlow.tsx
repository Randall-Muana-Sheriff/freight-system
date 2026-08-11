import { useEffect, useState } from 'react';
import { fetchCargoTypes, submitOrder, type OrderDraft } from './publicApi';

const STEPS = ['Cargo', 'Details', 'Review'] as const;

const field = 'w-full rounded-xl border border-brand-line bg-brand-ink px-4 py-3 font-body text-sm text-brand-text placeholder:text-brand-muted/70 focus:border-brand-jade focus:outline-none';
const label = 'mb-1.5 block font-body text-xs font-bold uppercase tracking-widest text-brand-muted';

function Stepper({ current }: { current: number }) {
    return (
        <ol className="mb-10 flex items-center gap-3">
            {STEPS.map((name, index) => {
                const done = index < current;
                const active = index === current;
                return (
                    <li key={name} className="flex flex-1 items-center gap-3">
                        <span
                            aria-current={active ? 'step' : undefined}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-body text-xs font-bold ${
                                done || active ? 'bg-brand-jade text-brand-ink' : 'border border-brand-line text-brand-muted'
                            }`}
                        >
                            {done ? '✓' : index + 1}
                        </span>
                        <span className={`font-body text-sm ${active ? 'font-bold text-brand-text' : 'text-brand-muted'}`}>{name}</span>
                        {index < STEPS.length - 1 ? <span className={`hidden h-px flex-1 sm:block ${done ? 'bg-brand-jade' : 'bg-brand-line'}`} /> : null}
                    </li>
                );
            })}
        </ol>
    );
}

function Row({ term, value }: { term: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-6 border-b border-brand-line py-3.5 last:border-0">
            <dt className="font-body text-xs font-bold uppercase tracking-widest text-brand-muted">{term}</dt>
            <dd className="text-right font-body text-sm text-brand-text">{value || '—'}</dd>
        </div>
    );
}

export function OrderFlow({ onNavigate }: { onNavigate: (path: string) => void }) {
    const [step, setStep] = useState(0);
    const [cargoTypes, setCargoTypes] = useState<string[]>([]);
    const [draft, setDraft] = useState<OrderDraft>({
        pickupAddress: '', deliveryAddress: '', cargoType: '', weightKg: 0,
        specialInstructions: '', customerName: '', customerPhone: '', customerEmail: '',
    });
    const [weightInput, setWeightInput] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);

    // The list comes from the server so the dropdown can never offer a
    // value the API would then reject.
    useEffect(() => {
        fetchCargoTypes().then(setCargoTypes).catch(() => setCargoTypes([]));
    }, []);

    const cargoValid = draft.pickupAddress.trim() && draft.deliveryAddress.trim() && draft.cargoType && Number(weightInput) > 0;
    const detailsValid = draft.customerName.trim() && draft.customerPhone.trim();

    const confirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            setToken(await submitOrder({ ...draft, weightKg: Number(weightInput) }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not place your order.');
        } finally {
            setSubmitting(false);
        }
    };

    if (token) {
        return (
            <div className="mx-auto max-w-lg px-5 py-20 text-center">
                <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-brand-jade">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="#050C18" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12.5l5.5 5.5L20 7" />
                    </svg>
                </div>
                <h1 className="font-display text-4xl font-black tracking-tight text-brand-text">Order confirmed</h1>
                <p className="mt-3 font-body text-sm leading-relaxed text-brand-muted">
                    A dispatcher will review it and assign a driver. Keep this code — it&apos;s how you track the shipment.
                </p>

                <div className="mt-8 rounded-2xl border border-brand-jade/40 bg-brand-surface2 p-7">
                    <p className="font-body text-xs font-bold uppercase tracking-widest text-brand-muted">Tracking code</p>
                    <p className="mt-2 font-mono text-3xl font-bold tracking-wider text-brand-jade">{token}</p>
                </div>
                {/* Said plainly because the SMS is a convenience, not the
                    record — a customer who loses the code and never got the
                    text has no way back to their shipment. */}
                <p className="mt-3 font-body text-xs text-brand-muted">We&apos;ve also texted this to {draft.customerPhone}. Write it down if you can.</p>

                <div className="mt-8 flex justify-center gap-3">
                    <button onClick={() => onNavigate(`/track?code=${encodeURIComponent(token)}`)}
                        className="rounded-full bg-brand-jade px-6 py-3 font-body font-bold text-brand-ink hover:bg-brand-jade-deep">
                        Track order
                    </button>
                    <button onClick={() => onNavigate('/')}
                        className="rounded-full border border-brand-line px-6 py-3 font-body font-medium text-brand-text hover:border-brand-jade hover:text-brand-jade">
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl px-5 py-14">
            <h1 className="font-display text-4xl font-black tracking-tight text-brand-text">Place an order</h1>
            <p className="mt-2 font-body text-sm text-brand-muted">No account needed.</p>

            <div className="mt-10">
                <Stepper current={step} />

                <div className="rounded-2xl border border-brand-line bg-brand-surface2 p-6 sm:p-8">
                    {step === 0 ? (
                        <>
                            <div className="mb-4">
                                <label className={label} htmlFor="pickup">Pickup location</label>
                                <input id="pickup" className={field} value={draft.pickupAddress}
                                    onChange={(e) => setDraft({ ...draft, pickupAddress: e.target.value })}
                                    placeholder="e.g. Gikondo Industrial Zone" />
                            </div>
                            <div className="mb-4">
                                <label className={label} htmlFor="destination">Delivery destination</label>
                                <input id="destination" className={field} value={draft.deliveryAddress}
                                    onChange={(e) => setDraft({ ...draft, deliveryAddress: e.target.value })}
                                    placeholder="e.g. Kimironko Market, Shop 14" />
                            </div>
                            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={label} htmlFor="cargo-type">Cargo type</label>
                                    <select id="cargo-type" className={field} value={draft.cargoType}
                                        onChange={(e) => setDraft({ ...draft, cargoType: e.target.value })}>
                                        <option value="">Select…</option>
                                        {cargoTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={label} htmlFor="weight">Weight (kg)</label>
                                    <input id="weight" type="number" min="1" className={field} value={weightInput}
                                        onChange={(e) => setWeightInput(e.target.value)} placeholder="e.g. 150" />
                                </div>
                            </div>
                            <div>
                                <label className={label} htmlFor="instructions">Special instructions (optional)</label>
                                <textarea id="instructions" rows={3} className={field} value={draft.specialInstructions}
                                    onChange={(e) => setDraft({ ...draft, specialInstructions: e.target.value })}
                                    placeholder="Fragile items, access codes…" />
                            </div>
                        </>
                    ) : step === 1 ? (
                        <>
                            <div className="mb-4 grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={label} htmlFor="name">Full name</label>
                                    <input id="name" className={field} value={draft.customerName}
                                        onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} placeholder="Jean Mutabazi" />
                                </div>
                                <div>
                                    <label className={label} htmlFor="phone">Phone</label>
                                    <input id="phone" className={field} value={draft.customerPhone}
                                        onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })} placeholder="0788 000 000" />
                                </div>
                            </div>
                            <div>
                                <label className={label} htmlFor="email">Email (optional)</label>
                                <input id="email" type="email" className={field} value={draft.customerEmail}
                                    onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} placeholder="you@company.rw" />
                            </div>
                            <p className="mt-5 rounded-xl border border-brand-line bg-brand-ink p-4 font-body text-xs leading-relaxed text-brand-muted">
                                We text your tracking code to this number, and the dispatcher calls it if
                                anything about the pickup needs checking.
                            </p>
                        </>
                    ) : (
                        <>
                            <dl>
                                <Row term="Pickup" value={draft.pickupAddress} />
                                <Row term="Destination" value={draft.deliveryAddress} />
                                <Row term="Cargo" value={draft.cargoType} />
                                <Row term="Weight" value={weightInput ? `${weightInput} kg` : ''} />
                                <Row term="Contact" value={`${draft.customerName} · ${draft.customerPhone}`} />
                                {draft.specialInstructions ? <Row term="Notes" value={draft.specialInstructions} /> : null}
                            </dl>
                            <p className="mt-5 font-body text-xs leading-relaxed text-brand-muted">
                                A dispatcher reviews this order and confirms the pickup before a driver is assigned.
                            </p>
                            {error ? <p role="alert" className="mt-4 font-body text-sm text-red-400">{error}</p> : null}
                        </>
                    )}

                    <div className="mt-7 flex items-center justify-between gap-3 border-t border-brand-line pt-6">
                        <button
                            onClick={() => (step === 0 ? onNavigate('/') : setStep(step - 1))}
                            className="rounded-full border border-brand-line px-6 py-3 font-body font-medium text-brand-text hover:border-brand-jade hover:text-brand-jade"
                        >
                            {step === 0 ? 'Cancel' : 'Back'}
                        </button>

                        {step < 2 ? (
                            <button
                                onClick={() => setStep(step + 1)}
                                disabled={step === 0 ? !cargoValid : !detailsValid}
                                className="rounded-full bg-brand-jade px-6 py-3 font-body font-bold text-brand-ink hover:bg-brand-jade-deep disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Continue →
                            </button>
                        ) : (
                            <button onClick={confirm} disabled={submitting}
                                className="rounded-full bg-brand-jade px-6 py-3 font-body font-bold text-brand-ink hover:bg-brand-jade-deep disabled:opacity-60">
                                {submitting ? 'Placing…' : 'Confirm order'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
