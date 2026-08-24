import { useState } from 'react';
import { HeroRoute } from './HeroRoute';
import { HeroTerrain } from './HeroTerrain';
import { useLanguage } from './i18n';
import { SECTION, BLOCK, CARD, CARD_HOVER } from './sections/kit';
import { ServicesSection } from './sections/Services';
import { ContactSection } from './sections/Contact';

// The hub. It used to be the whole site: eight bands stacked on one page,
// roughly eight thousand pixels of scroll, with the answer to "what does
// it cost" four screens below the fold. Pricing, the business track, the
// walkthrough and the questions are pages now, and this opens the door to
// each of them instead of containing them.
//
// Layout only — the writing lives in i18n/en.ts so it can be read and
// edited as writing.
// Icons for the three entry cards.
//
// Drawn here rather than pulled from an icon set. The brand mark is a
// stroked route ending in a dot, so these use the same language — one
// weight, round caps, currentColor — and read as part of the same family
// instead of three pictograms borrowed from somewhere else. It also keeps
// an icon library out of a bundle that a customer downloads to book one
// delivery.

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
            className="mx-auto h-10 w-10 text-pub-laterite transition-transform duration-200 group-hover:-translate-y-0.5"
            fill="none" stroke="currentColor" strokeWidth={2.1}
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
            // Navigates rather than scrolls, because the business section is
            // no longer on this page.
            //
            // It scrolled to id="business" until the site was split into
            // pages and that section moved to /business. getElementById
            // returned null, the optional chain swallowed it, and the card
            // did nothing at all — no error, no console warning, just a
            // click that went nowhere. A scroll target on another page is
            // the one kind of dead link that leaves no trace.
            go: () => onNavigate('/business'),
        },
    ];

    // Narrower than the block above and pulled up over its lower edge, so
    // the two read as one composition. Matching the block width exactly
    // would make them look like a fourth band rather than something
    // sitting on the hero.
    return (
        <section className="relative z-20 -mt-12 px-8 sm:-mt-14 sm:px-12">
            <div className="mx-auto grid max-w-4xl gap-1.5 md:grid-cols-3 md:gap-2">
                {cards.map((card) => (
                    // flex-col/justify-start rather than relying on the
                    // default: a button centres its content vertically, so in
                    // French — where "Liaisons régulières, tarifées par
                    // entreprise." wraps to two lines — the third card's title
                    // rode 10px higher than its neighbours and the row of
                    // three stopped lining up. Top-aligned, a longer
                    // translation grows downwards and the titles stay level.
                    <button key={card.title} onClick={card.go}
                        className={`focus-ring group flex flex-col items-center justify-start bg-pub-paper px-5 py-6 text-center ${CARD} ${CARD_HOVER}`}>
                        <CardIcon shape={card.icon} />
                        <h2 className="display-tight mt-4 text-base text-pub-onpaper">{card.title}</h2>
                        <p className="mt-1 text-[14px] leading-snug text-pub-onpaper-soft">{card.body}</p>
                    </button>
                ))}
            </div>
        </section>
    );
}

// The four doors. Paths here, titles and prose in the dictionary — the
// order of this list is the order of `explore.items`, and a test asserts
// the two are the same length so a card added on one side and forgotten on
// the other fails the build rather than rendering blank.
export const EXPLORE_PATHS = ['/pricing', '/business', '/how-it-works', '/faq'] as const;

