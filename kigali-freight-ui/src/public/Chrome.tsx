// Shared header and footer. The header sits on the dark hero and the
// footer closes the page back into the dark, so the site opens and shuts
// on the road with the paperwork in between.
import { InziraMark } from './InziraMark';
import { restartTour } from './SiteTour';
import { staffUrl } from '../utils/surface';
import { getStaffDomain } from '../utils/runtimeConfig';
import { LANGUAGES, useLanguage, type Language } from './i18n';

// The id is structural (it must match a section on the landing page); the
// label is editorial. Keeping the label as a dictionary key rather than a
// string means the two cannot drift apart in one language and not the other.
const SECTIONS = [
    { id: 'services', key: 'whatWeMove' },
    { id: 'how', key: 'howItWorks' },
    { id: 'about', key: 'theSystem' },
    { id: 'contact', key: 'talkToUs' },
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
function goToSection(id: string, onNavigate: (to: string) => void) {
    const here = document.getElementById(id);
    if (here) {
        here.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    onNavigate('/');

    // The landing page is in this same chunk, so it mounts within a frame
    // or two — but React commits after the handler returns, so a single
    // requestAnimationFrame can still fire before the section exists.
    // Retrying for a short window is more honest than guessing one delay,
    // and gives up rather than looping if the target never appears.
    let framesLeft = 30;
    const scrollWhenReady = () => {
        const target = document.getElementById(id);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (framesLeft-- > 0) {
            requestAnimationFrame(scrollWhenReady);
        }
    };
    requestAnimationFrame(scrollWhenReady);
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
                className="focus-ring cursor-pointer appearance-none rounded-sm border border-pub-onink/20 bg-transparent py-1.5 pl-2.5 pr-7 text-sm text-pub-onink-soft transition-colors hover:border-pub-onink/40 hover:text-pub-onink"
            >
                {(Object.entries(LANGUAGES) as [Language, string][]).map(([code, label]) => (
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
    return (
        <header className="bg-pub-ink">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5">
                <button onClick={() => onNavigate('/')} aria-label={t.nav.home}
                    className="focus-ring flex items-baseline gap-3">
                    <InziraMark className="h-6 w-6 translate-y-1" />
                    <span className="display-tight text-xl text-pub-onink">Inzira</span>
                    {/* The word is Kinyarwanda for "the way". Worth saying
                        once, quietly, rather than assuming everyone knows. */}
                    <span className="data-label hidden text-pub-onink-soft/70 sm:inline">the way</span>
                </button>

                <nav className="hidden items-center gap-8 md:flex">
                    {SECTIONS.map((section) => (
                        <button key={section.id} onClick={() => goToSection(section.id, onNavigate)}
                            className="focus-ring text-sm text-pub-onink-soft transition-colors hover:text-pub-onink">
                            {t.nav[section.key]}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-3">
                    <LanguagePicker />
                    <button onClick={() => onNavigate('/order')}
                        className="focus-ring bg-pub-laterite px-5 py-2.5 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                        {t.actions.book}
                    </button>
                </div>
            </div>
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
                            <InziraMark className="h-6 w-6 translate-y-1" />
                            <span className="display-tight text-xl text-pub-onink">Inzira</span>
                        </div>
                        <p className="mt-4 max-w-xs text-sm leading-relaxed text-pub-onink-soft">{t.footer.tagline}</p>
                    </div>

                    <div className="flex flex-col items-start gap-2.5">
                        <p className="data-label mb-1 text-pub-onink-soft/60">{t.footer.getMoving}</p>
                        <button className={link} onClick={() => onNavigate('/order')}>{t.actions.book}</button>
                        <button className={link} onClick={() => onNavigate('/track')}>{t.actions.track}</button>
                        <button className={link} onClick={() => goToSection('contact', onNavigate)}>{t.actions.standingRoutes}</button>
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
