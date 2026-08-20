import { useState, type FormEvent } from 'react';
import { sendContactMessage } from './publicApi';
import { HeroRoute } from './HeroRoute';
import { HeroTerrain } from './HeroTerrain';
import { useLanguage } from './i18n';

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
    const { t } = useLanguage();
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
                <p className="display-tight text-2xl text-pub-onpaper">{t.form.messageReceived}</p>
                <p className="mt-2 text-sm text-pub-onpaper-soft">{t.form.weAnswer}</p>
            </div>
        );
    }

    const field = 'w-full border-b border-pub-onpaper/20 bg-transparent py-2.5 text-[15px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

    return (
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">{t.form.name}</span>
                <input required className={field} value={form.name} placeholder={t.order.namePlaceholder}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">{t.form.phone}</span>
                <input required className={field} value={form.phone} placeholder={t.order.phonePlaceholder}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">{t.form.emailOptional}</span>
                <input type="email" className={field} value={form.email} placeholder={t.order.emailPlaceholder}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">{t.form.whatMoved}</span>
                <textarea required rows={3} className={`${field} resize-none`} value={form.message}
                    placeholder={t.misc.enquiryPlaceholder}
                    onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>

            {error ? <p role="alert" className="text-sm text-pub-laterite sm:col-span-2">{error}</p> : null}

            <div className="sm:col-span-2">
                <button type="submit" disabled={state === 'sending'}
                    className="focus-ring bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:opacity-60">
                    {state === 'sending' ? t.buttons.sending : t.buttons.send}
                </button>
            </div>
        </form>
    );
}


// Icons for the three entry cards.
//
// Drawn here rather than pulled from an icon set. The brand mark is a
// stroked route ending in a dot, so these use the same language — one
// weight, round caps, currentColor — and read as part of the same family
// instead of three pictograms borrowed from somewhere else. It also keeps
// an icon library out of a bundle that a customer downloads to book one
// delivery.
// Stated once so every band on the page sits in the same column and the
// gaps between them are even. A section that set its own would be the one
// that quietly drifts out of line.
const SECTION = 'px-4 py-3 sm:px-6 sm:py-4';
const BLOCK = 'mx-auto max-w-6xl overflow-hidden rounded-lg';

const ICONS = {
    // A parcel, drawn isometrically so it reads as a thing with weight
    // rather than a flat square.
    parcel: (
        <>
            <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
            <path d="M3.5 7.5 12 12l8.5-4.5" />
            <path d="M12 12v9" />
        </>
    ),
    // A destination pin — the same dot that ends the mark, given a place
    // to sit.
    pin: (
        <>
            <path d="M12 21c0 0 6.5-5.6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21z" />
            <circle cx="12" cy="10.5" r="2.4" />
        </>
    ),
    // A route that comes back round: the same journey, run again tomorrow.
    repeat: (
        <>
            <path d="M17 3.5 20.5 7 17 10.5" />
            <path d="M20.5 7H8.5a4.5 4.5 0 0 0 0 9H10" />
            <path d="M7 13.5 3.5 17 7 20.5" />
            <path d="M3.5 17h12a4.5 4.5 0 0 0 0-9h-1.5" />
        </>
    ),
};

function CardIcon({ shape }: { shape: keyof typeof ICONS }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true"
            className="h-7 w-7 text-pub-laterite transition-transform duration-200 group-hover:-translate-y-0.5"
            fill="none" stroke="currentColor" strokeWidth={1.6}
            strokeLinecap="round" strokeLinejoin="round">
            {ICONS[shape]}
        </svg>
    );
}

