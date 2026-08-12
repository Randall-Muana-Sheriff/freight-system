import { useEffect, useState, type FormEvent } from 'react';
import { HeroTerrain } from './HeroTerrain';
import { InziraMark } from './InziraMark';
import { sendContactMessage } from './publicApi';
import { LAUNCH_DATE, LAUNCH_LABEL } from './launch';

// The holding page shown until LAUNCH_DATE. Same ground, same type, same
// terrain as the real site — a visitor who comes back after launch should
// recognise the place rather than think they landed somewhere new.

function remaining(target: Date) {
    const ms = Math.max(0, target.getTime() - Date.now());
    return {
        days: Math.floor(ms / 86400000),
        hours: Math.floor(ms / 3600000) % 24,
        minutes: Math.floor(ms / 60000) % 60,
        seconds: Math.floor(ms / 1000) % 60,
        done: ms === 0,
    };
}

function Unit({ value, label }: { value: number; label: string }) {
    return (
        <div className="text-center">
            <div className="display-wide text-[clamp(2.1rem,7vw,3.6rem)] tabular-nums text-pub-onink">
                {String(value).padStart(2, '0')}
            </div>
            <div className="data-label mt-1 text-pub-onink-soft">{label}</div>
        </div>
    );
}

function NotifyForm() {
    const [form, setForm] = useState({ name: '', phone: '' });
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setState('sending');
        setError(null);
        try {
            // Reuses the contact endpoint rather than adding a mailing-list
            // table for a form that exists for a few months. The message
            // text is what tells a dispatcher why this person wrote in.
            await sendContactMessage({
                ...form,
                message: `Wants to be told when Inzira opens (${LAUNCH_LABEL}). Submitted from the pre-launch page.`,
            });
            setState('sent');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save your number.');
            setState('idle');
        }
    };

    if (state === 'sent') {
        return (
            <p className="border-l-2 border-pub-laterite pl-5 text-left text-[15px] leading-relaxed text-pub-onink">
                Thanks — we&apos;ll text you on the day we open.
            </p>
        );
    }

    const field = 'w-full border-b border-pub-onink/25 bg-transparent py-2.5 text-[15px] text-pub-onink placeholder:text-pub-onink-soft/60 focus:border-pub-onink focus:outline-none';

    return (
        <form onSubmit={submit} className="grid gap-4 text-left sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
                <span className="data-label text-pub-onink-soft">Name</span>
                <input required className={field} value={form.name} placeholder="Jean Mutabazi"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
                <span className="data-label text-pub-onink-soft">Phone</span>
                <input required className={field} value={form.phone} placeholder="0788 000 000"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <button type="submit" disabled={state === 'sending'}
                className="bg-pub-laterite px-6 py-3 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft disabled:opacity-60">
                {state === 'sending' ? 'Saving…' : 'Tell me when'}
            </button>
            {error ? <p role="alert" className="text-sm text-pub-laterite-soft sm:col-span-3">{error}</p> : null}
        </form>
    );
}

export function ComingSoon() {
    const [left, setLeft] = useState(() => remaining(LAUNCH_DATE));

    useEffect(() => {
        const id = window.setInterval(() => setLeft(remaining(LAUNCH_DATE)), 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-pub-ink">
            <HeroTerrain />

            <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-12">
                <div className="flex items-baseline gap-3">
                    <InziraMark className="h-7 w-7 translate-y-1" />
                    <span className="display-tight text-2xl text-pub-onink">Inzira</span>
                    <span className="data-label text-pub-onink-soft/70">the way</span>
                </div>

                <p className="data-label mt-10 text-pub-laterite-soft">Opening {LAUNCH_LABEL}</p>
                <h1 className="display-wide mt-5 text-[clamp(2.1rem,5.5vw,3.4rem)] text-pub-onink"
                    style={{ textWrap: 'balance' } as React.CSSProperties}>
                    Freight across Kigali,
                    <br />
                    with nothing hidden.
                </h1>
                <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-pub-onink-soft">
                    We&apos;re building a freight service where the person who sent the cargo can
                    see exactly where it is, the whole way. Not open to the public yet — leave
                    your number and we&apos;ll tell you the day it is.
                </p>

                {/* The numbers are decoration; the date above is the real
                    information, so a screen reader is given that and not a
                    counter that changes every second. */}
                <div className="mt-10 flex gap-6 sm:gap-12" aria-hidden="true">
                    <Unit value={left.days} label="Days" />
                    <Unit value={left.hours} label="Hours" />
                    <Unit value={left.minutes} label="Min" />
                    <Unit value={left.seconds} label="Sec" />
                </div>
                <p className="sr-only">Inzira opens on {LAUNCH_LABEL}.</p>

                <div className="mt-10 border-t border-pub-onink/15 pt-8">
                    <NotifyForm />
                </div>
            </main>

            <footer className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-8">
                <p className="data-label text-pub-onink-soft/50">
                    Gikondo Industrial Zone · Kigali, Rwanda
                </p>
            </footer>
        </div>
    );
}