function Explore({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    return (
        <section className={SECTION}>
            <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
            <div className="mx-auto max-w-6xl">
                <div className="mb-12 max-w-2xl">
                    <p className="data-label text-pub-laterite">{t.explore.eyebrow}</p>
                    <h2 className="display-wide mt-3 text-4xl text-pub-onpaper sm:text-5xl">{t.explore.headline}</h2>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    {t.explore.items.map((item, i) => (
                        <button key={item.title} onClick={() => onNavigate(EXPLORE_PATHS[i])}
                            className={`focus-ring group bg-pub-paper2 px-6 py-7 text-left ${CARD} ${CARD_HOVER}`}>
                            <h3 className="display-tight text-xl text-pub-onpaper">{item.title}</h3>
                            <p className="mt-2 text-[17px] leading-relaxed text-pub-onpaper-soft">{item.body}</p>
                            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-pub-laterite">
                                {item.cta}
                                <svg viewBox="0 0 12 10" aria-hidden="true"
                                    className="h-2.5 w-3 transition-transform group-hover:translate-x-0.5">
                                    <path d="M1 5h9M6.5 1.5 10 5l-3.5 3.5" fill="none" stroke="currentColor"
                                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>
                    ))}
                </div>
            </div>
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
                <div className={`${BLOCK} relative isolate overflow-hidden bg-pub-ink px-6 pb-16 pt-8 sm:px-12 sm:pb-24 sm:pt-14`}>
                    {/* A fleet, behind everything else.
                        Resized from the 4000px original to 1920 and
                        recompressed — 3.5MB down to 550KB. At 18% opacity
                        behind a gradient, the difference between the two is
                        invisible and the difference in what a visitor on a
                        Kigali mobile connection waits for is not.

                        The green wash over it is lighter than it was, so more
                        of the photograph reads through. It still runs strongest
                        at the top left and thins toward the bottom right, which
                        is not decorative: that is the corner the prompt, the
                        code field and the booking button sit in, and light text
                        needs the ground under it to stay dark whatever the
                        picture behind is doing.

                        aria-hidden with an empty alt — announcing "photograph
                        of Kigali" before the tracking field would be noise.
                        Source: Markus Winkler, unsplash.com/photos/3vlGNkDep4E */}
                    <img
                        src="/images/hero-fleet.jpg"
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.30]"
                    />
                    <div aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-pub-ink/85 via-pub-ink/60 to-pub-ink/35" />
                <HeroTerrain />
                {/* Sits above the terrain, and re-enables pointer events the
                    canvas turns off so the buttons underneath still work. */}
                {/* Two columns from md, not lg. The illustration is only hidden
                        because below the two-column breakpoint it stacks under
                        the copy and pushes the cards off the screen — so where
                        it can sit beside the copy, it should. At lg the gap
                        between them was leaving a band of widths with a
                        half-empty hero and no diagram in it. */}
                    <div className="relative z-10 grid gap-10 md:grid-cols-[1fr_1fr] md:items-center md:gap-12">
                    <div>
                        {/* What the business does, then the two things you
                            can do about it.

                            This led with "Track your cargo" and made booking
                            the outlined secondary, on the reasoning that people
                            arriving with a code outnumber people arriving to
                            book. That is a fair bet for an established carrier
                            and the wrong one here: nobody holds a code yet, so
                            every visitor is a first-time one being shown a
                            control they cannot use and no statement of what is
                            being sold.

                            Still one line of copy, not three — the previous
                            author was right that a headline, an eyebrow and a
                            paragraph would crowd the only two actions here. */}
                        <h1 className="display-hero text-[clamp(1.9rem,4.4vw,3.1rem)] text-pub-onink">
                            {t.hero.headline}
                        </h1>

                        {/* The supporting line. The headline names the city
                            and stops; this is where the rest of the country
                            and the two things that make booking easy get
                            said, which is the job every Uber and DHL hero
                            gives its second line. */}
                        <p className="mt-5 max-w-md text-lg leading-relaxed text-pub-onink-soft">
                            {t.hero.lead}
                        </p>

                        <button data-tour="book" onClick={() => onNavigate('/order')}
                            className="focus-ring mt-7 rounded-md bg-pub-laterite px-7 py-3.5 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                            {t.actions.book}
                        </button>

                        {/* Tracking keeps its own field rather than becoming a
                            link: someone who does hold a code should not have
                            to load another page to use it. Demoted, not
                            hidden. */}
                        <div data-tour="track" className="mt-8 border-t border-pub-onink/15 pt-5">
                            <label htmlFor="hero-track" className="data-label text-pub-onink-soft">
                                {t.misc.haveACode}
                            </label>
                            <form
                                onSubmit={(e) => { e.preventDefault(); if (code.trim()) onNavigate(`/track?code=${encodeURIComponent(code.trim())}`); }}
                                className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input id="hero-track" value={code} onChange={(e) => setCode(e.target.value)}
                                    placeholder={t.misc.codePlaceholder}
                                    className="focus-ring min-w-0 flex-1 rounded-md border border-pub-onink/20 bg-pub-ink2 px-4 py-3 font-mono text-sm uppercase text-pub-onink placeholder:text-pub-onink-soft/50 focus:border-pub-onink/50 focus:outline-none" />
                                <button type="submit"
                                    className="focus-ring rounded-md border border-pub-onink/25 px-6 py-3 text-sm font-semibold text-pub-onink transition-colors hover:border-pub-onink hover:bg-pub-onink/5">
                                    {t.actions.trackSubmit}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="hidden md:block">
                        <HeroRoute />
                    </div>
                    </div>
                </div>
            </section>

            <EntryCards onNavigate={onNavigate} />


            {/* ── THE PAPERWORK ────────────────────────────────────────── */}
            <ServicesSection />

            <Explore onNavigate={onNavigate} />

            <ContactSection />
        </>
    );
}