// The three ways into the service, sitting across the join between the
// hero and the page below it.
//
// Borrowed in structure from how large carriers open their homepage —
// the entry points are the first thing you meet, before any prose — but
// not in palette. DHL floats white cards on a wall of yellow; the accent
// here is used once and sparingly, so these are paper on ink with
// laterite carried by the icon alone.
//
// Overlapping is what makes it read as one composition rather than two
// stacked bands: the cards are pulled up over the hero's lower edge, and
// the hero carries the extra bottom padding that leaves room for them.
function EntryCards({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();

    const cards = [
        { icon: 'parcel' as const, title: t.entries.bookTitle, body: t.entries.bookBody, go: () => onNavigate('/order') },
        { icon: 'pin' as const, title: t.entries.trackTitle, body: t.entries.trackBody, go: () => onNavigate('/track') },
        {
            icon: 'repeat' as const, title: t.entries.standingTitle, body: t.entries.standingBody,
            go: () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        },
    ];

    // Narrower than the block above and pulled up over its lower edge, so
    // the two read as one composition. Matching the block width exactly
    // would make them look like a fourth band rather than something
    // sitting on the hero.
    return (
        <section className="relative z-20 -mt-16 px-8 sm:-mt-20 sm:px-12">
            <div className="mx-auto grid max-w-5xl gap-px overflow-hidden rounded-md bg-pub-onpaper/10 shadow-sm sm:grid-cols-3">
                {cards.map((card) => (
                    <button key={card.title} onClick={card.go}
                        className="focus-ring group bg-pub-paper px-7 py-8 text-left transition-colors hover:bg-pub-paper2">
                        <CardIcon shape={card.icon} />
                        <h2 className="display-tight mt-4 text-lg text-pub-onpaper">{card.title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-pub-onpaper-soft">{card.body}</p>
                    </button>
                ))}
            </div>
        </section>
    );
}

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    const [code, setCode] = useState('');

    return (
        <>
            {/* ── THE ROAD ─────────────────────────────────────────────── */}
            {/* Every band on this page is a block in one centred column
                rather than colour running edge to edge. The page ground
                shows between them, which is what makes a long page read as
                a stack of things rather than one continuous wall — and it
                is what the carriers whose homepages this follows all do.

                SECTION and BLOCK below carry that arrangement so the column
                width and the gap are stated once; a section that sets its
                own would be the one that quietly drifts. */}
            <section className={SECTION}>
                <div className={`${BLOCK} relative isolate overflow-hidden bg-pub-ink px-6 pb-28 pt-14 sm:px-12 sm:pb-36 sm:pt-20`}>
                <HeroTerrain />
                {/* Sits above the terrain, and re-enables pointer events the
                    canvas turns off so the buttons underneath still work. */}
                <div className="relative z-10 grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
                    <div>
                        <p className="data-label mb-7 text-pub-laterite-soft">{t.hero.eyebrow}</p>
                        <h1 className="display-wide text-[clamp(2.9rem,7.5vw,5.2rem)] text-pub-onink"
                            style={{ textWrap: 'balance' } as React.CSSProperties}>
                            {t.hero.headlineTop}<br />{t.hero.headlineBottom}
                        </h1>
                        <p className="mt-7 max-w-md text-lg leading-relaxed text-pub-onink-soft">{t.hero.body}</p>

                        {/* Stacked on a phone. Side by side these two were sharing a
                            row that fits one of them, which squeezed the code
                            field down to a few characters — the one control on
                            this page a returning customer came to use. */}
                        <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                            <button data-tour="book" onClick={() => onNavigate('/order')}
                                className="focus-ring bg-pub-laterite px-8 py-4 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                                {t.actions.book}
                            </button>
                            <form data-tour="track"
                                onSubmit={(e) => { e.preventDefault(); if (code.trim()) onNavigate(`/track?code=${encodeURIComponent(code.trim())}`); }}
                                className="flex flex-1 items-center border-b border-pub-onink/25 focus-within:border-pub-onink sm:flex-none">
                                <label htmlFor="hero-track" className="sr-only">{t.track.codeLabel}</label>
                                <input id="hero-track" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.misc.haveACode}
                                    className="w-full min-w-0 flex-1 bg-transparent px-1 py-3.5 font-mono text-sm uppercase text-pub-onink placeholder:normal-case placeholder:text-pub-onink-soft/70 focus:outline-none sm:w-40 sm:flex-none" />
                                <button type="submit" className="focus-ring px-2 py-3.5 text-sm font-semibold text-pub-onink hover:text-pub-signal">{t.actions.trackSubmit} →</button>
                            </form>
                        </div>
                    </div>

                    <HeroRoute />
                </div>
                </div>
            </section>

            <EntryCards onNavigate={onNavigate} />

            {/* ── THE PAPERWORK ────────────────────────────────────────── */}
            <section id="services" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <SectionHead eyebrow={t.services.eyebrow} headline={t.services.headline} className="mb-14 max-w-2xl" />
                    <div className="grid gap-x-14 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                        {t.services.items.map((service) => (
                            <article key={service.name} className="border-t border-pub-onpaper/15 pt-5">
                                <p className="data-label mb-3 text-pub-laterite">{service.spec}</p>
                                <h3 className="display-tight text-xl text-pub-onpaper">{service.name}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-pub-onpaper-soft">{service.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
                </div>
            </section>

            {/* The one section that is genuinely a sequence, so the one
                section drawn as a route with ordinals. */}
            <section id="how" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-3xl">
                    <SectionHead eyebrow={t.journey.eyebrow} headline={t.journey.headline} className="mb-14" />
                    <ol className="relative">
                        <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-3 w-px bg-pub-onpaper/20" />
                        {t.journey.stops.map((stop, index) => (
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
                </div>
            </section>

            {/* Returns to the dark ground: this section is about the
                machinery on the road, and it gives the long light stretch
                a break before the page closes on the contact form. */}
            <section id="about" className={SECTION}>
                <div className={`${BLOCK} bg-pub-ink px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 max-w-2xl">
                        <SectionHead eyebrow={t.about.eyebrow} headline={t.about.headline} onPaper={false} />
                        <p className="mt-6 text-lg leading-relaxed text-pub-onink-soft">{t.about.intro}</p>
                    </div>

                    <div className="grid gap-x-14 gap-y-10 md:grid-cols-3">
                        {t.about.views.map((view) => (
                            <article key={view.title} className="border-t border-pub-onink/15 pt-5">
                                <h3 className="display-tight text-lg text-pub-onink">{view.title}</h3>
                                <p className="mt-2.5 text-[15px] leading-relaxed text-pub-onink-soft">{view.body}</p>
                            </article>
                        ))}
                    </div>

                    <p className="mt-12 max-w-2xl border-l-2 border-pub-laterite pl-5 text-[15px] leading-relaxed text-pub-onink-soft">
                        {t.about.closing}
                    </p>
                </div>
                </div>
            </section>

            <section id="contact" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto grid max-w-5xl gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
                    <div>
                        <SectionHead eyebrow={t.contact.eyebrow} headline={t.contact.headline} />
                        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-pub-onpaper-soft">{t.contact.body}</p>
                        <p className="data-label mt-8 text-pub-onpaper-soft">{t.contact.address}</p>
                    </div>
                    <ContactForm />
                </div>
                </div>
            </section>
        </>
    );
}
