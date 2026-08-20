import { useEffect, useState } from 'react';
import { fetchCargoTypes, submitOrder, type OrderDraft } from './publicApi';
import { useLanguage, useApiError } from './i18n';

// Booking is paperwork, so it is styled as paperwork: daylight, ruled
// fields, mono labels, no cards floating on a gradient. The restraint is
// the point — the hero can be the showpiece, a form someone is filling in
// with a lorry waiting should be quiet and legible.

// Dictionary keys, not labels — the three step names translate too.
const STEPS = ['cargo', 'contact', 'check'] as const;

// The step lives in the URL and the draft in sessionStorage, so a refresh
// mid-booking — or a back button pressed out of habit — returns someone to
// the form as they left it rather than to an empty one. Someone booking
// freight is often doing it standing next to the cargo on a phone, where
// both are easy to do by accident and retyping it all is the difference
// between a booking and an abandoned one.
const DRAFT_KEY = 'inzira.order.draft';

type StoredDraft = { draft: OrderDraft; weightInput: string };

const EMPTY_DRAFT: OrderDraft = {
    pickupAddress: '', deliveryAddress: '', cargoType: '', weightKg: 0,
    specialInstructions: '', customerName: '', customerPhone: '', customerEmail: '',
};

function readStored(): StoredDraft {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<StoredDraft>;
            return {
                draft: { ...EMPTY_DRAFT, ...parsed.draft },
                weightInput: typeof parsed.weightInput === 'string' ? parsed.weightInput : '',
            };
        }
    } catch {
        // sessionStorage throws outright in some private modes. Not worth
        // surfacing: the form starts empty, which is what it did before.
    }
    return { draft: EMPTY_DRAFT, weightInput: '' };
}

function readStepParam() {
    const raw = Number(new URLSearchParams(window.location.search).get('step'));
    return Number.isInteger(raw) && raw > 0 && raw < STEPS.length ? raw : 0;
}

// A question about the customer's need, in their language. Deliberately
// not "priority": asked how important their delivery is, everybody says
// very — asked when they need it, people answer honestly, because it is a
// fact about their week rather than a status they are claiming.
// Values only. The value is what the server stores and validates; the
// label is looked up per language at render time.
const NEEDED_BY = ['today', 'tomorrow', 'this_week', 'flexible'] as const;

const field = 'w-full border-b border-pub-onpaper/25 bg-transparent py-2.5 text-[17px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

