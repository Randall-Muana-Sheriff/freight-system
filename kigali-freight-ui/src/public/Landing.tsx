import { useState, type FormEvent } from 'react';
import { sendContactMessage } from './publicApi';
import { HeroRoute } from './HeroRoute';
import { HeroTerrain } from './HeroTerrain';
import { HERO, SERVICES, JOURNEY, ABOUT, CONTACT } from './content';

// Copy lives in content.ts. This file is layout only, so the writing can
// be read and edited as writing.

function SectionHead({ eyebrow, headline, onPaper = true, className = '' }: {
    eyebrow: string; headline: string; onPaper?: boolean; className?: string;
}) {
    return (
        <div className={className}>
            <p className={`data-label mb-5 ${onPaper ? 'text-pub-laterite' : 'text-pub-laterite-soft'}`}>{eyebrow}</p>
            <h2 className={`display-wide text-[clamp(2rem,4.5vw,3.2rem)] ${onPaper ? 'text-pub-onpaper' : 'text-pub-onink'}`}
                style={{ textWrap: 'balance' } as React.CSSProperties}>
                {headline}
            </h2>
        </div>
    );
}

function ContactForm() {
    const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setState('sending');
        setError(null);
        try {
            await sendContactMessage(form);
            setState('sent');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send your message.');
            setState('idle');
        }
    };

    if (state === 'sent') {
        return (
            <div className="border-l-2 border-pub-laterite bg-pub-paper2 px-8 py-10">
                <p className="display-tight text-2xl text-pub-onpaper">Message received.</p>
                <p className="mt-2 text-sm text-pub-onpaper-soft">We answer on the number you gave us, usually the same day.</p>
            </div>
        );
    }

    const field = 'w-full border-b border-pub-onpaper/20 bg-transparent py-2.5 text-[15px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

    return (
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">Name</span>
                <input required className={field} value={form.name} placeholder="Jean Mutabazi"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">Phone</span>
                <input required className={field} value={form.phone} placeholder="0788 000 000"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">Email — optional</span>
                <input type="email" className={field} value={form.email} placeholder="you@company.rw"
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">What do you need moved?</span>
                <textarea required rows={3} className={`${field} resize-none`} value={form.message}
                    placeholder="Two pallets a week from Gikondo to Musanze…"
                    onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>

            {error ? <p role="alert" className="text-sm text-pub-laterite sm:col-span-2">{error}</p> : null}

            <div className="sm:col-span-2">
                <button type="submit" disabled={state === 'sending'}
                    className="focus-ring bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:opacity-60">
                    {state === 'sending' ? 'Sending…' : 'Send message'}
                </button>
            </div>
        </form>
    );
}

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
    const [code, setCode] = useState('');

    return (
        <>
            {/* ── THE ROAD ─────────────────────────────────────────────── */}
            <section className="relative isolate overflow-hidden bg-pub-ink px-5 pb-16 pt-14 sm:pt-20">
                <HeroTerrain />
                {/* Sits above the terrain, and re-enables pointer events the
                    canvas turns off so the buttons underneath still work. */}
                <div className="relative z-10 mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
                    <div>
                        <p className="data-label mb-7 text-pub-laterite-soft">{HERO.eyebrow}</p>
                        <h1 className="display-wide text-[clamp(2.9rem,7.5vw,5.2rem)] text-pub-onink"
                            style={{ textWrap: 'balance' } as React.CSSProperties}>
                            {HERO.headline[0]}<br />{HERO.headline[1]}
                        </h1>
                        <p className="mt-7 max-w-md text-lg leading-relaxed text-pub-onink-soft">{HERO.body}</p>

                        <div className="mt-9 flex flex-wrap items-center gap-3">
                            <button data-tour="book" onClick={() => onNavigate('/order')}
                                className="focus-ring bg-pub-laterite px-8 py-4 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                                Book a delivery
                            </button>
                            <form data-tour="track"
                                onSubmit={(e) => { e.preventDefault(); if (code.trim()) onNavigate(`/track?code=${encodeURIComponent(code.trim())}`); }}
                                className="flex items-center border-b border-pub-onink/25 focus-within:border-pub-onink">
                                <label htmlFor="hero-track" className="sr-only">Tracking code</label>
                                <input id="hero-track" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Have a code?"
                                    className="w-40 bg-transparent px-1 py-3.5 font-mono text-sm uppercase text-pub-onink placeholder:normal-case placeholder:text-pub-onink-soft/70 focus:outline-none" />
                                <button type="submit" className="focus-ring px-2 py-3.5 text-sm font-semibold text-pub-onink hover:text-pub-signal">Track →</button>
                            </form>
                        </div>
                    </div>

                    <HeroRoute />
                </div>
            </section>

            {/* ── THE PAPERWORK ────────────────────────────────────────── */}
            <section id="services" className="bg-pub-paper px-5 py-20 sm:py-28">
                <div className="mx-auto max-w-6xl">
                    <SectionHead eyebrow={SERVICES.eyebrow} headline={SERVICES.headline} className="mb-14 max-w-2xl" />
                    <div className="grid gap-x-14 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                        {SERVICES.items.map((service) => (
                            <article key={service.name} className="border-t border-pub-onpaper/15 pt-5">
                                <p className="data-label mb-3 text-pub-laterite">{service.spec}</p>
                                <h3 className="display-tight text-xl text-pub-onpaper">{service.name}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-pub-onpaper-soft">{service.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* The one section that is genuinely a sequence, so the one
                section drawn as a route with ordinals. */}
            <section id="how" className="bg-pub-paper2 px-5 py-20 sm:py-28">
                <div className="mx-auto max-w-3xl">
                    <SectionHead eyebrow={JOURNEY.eyebrow} headline={JOURNEY.headline} className="mb-14" />
                    <ol className="relative">
                        <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-3 w-px bg-pub-onpaper/20" />
                        {JOURNEY.stops.map((stop, index) => (
                            <li key={stop.name} className="relative flex gap-7 pb-11 last:pb-0">
                                <span aria-hidden="true"
                                    className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                                        index === 0 ? 'border-pub-laterite bg-pub-laterite' : 'border-pub-onpaper/40 bg-pub-paper2'
                                    }`} />
                                <div>
                                    <p className="data-label mb-1.5 text-pub-onpaper-soft">Stop {index + 1}</p>
                                    <h3 className="display-tight text-lg text-pub-onpaper">{stop.name}</h3>
                                    <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-pub-onpaper-soft">{stop.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Returns to the dark ground: this section is about the
                machinery on the road, and it gives the long light stretch
                a break before the page closes on the contact form. */}
            <section id="about" className="bg-pub-ink px-5 py-20 sm:py-28">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 max-w-2xl">
                        <SectionHead eyebrow={ABOUT.eyebrow} headline={ABOUT.headline} onPaper={false} />
                        <p className="mt-6 text-lg leading-relaxed text-pub-onink-soft">{ABOUT.intro}</p>
                    </div>

                    <div className="grid gap-x-14 gap-y-10 md:grid-cols-3">
                        {ABOUT.views.map((view) => (
                            <article key={view.title} className="border-t border-pub-onink/15 pt-5">
                                <h3 className="display-tight text-lg text-pub-onink">{view.title}</h3>
                                <p className="mt-2.5 text-[15px] leading-relaxed text-pub-onink-soft">{view.body}</p>
                            </article>
                        ))}
                    </div>

                    <p className="mt-12 max-w-2xl border-l-2 border-pub-laterite pl-5 text-[15px] leading-relaxed text-pub-onink-soft">
                        {ABOUT.closing}
                    </p>
                </div>
            </section>

            <section id="contact" className="bg-pub-paper px-5 py-20 sm:py-28">
                <div className="mx-auto grid max-w-5xl gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
                    <div>
                        <SectionHead eyebrow={CONTACT.eyebrow} headline={CONTACT.headline} />
                        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-pub-onpaper-soft">{CONTACT.body}</p>
                        <p className="data-label mt-8 text-pub-onpaper-soft">{CONTACT.address}</p>
                    </div>
                    <ContactForm />
                </div>
            </section>
        </>
    );
}
