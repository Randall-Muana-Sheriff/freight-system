// Shared header and footer. The header sits on the dark hero and the
// footer closes the page back into the dark, so the site opens and shuts
// on the road with the paperwork in between.
import { useEffect, useRef, useState } from 'react';
import { InziraMark } from './InziraMark';
import { restartTour } from './SiteTour';
import { staffUrl } from '../utils/surface';
import { getStaffDomain } from '../utils/runtimeConfig';
import { SELECTABLE_LANGUAGES, useLanguage, type Language } from './i18n';

// The navigation, in categories rather than a row of everything.
//
// This was six flat links, which is what a menu becomes when sections get
// added one at a time and nobody steps back: "Pricing" sat between "What we
// move" and "How it works" with nothing to say that the first two are the
// same question and the third is a different one. Grouped, the bar asks
// three things instead of six — what do you do, how does it work, how do I
// reach you — and each answer is a short list instead of a guess.
//
// The id is structural (it must match a section on the landing page); the
// label is a dictionary key rather than a string so the two cannot drift
// apart in one language and not the other. A flat entry carries `items:
// null` rather than omitting the field, so the two shapes narrow cleanly
// instead of needing a non-null assertion at every use.
const NAV = [
    {
        key: 'whatWeDo', to: null, section: null,
        items: [
            { key: 'whatWeMove', to: '/', section: 'services' },
            { key: 'pricing', to: '/pricing', section: null },
            { key: 'forBusiness', to: '/business', section: null },
        ],
    },
    {
        key: 'howItWorks', to: null, section: null,
        items: [
            { key: 'theJourney', to: '/how-it-works', section: null },
            { key: 'theSystem', to: '/how-it-works', section: 'system' },
            { key: 'questions', to: '/faq', section: null },
        ],
    },
    // Contact stays flat, and is a section of the landing page rather than
    // a page of its own. The form was briefly at the foot of all five
    // pages, which is how a repeated invitation turns into furniture — by
    // the third page it reads as a footer nobody wrote. One home, reached
    // from anywhere.
    { key: 'talkToUs', to: '/', section: 'contact', items: null },
] as const;

