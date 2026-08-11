import { useEffect, useState } from 'react';
import { fetchCargoTypes, submitOrder, type OrderDraft } from './publicApi';

// Booking is paperwork, so it is styled as paperwork: daylight, ruled
// fields, mono labels, no cards floating on a gradient. The restraint is
// the point — the hero can be the showpiece, a form someone is filling in
// with a lorry waiting should be quiet and legible.

const STEPS = ['Cargo', 'Contact', 'Check'] as const;

const field = 'w-full border-b border-pub-onpaper/25 bg-transparent py-2.5 text-[15px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

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

    useEffect(() => {
        fetchCargoTypes().then(setCargoTypes).catch(() => setCargoTypes([]));
    }, []);

    const cargoValid = draft.pickupAddress.trim() && draft.deliveryAddress.trim() && draft.cargoType && Number(weightInput) > 0;
    const contactValid = draft.customerName.trim() && draft.customerPhone.trim();

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

    // Confirmation goes dark: the job has left the paperwork and joined the
    // road, and the code is the one thing on screen worth reading.
    if (token) {
        return (
            <div className="bg-pub-ink px-5 py-24">
                <div className="mx-auto max-w-xl">
                    <p className="data-label text-pub-signal">Order received</p>
                    <h1 className="display-wide mt-5 text-[clamp(2.2rem,5vw,3.2rem)] text-pub-onink">
                        Keep this code.
                    </h1>
                    <p className="mt-5 text-[15px] leading-relaxed text-pub-onink-soft">
                        It&apos;s how you see where your cargo is. A dispatcher is checking the
                        details now and will call you if anything needs confirming.
                    </p>

                    <p className="mt-10 border-y border-pub-onink/15 py-7 font-mono text-[clamp(1.8rem,6vw,2.6rem)] tracking-[0.12em] text-pub-signal">
                        {token}
                    </p>

                    <p className="mt-4 text-sm text-pub-onink-soft">
                        Texted to {draft.customerPhone}. Write it down anyway — a text can go astray.
                    </p>

                    <div className="mt-10 flex flex-wrap gap-3">
                        <button onClick={() => onNavigate(`/track?code=${encodeURIComponent(token)}`)}
                            className="bg-pub-laterite px-7 py-3.5 text-sm font-semibold text-pub-onink hover:bg-pub-laterite-soft">
                            Track it now
                        </button>
                        <button onClick={() => onNavigate('/')}
                            className="border border-pub-onink/25 px-7 py-3.5 text-sm font-semibold text-pub-onink hover:border-pub-onink">
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-pub-paper px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl">
                <p className="data-label text-pub-laterite">Booking · no account needed</p>
                <h1 className="display-wide mt-5 text-[clamp(2.2rem,5vw,3.2rem)] text-pub-onpaper">
                    Where&apos;s it going?
                </h1>

                {/* Progress as a rule that fills, not three circles with
                    ticks — this is a short form, not an achievement. */}
                <div className="mt-10 flex gap-2" aria-hidden="true">
                    {STEPS.map((name, index) => (
                        <div key={name} className="flex-1">
                            <div className={`h-0.5 ${index <= step ? 'bg-pub-laterite' : 'bg-pub-onpaper/20'}`} />
                            <p className={`data-label mt-2 ${index === step ? 'text-pub-laterite' : 'text-pub-onpaper-soft'}`}>{name}</p>
                        </div>
                    ))}
                </div>
                <p className="sr-only" role="status">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

                <div className="mt-12 grid gap-7">
                    {step === 0 ? (
                        <>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">Collect from</span>
                                <input className={field} value={draft.pickupAddress} placeholder="Gikondo Industrial Zone, gate 3"
                                    onChange={(e) => setDraft({ ...draft, pickupAddress: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">Deliver to</span>
                                <input className={field} value={draft.deliveryAddress} placeholder="Kimironko Market, shop 14"
                                    onChange={(e) => setDraft({ ...draft, deliveryAddress: e.target.value })} />
                            </label>
                            <div className="grid gap-7 sm:grid-cols-2">
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">What is it</span>
                                    <select className={field} value={draft.cargoType}
                                        onChange={(e) => setDraft({ ...draft, cargoType: e.target.value })}>
                                        <option value="">Choose…</option>
                                        {cargoTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">Weight in kg</span>
                                    <input type="number" min="1" className={field} value={weightInput} placeholder="150"
                                        onChange={(e) => setWeightInput(e.target.value)} />
                                </label>
                            </div>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">Anything the driver should know — optional</span>
                                <textarea rows={2} className={`${field} resize-none`} value={draft.specialInstructions}
                                    placeholder="Fragile. Ask for Claudine at the gate."
                                    onChange={(e) => setDraft({ ...draft, specialInstructions: e.target.value })} />
                            </label>
                        </>
                    ) : step === 1 ? (
                        <>
                            <div className="grid gap-7 sm:grid-cols-2">
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">Your name</span>
                                    <input className={field} value={draft.customerName} placeholder="Jean Mutabazi"
                                        onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">Phone</span>
                                    <input className={field} value={draft.customerPhone} placeholder="0788 000 000"
                                        onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })} />
                                </label>
                            </div>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">Email — optional</span>
                                <input type="email" className={field} value={draft.customerEmail} placeholder="you@company.rw"
                                    onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} />
                            </label>
                            <p className="border-l-2 border-pub-laterite pl-4 text-sm leading-relaxed text-pub-onpaper-soft">
                                Your tracking code goes to this number, and it&apos;s the number the
                                dispatcher rings if the pickup address needs checking.
                            </p>
                        </>
                    ) : (
                        <>
                            <dl className="grid gap-0">
                                {[
                                    ['Collect from', draft.pickupAddress],
                                    ['Deliver to', draft.deliveryAddress],
                                    ['Cargo', draft.cargoType],
                                    ['Weight', weightInput ? `${weightInput} kg` : ''],
                                    ['Contact', `${draft.customerName} · ${draft.customerPhone}`],
                                    ...(draft.specialInstructions ? [['Notes', draft.specialInstructions]] : []),
                                ].map(([term, value]) => (
                                    <div key={term} className="grid grid-cols-[9rem_1fr] gap-4 border-b border-pub-onpaper/15 py-3.5">
                                        <dt className="data-label pt-0.5 text-pub-onpaper-soft">{term}</dt>
                                        <dd className="text-[15px] text-pub-onpaper">{value || '—'}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="text-sm leading-relaxed text-pub-onpaper-soft">
                                A dispatcher checks this before any driver is sent. You&apos;ll get a
                                tracking code straight away.
                            </p>
                            {error ? <p role="alert" className="text-sm font-medium text-pub-laterite">{error}</p> : null}
                        </>
                    )}
                </div>

                <div className="mt-12 flex items-center justify-between gap-4 border-t border-pub-onpaper/15 pt-7">
                    <button onClick={() => (step === 0 ? onNavigate('/') : setStep(step - 1))}
                        className="text-sm font-semibold text-pub-onpaper-soft hover:text-pub-onpaper">
                        {step === 0 ? 'Cancel' : '← Back'}
                    </button>

                    {step < 2 ? (
                        <button onClick={() => setStep(step + 1)} disabled={step === 0 ? !cargoValid : !contactValid}
                            className="bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:cursor-not-allowed disabled:opacity-30">
                            Continue
                        </button>
                    ) : (
                        <button onClick={confirm} disabled={submitting}
                            className="bg-pub-laterite px-8 py-4 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft disabled:opacity-60">
                            {submitting ? 'Placing…' : 'Place the order'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