export function OrderFlow({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    const describeError = useApiError();
    const [stored] = useState(readStored);
    const [requestedStep, setRequestedStep] = useState(readStepParam);
    const [cargoTypes, setCargoTypes] = useState<string[]>([]);
    const [draft, setDraft] = useState<OrderDraft>(stored.draft);
    const [weightInput, setWeightInput] = useState(stored.weightInput);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchCargoTypes().then(setCargoTypes).catch(() => setCargoTypes([]));
    }, []);

    const cargoValid = draft.pickupAddress.trim() && draft.deliveryAddress.trim() && draft.cargoType && Number(weightInput) > 0;
    const contactValid = draft.customerName.trim() && draft.customerPhone.trim();

    // A step is only reachable once the ones before it are filled in, which
    // clamps both a stale ?step= left over from a refresh and a hand-edited
    // URL. Derived rather than corrected in an effect so there is no frame
    // where the wrong step is on screen.
    const step = Math.min(requestedStep, !cargoValid ? 0 : !contactValid ? 1 : 2);

    useEffect(() => {
        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, weightInput }));
        } catch {
            // Storage full or unavailable costs the refresh safety net and
            // nothing else, so the booking carries on regardless.
        }
    }, [draft, weightInput]);

    useEffect(() => {
        const onPop = () => setRequestedStep(readStepParam());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Forward moves push an entry so Back walks the form; backward moves hand
    // off to the browser's own stack rather than pushing a second time.
    const advance = (next: number) => {
        window.history.pushState({}, '', next === 0 ? '/order' : `/order?step=${next}`);
        setRequestedStep(next);
        window.scrollTo({ top: 0 });
    };

    const confirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            setToken(await submitOrder({ ...draft, weightKg: Number(weightInput) }));
            // Placed, so the draft has served its purpose. Leaving a name and
            // phone number sitting in storage after the fact earns nothing.
            try {
                sessionStorage.removeItem(DRAFT_KEY);
            } catch {
                // Nothing to clean up if it was never writable.
            }
        } catch (err) {
            setError(describeError(err));
        } finally {
            setSubmitting(false);
        }
    };

    const copyCode = async () => {
        if (!token) return;
        try {
            await navigator.clipboard.writeText(token);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // The clipboard is permission-gated and absent over plain http.
            // The code is on screen and selectable, so failing quietly is
            // honest — an error about copying helps nobody read a number.
        }
    };

    // Confirmation goes dark: the job has left the paperwork and joined the
    // road, and the code is the one thing on screen worth reading.
    if (token) {
        return (
            <div className="bg-pub-ink px-5 py-24">
                <div className="mx-auto max-w-xl">
                    <p className="data-label text-pub-signal">{t.order.received}</p>
                    <h1 className="display-wide mt-5 text-[clamp(2.2rem,5vw,3.2rem)] text-pub-onink">
                        {t.steps.keepCode}
                    </h1>
                    <p className="mt-5 text-[17px] leading-relaxed text-pub-onink-soft">
                        {t.steps.keepCodeBody}
                    </p>

                    {/* The copy sits on the same rule as the code rather than
                        under it: the instruction is "keep this", and the way
                        to keep it should be within reach of the thing itself. */}
                    <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-y border-pub-onink/15 py-7">
                        <p className="font-mono text-[clamp(1.8rem,6vw,2.6rem)] tracking-[0.12em] text-pub-signal">
                            {token}
                        </p>
                        <button onClick={copyCode}
                            className="focus-ring data-label shrink-0 text-pub-onink-soft transition-colors hover:text-pub-onink">
                            {copied ? t.buttons.copied : t.buttons.copyCode}
                        </button>
                    </div>
                    <p aria-live="polite" className="sr-only">{copied ? t.order.codeCopied : ''}</p>

                    <p className="mt-4 text-[15px] text-pub-onink-soft">
                        Texted to {draft.customerPhone}. Write it down anyway — a text can go astray.
                    </p>

                    <div className="mt-10 flex flex-wrap gap-3">
                        <button onClick={() => onNavigate(`/track?code=${encodeURIComponent(token)}`)}
                            className="focus-ring rounded-md bg-pub-laterite px-7 py-3.5 text-sm font-semibold text-pub-onink hover:bg-pub-laterite-soft">
                            {t.steps.trackItNow}
                        </button>
                        <button onClick={() => onNavigate('/')}
                            className="focus-ring rounded-md border border-pub-onink/25 px-7 py-3.5 text-sm font-semibold text-pub-onink hover:border-pub-onink">{t.steps.done}</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-pub-paper px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl">
                <p className="data-label text-pub-laterite">{t.order.eyebrow}</p>
                <h1 className="display-wide mt-5 text-[clamp(2.2rem,5vw,3.2rem)] text-pub-onpaper">
                    {t.steps.heading}
                </h1>

                {/* Progress as a rule that fills, not three circles with
                    ticks — this is a short form, not an achievement. */}
                <div className="mt-10 flex gap-2" aria-hidden="true">
                    {STEPS.map((name, index) => (
                        <div key={t.steps[name]} className="flex-1">
                            <div className={`h-0.5 ${index <= step ? 'bg-pub-laterite' : 'bg-pub-onpaper/20'}`} />
                            <p className={`data-label mt-2 ${index === step ? 'text-pub-laterite' : 'text-pub-onpaper-soft'}`}>{t.steps[name]}</p>
                        </div>
                    ))}
                </div>
                <p className="sr-only" role="status">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>

                <div className="mt-12 grid gap-7">
                    {step === 0 ? (
                        <>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">{t.order.collectFrom}</span>
                                <input className={field} value={draft.pickupAddress} placeholder={t.order.collectPlaceholder}
                                    onChange={(e) => setDraft({ ...draft, pickupAddress: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">{t.order.deliverTo}</span>
                                <input className={field} value={draft.deliveryAddress} placeholder={t.order.deliverPlaceholder}
                                    onChange={(e) => setDraft({ ...draft, deliveryAddress: e.target.value })} />
                            </label>
                            <div className="grid gap-7 sm:grid-cols-2">
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">{t.order.whatIsIt}</span>
                                    <select className={field} value={draft.cargoType}
                                        onChange={(e) => setDraft({ ...draft, cargoType: e.target.value })}>
                                        <option value="">{t.order.choose}</option>
                                        {cargoTypes.map((type) => (
                                            // value stays the server's English
                                            // identifier; only the label is
                                            // translated, and an unknown type
                                            // falls back to showing itself.
                                            <option key={type} value={type}>
                                                {t.cargo[type as keyof typeof t.cargo] ?? type}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">{t.order.weight}</span>
                                    <input type="number" min="1" className={field} value={weightInput} placeholder={t.order.weightPlaceholder}
                                        onChange={(e) => setWeightInput(e.target.value)} />
                                </label>
                            </div>
                            {/* Buttons rather than a select: four short
                                answers are quicker to tap than to open,
                                and on a form this size the options being
                                visible is what makes the question feel
                                answerable rather than like more work. */}
                            <fieldset className="block">
                                <legend className="data-label text-pub-onpaper-soft">{t.order.neededBy}</legend>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {NEEDED_BY.map((value) => {
                                        const chosen = draft.neededBy === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={chosen}
                                                // Tapping the chosen one again clears it, so
                                                // an optional question stays optional once
                                                // it has been answered by accident.
                                                onClick={() => setDraft({ ...draft, neededBy: chosen ? undefined : value })}
                                                className={`focus-ring rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                                                    chosen
                                                        ? 'border-pub-laterite bg-pub-laterite text-pub-onink'
                                                        : 'border-pub-onpaper/25 text-pub-onpaper-soft hover:border-pub-onpaper/50 hover:text-pub-onpaper'
                                                }`}
                                            >
                                                {t.neededBy[value]}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* Said plainly, because "Today" on a form is
                                    easily read as a promise. A dispatcher
                                    decides what is actually possible. */}
                                <p className="mt-3 text-[15px] leading-relaxed text-pub-onpaper-soft">
                                    {t.steps.neededByNote}
                                </p>
                            </fieldset>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">{t.order.instructions}</span>
                                <textarea rows={2} className={`${field} resize-none`} value={draft.specialInstructions}
                                    placeholder={t.order.instructionsPlaceholder}
                                    onChange={(e) => setDraft({ ...draft, specialInstructions: e.target.value })} />
                            </label>
                        </>
                    ) : step === 1 ? (
                        <>
                            <div className="grid gap-7 sm:grid-cols-2">
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">{t.order.yourName}</span>
                                    <input className={field} value={draft.customerName} placeholder={t.order.namePlaceholder}
                                        onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="data-label text-pub-onpaper-soft">{t.form.phone}</span>
                                    <input className={field} value={draft.customerPhone} placeholder={t.order.phonePlaceholder}
                                        onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })} />
                                </label>
                            </div>
                            <label className="block">
                                <span className="data-label text-pub-onpaper-soft">{t.form.emailOptional}</span>
                                <input type="email" className={field} value={draft.customerEmail} placeholder={t.order.emailPlaceholder}
                                    onChange={(e) => setDraft({ ...draft, customerEmail: e.target.value })} />
                            </label>
                            <p className="border-l-2 border-pub-laterite pl-4 text-[15px] leading-relaxed text-pub-onpaper-soft">
                                {t.steps.phoneNote}
                            </p>
                        </>
                    ) : (
                        <>
                            <dl className="grid gap-0">
                                {[
                                    [t.review.collectFrom, draft.pickupAddress],
                                    [t.review.deliverTo, draft.deliveryAddress],
                                    [t.review.cargo, t.cargo[draft.cargoType as keyof typeof t.cargo] ?? draft.cargoType],
                                    [t.review.weight, weightInput ? `${weightInput} kg` : ''],
                                    ...(draft.neededBy
                                        ? [[t.review.needed, t.neededBy[draft.neededBy as keyof typeof t.neededBy] ?? '']]
                                        : []),
                                    [t.review.contact, `${draft.customerName} · ${draft.customerPhone}`],
                                    ...(draft.specialInstructions ? [[t.review.notes, draft.specialInstructions]] : []),
                                ].map(([term, value]) => (
                                    <div key={term} className="grid grid-cols-[9rem_1fr] gap-4 border-b border-pub-onpaper/15 py-3.5">
                                        <dt className="data-label pt-0.5 text-pub-onpaper-soft">{term}</dt>
                                        <dd className="text-[17px] text-pub-onpaper">{value || '—'}</dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="text-[15px] leading-relaxed text-pub-onpaper-soft">
                                A dispatcher checks this before any driver is sent. You&apos;ll get a
                                tracking code straight away.
                            </p>
                            {error ? <p role="alert" className="text-[15px] font-medium text-pub-laterite">{error}</p> : null}
                        </>
                    )}
                </div>

                <div className="mt-12 flex items-center justify-between gap-4 border-t border-pub-onpaper/15 pt-7">
                    <button onClick={() => (step === 0 ? onNavigate('/') : window.history.back())}
                        className="focus-ring text-sm font-semibold text-pub-onpaper-soft hover:text-pub-onpaper">
                        {step === 0 ? t.buttons.cancel : t.buttons.back}
                    </button>

                    {step < 2 ? (
                        <button onClick={() => advance(step + 1)} disabled={step === 0 ? !cargoValid : !contactValid}
                            className="focus-ring rounded-md bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:cursor-not-allowed disabled:opacity-30">
                            {t.steps.continue}
                        </button>
                    ) : (
                        <button onClick={confirm} disabled={submitting}
                            className="focus-ring rounded-md bg-pub-laterite px-8 py-4 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft disabled:opacity-60">
                            {submitting ? t.actions.placing : t.actions.placeOrder}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