// Every link in the header and the "Standing routes" line in the footer
// points at a section of the landing page — but both chrome pieces render
// on every page, and those sections exist only on the landing one. This
// used to be a bare getElementById(...)?.scrollIntoView(), and the
// optional chaining swallowed the miss: on /order, /track, /privacy and
// /support the entire primary navigation did nothing at all, silently.
//
// So a section link now means "take me to that part of the site", not
// "scroll if it happens to be here": if the section is absent we go home
// first and scroll once it exists.
function goTo(
    dest: { to: string | null; section: string | null },
    onNavigate: (to: string) => void,
) {
    const here = window.location.pathname.replace(/\/+$/, '') || '/';
    const needsPage = dest.to !== null && dest.to !== here;

    if (!needsPage) {
        if (dest.section) document.getElementById(dest.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    onNavigate(dest.to!);
    if (!dest.section) {
        // A page of its own starts at the top; arriving halfway down it
        // because the last page was scrolled is disorienting.
        window.scrollTo(0, 0);
        return;
    }

    // The page is in this same chunk, so it mounts within a frame or two —
    // but React commits after the handler returns, so a single
    // requestAnimationFrame can still fire before the section exists.
    // Retrying for a short window is more honest than guessing one delay,
    // and gives up rather than looping if the target never appears.
    let framesLeft = 30;
    const scrollWhenReady = () => {
        const target = document.getElementById(dest.section!);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (framesLeft-- > 0) {
            requestAnimationFrame(scrollWhenReady);
        }
    };
    requestAnimationFrame(scrollWhenReady);
}

// One category of the navigation, and the panel it opens.
//
// Click to open, click to close — no hover. The first version opened on
// hover as well, which reads well on a desktop and is what most freight
// sites do, but the two gestures fight: a real mouse fires mouseenter
// immediately before click, so hovering opened the menu and the click that
// followed toggled it straight back shut. Behaviour that depends on whether
// a pointer happened to pass over the button first is behaviour that is
// different on a phone, a trackpad and a keyboard for no reason a visitor
// could guess. One gesture, identical everywhere, is worth more here than
// matching what DHL does.
//
// The panel's top padding — not a margin — is what puts air under the
// button, so the gap belongs to the menu rather than being a hole in it.
//
// Escape and a click elsewhere both close it. Those listeners are attached
// only while it is open; a document-level handler per menu left running for
// the life of the page is three handlers doing nothing on every click.
function NavMenu({ group, onNavigate }: {
    group: {
        key: 'whatWeDo' | 'howItWorks';
        items: readonly {
            key: 'whatWeMove' | 'pricing' | 'forBusiness' | 'theJourney' | 'theSystem' | 'questions';
            to: string | null;
            section: string | null;
        }[];
    };
    onNavigate: (to: string) => void;
}) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const wrap = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (!wrap.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            // Focus goes back to the button that opened it, or the keyboard
            // is left standing in a panel that has just been removed.
            wrap.current?.querySelector('button')?.focus();
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={wrap} className="relative">
            <button type="button" aria-expanded={open} aria-haspopup="true"
                onClick={() => setOpen((was) => !was)}
                className="focus-ring flex items-center gap-1.5 text-sm text-pub-onink-soft transition-colors hover:text-pub-onink">
                {t.nav[group.key]}
                <svg viewBox="0 0 10 6" aria-hidden="true"
                    className={`h-1.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {open ? (
                <div className="absolute left-0 top-full z-50 pt-3">
                    <div className="w-[19rem] rounded-md border border-pub-onink/10 bg-pub-ink2 p-2 shadow-2xl">
                        {group.items.map((item) => (
                            <button key={item.key} type="button"
                                onClick={() => { setOpen(false); goTo(item, onNavigate); }}
                                className="focus-ring block w-full rounded px-3 py-2.5 text-left transition-colors hover:bg-pub-onink/10">
                                <span className="block text-sm font-medium text-pub-onink">{t.nav[item.key]}</span>
                                <span className="mt-0.5 block text-[13px] leading-snug text-pub-onink-soft">
                                    {t.nav_desc[item.key]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// A native <select>, not a custom menu.
//
// Three languages is past the point where side-by-side buttons stay
// readable, and a hand-built dropdown would mean rebuilding focus
// trapping, Escape, click-outside, arrow-key movement and screen-reader
// semantics that the platform already gets right. On a phone this also
// opens the OS language picker rather than a cramped list rendered into
// a dark header — which is where most of these visitors are.
//
// Each option is written in its own language: somebody looking for
// Kinyarwanda scans for "Ikinyarwanda", not for the English word for it.
function LanguagePicker() {
    const { lang, setLang, t } = useLanguage();
    return (
        <div className="relative">
            <label htmlFor="language-picker" className="sr-only">{t.language.label}</label>
            <select
                id="language-picker"
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                // appearance-none removes the platform arrow so the chevron
                // below can match the site; pr-7 leaves it room.
                className="focus-ring rounded-md cursor-pointer appearance-none border border-pub-onink/20 bg-transparent py-1.5 pl-2.5 pr-7 text-sm text-pub-onink-soft transition-colors hover:border-pub-onink/40 hover:text-pub-onink"
            >
                {(Object.entries(SELECTABLE_LANGUAGES) as [Language, string][]).map(([code, label]) => (
                    // The option list is drawn by the OS, which paints its
                    // own background — so these need an explicit colour
                    // rather than inheriting the header's.
                    <option key={code} value={code} lang={code} className="bg-pub-ink text-pub-onink">
                        {label}
                    </option>
                ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 12 8"
                className="pointer-events-none absolute right-2 top-1/2 h-2 w-3 -translate-y-1/2 text-pub-onink-soft">
                <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
}

export function PublicHeader({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    const [menuOpen, setMenuOpen] = useState(false);

    // Escape closes it, because a panel covering the page with no visible
    // way back is the thing people actually get stuck in.
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    const go = (action: () => void) => { setMenuOpen(false); action(); };

    return (
        // Pinned, the way every freight site's is. The bar is the only way
        // back out of a page this long, and a visitor six sections down who
        // wants pricing should not have to scroll to the top to find the
        // word. z-50 clears the Leaflet panes on the staff side and the
        // hero art here; the dropdown panels sit at z-50 inside it.
        <header className="sticky top-0 z-50 bg-pub-ink">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
                <button onClick={() => onNavigate('/')} aria-label={t.nav.home}
                    className="focus-ring flex items-center gap-3">
                    <InziraMark className="h-8 w-8 sm:h-9 sm:w-9" />
                    {/* The name and its meaning as one stacked lockup rather
                        than three things in a row. Set beside the wordmark,
                        "the way" read as a third item in the bar; under it,
                        it reads as what it is — a gloss on the name.

                        No longer hidden on small screens either: stacked it
                        costs no width, and the whole point of the line is to
                        explain the name to someone meeting it for the first
                        time, which is most likely on a phone. */}
                    {/* Sized to the bar rather than the bar to it. Pinned,
                        the header is a permanent 8% of a laptop screen, and
                        at 93px it was taking a band the height of a paragraph
                        the whole way down the page — DHL's is 63. The lockup
                        is what set that height, so it is what came down. */}
                    <span className="flex flex-col leading-none">
                        {/* leading-none on the wordmark itself, not just the parent:
                            text-xl/text-2xl each ship a line-height of their
                            own, so the stack inherited nothing and carried an
                            eight-pixel line box the name never filled. */}
                        <span className="display-tight text-xl leading-none text-pub-onink sm:text-2xl">Inzira</span>
                        <span className="data-label mt-0.5 text-pub-onink-soft/70">the way</span>
                    </span>
                </button>

                {/* Collapses at lg, not md. Between 768 and 1024 the four section
                    links, the language picker and the booking button were all
                    still inline and had visibly run out of room — the sites
                    this follows are already showing a menu button by that
                    width. All four breakpoints in this header move together;
                    one left behind gives a width where the nav is hidden and
                    nothing replaces it. */}
                <nav className="hidden items-center gap-8 lg:flex">
                    {NAV.map((entry) => (entry.items === null ? (
                        <button key={entry.key} onClick={() => goTo(entry, onNavigate)}
                            className="focus-ring text-sm text-pub-onink-soft transition-colors hover:text-pub-onink">
                            {t.nav[entry.key]}
                        </button>
                    ) : (
                        <NavMenu key={entry.key} group={entry} onNavigate={onNavigate} />
                    )))}
                </nav>

                {/* On a narrow screen the bar carries the mark and the menu
                    button and nothing else — the earlier version kept the
                    language picker and the booking button inline too, which
                    put four things on a row with space for two and left the
                    header looking broken at exactly the width most visitors
                    arrive at. Both move into the panel below instead. */}
                <div className="hidden items-center gap-3 lg:flex">
                    <LanguagePicker />
                    <button onClick={() => onNavigate('/order')}
                        className="focus-ring rounded-md bg-pub-laterite px-5 py-2.5 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                        {t.actions.book}
                    </button>
                </div>

                <button type="button" onClick={() => setMenuOpen((open) => !open)}
                    aria-expanded={menuOpen}
                    aria-controls="mobile-nav"
                    aria-label={menuOpen ? t.nav_mobile.close : t.nav_mobile.open}
                    className="focus-ring -mr-2 p-2 text-pub-onink lg:hidden">
                    <svg viewBox="0 0 20 14" className="h-3.5 w-5" aria-hidden="true">
                        {menuOpen ? (
                            <path d="M2 2 18 12M18 2 2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        ) : (
                            <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Rendered only when open rather than hidden with a class, so
                its links are not reachable by keyboard while invisible. */}
            {menuOpen ? (
                <nav id="mobile-nav" className="border-t border-pub-onink/10 px-5 pb-5 lg:hidden">
                    {/* The same categories, but opened out rather than
                        collapsed. A phone has the vertical room, and an
                        accordion here would mean two taps to reach a
                        section that a heading and an indent reach in one. */}
                    <ul className="flex flex-col">
                        {NAV.map((entry) => (entry.items === null ? (
                            <li key={entry.key}>
                                <button onClick={() => go(() => goTo(entry, onNavigate))}
                                    className="focus-ring w-full border-b border-pub-onink/10 py-3.5 text-left text-[17px] text-pub-onink-soft transition-colors hover:text-pub-onink">
                                    {t.nav[entry.key]}
                                </button>
                            </li>
                        ) : (
                            <li key={entry.key} className="border-b border-pub-onink/10 py-3.5">
                                <p className="data-label text-pub-onink-soft/60">{t.nav[entry.key]}</p>
                                <ul className="mt-1.5 flex flex-col">
                                    {entry.items.map((item) => (
                                        <li key={item.key}>
                                            <button onClick={() => go(() => goTo(item, onNavigate))}
                                                className="focus-ring w-full py-2 text-left text-[17px] text-pub-onink-soft transition-colors hover:text-pub-onink">
                                                {t.nav[item.key]}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        )))}
                        <li>
                            <button onClick={() => go(() => onNavigate('/track'))}
                                className="focus-ring w-full border-b border-pub-onink/10 py-3.5 text-left text-[17px] text-pub-onink-soft transition-colors hover:text-pub-onink">
                                {t.actions.track}
                            </button>
                        </li>
                    </ul>

                    {/* The two controls the bar no longer has room for. The
                        call to action is full width here because on a phone
                        it is the only thing on the row. */}
                    <button onClick={() => go(() => onNavigate('/order'))}
                        className="focus-ring rounded-md mt-5 w-full bg-pub-laterite px-5 py-3.5 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                        {t.actions.book}
                    </button>
                    <div className="mt-4">
                        <LanguagePicker />
                    </div>
                </nav>
            ) : null}
        </header>
    );
}

export function PublicFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    const link = 'focus-ring text-left text-sm text-pub-onink-soft transition-colors hover:text-pub-onink';

    return (
        <footer className="bg-pub-ink px-5 pb-10 pt-16">
            <div className="mx-auto max-w-6xl">
                <div className="grid gap-10 border-b border-pub-onink/10 pb-12 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                        <div className="flex items-baseline gap-3">
                            <InziraMark className="h-8 w-8 translate-y-1" />
                            <span className="display-tight text-2xl text-pub-onink">Inzira</span>
                        </div>
                        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-pub-onink-soft">{t.footer.tagline}</p>
                    </div>

                    <div className="flex flex-col items-start gap-2.5">
                        <p className="data-label mb-1 text-pub-onink-soft/60">{t.footer.getMoving}</p>
                        <button className={link} onClick={() => onNavigate('/order')}>{t.actions.book}</button>
                        <button className={link} onClick={() => onNavigate('/track')}>{t.actions.track}</button>
                        <button className={link} onClick={() => goTo({ to: '/pricing', section: null }, onNavigate)}>{t.nav.pricing}</button>
                        {/* Was 'contact', which answered a different question
                            than the link asks — the same misdirection the
                            hero card had. Both now land on the section that
                            makes the offer. */}
                        <button className={link} onClick={() => goTo({ to: '/business', section: null }, onNavigate)}>{t.actions.standingRoutes}</button>
                        <button className={link} onClick={() => goTo({ to: '/faq', section: null }, onNavigate)}>{t.footer.questions}</button>
                    </div>

                    <div className="flex flex-col items-start gap-2.5">
                        <p className="data-label mb-1 text-pub-onink-soft/60">{t.footer.company}</p>
                        <span className="text-sm text-pub-onink-soft">{t.misc.address}</span>
                        <span className="text-sm text-pub-onink-soft">{t.misc.cityCountry}</span>
                        <button className={link} onClick={restartTour}>{t.actions.showMeAround}</button>
                        {/* A real anchor to the board's canonical host, not a
                            path nav. The session is per-origin, so sending
                            staff to this site's own /dispatch would give them
                            a login that does not carry to the host they are
                            meant to be using — and a sign-out that cannot
                            reach the other origin's token. Its own row rather
                            than filed under Company: it is not company
                            information, and the people who need it are
                            looking for it rather than reading the footer. */}
                        <a className={`${link} mt-3`} href={staffUrl(getStaffDomain())}>
                            {t.actions.staffSignIn}
                        </a>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-6">
                    <p className="data-label text-pub-onink-soft/50">
                        © {new Date().getFullYear()} Inzira
                    </p>
                    {/* Both app stores require a reachable privacy policy for
                        the driver app, and a link buried nowhere is the usual
                        reason that check fails. */}
                    <button className={link} onClick={() => onNavigate('/support')}>{t.actions.support}</button>
                    <button className={link} onClick={() => onNavigate('/privacy')}>{t.actions.privacy}</button>
                </div>
            </div>
        </footer>
    );
}
