import { useEffect, useState } from 'react';
import { PublicHeader, PublicFooter } from './Chrome';
import { Landing } from './Landing';
import { OrderFlow } from './OrderFlow';
import { TrackPage } from './TrackPage';
import PrivacyPolicy from './PrivacyPolicy';
import Support from './Support';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SiteTour } from './SiteTour';
import { setCanonical, setDescription } from '../utils/seo';
import { ComingSoon } from './ComingSoon';
import { isPreLaunch, LAUNCH_LABEL } from './launch';
import { LanguageProvider, useLanguage } from './i18n';

// Still no router dependency — App.tsx already branches on pathname for
// /kiosk and adding one library to serve three static paths would be more
// machinery than the problem needs. This does the same by hand, but with
// history support, because unlike the kiosk these are pages a customer
// will reasonably use the back button on.
type Route = { path: string; code: string };

function readRoute(): Route {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const code = new URLSearchParams(window.location.search).get('code') || '';
    return { path, code };
}


// The search snippet has to match what the page actually says. Advertising
// a bookable service while the page tells visitors it is not open yet is
// the kind of mismatch that loses trust before anyone clicks twice.
const PRE_LAUNCH_DESCRIPTION = `Inzira is a freight service for Kigali where you can see exactly where your cargo is, the whole way. Opening ${LAUNCH_LABEL} — leave your number and we will tell you when.`;

// Its own component because PublicSite renders the provider and so cannot
// read from it in the same body — and this link, of all of them, has to be
// in the reader's language: it exists for people navigating by keyboard and
// screen reader, who are least served by guessing.
// Title and search description, in the reader's language.
//
// These were module constants keyed by path, which meant a French visitor
// got a French page inside an English browser tab and, worse, an English
// snippet in a French search result. Living inside the provider is what
// lets them follow the language.
function PageMeta({ path, holding }: { path: string; holding: boolean }) {
    const { t } = useLanguage();

    const titles: Record<string, string> = {
        '/order': t.meta.titleOrder,
        '/track': t.meta.titleTrack,
        '/privacy': t.meta.titlePrivacy,
        '/support': t.meta.titleSupport,
    };
    const descriptions: Record<string, string> = {
        '/order': t.meta.descOrder,
        '/track': t.meta.descTrack,
        '/privacy': t.meta.descPrivacy,
        '/support': t.meta.descSupport,
    };

    // Landing gets the bare product name: a company's home page titling
    // itself "Home · Inzira" reads like a site map, not a front door.
    useDocumentTitle(holding ? `Opening ${LAUNCH_LABEL}` : (titles[path] ?? ''));

    useEffect(() => {
        setCanonical();
        setDescription(holding ? PRE_LAUNCH_DESCRIPTION : (descriptions[path] ?? t.meta.descDefault));
    }, [path, holding, descriptions, t]);

    return null;
}

function SkipLink() {
    const { t } = useLanguage();
    return (
        <a href="#main"
            className="focus-ring sr-only focus:not-sr-only focus:fixed focus:left-5 focus:top-5 focus:z-50 focus:bg-pub-laterite focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-pub-onink">
            {t.actions.skipToContent}
        </a>
    );
}

export default function PublicSite() {
    const [route, setRoute] = useState<Route>(readRoute);

    // Landing gets the bare product name: a company's home page titling
    // itself "Home · Inzira" reads like a site map, not a front door.
    // /preview is the escape hatch: it shows the finished landing page
    // during the pre-launch period so the site can still be worked on and
    // shown to people, without being what a visitor to the root gets.
    const holding = isPreLaunch() && route.path === '/';

    // A marketing page scrolls; the dispatcher board does not. index.css
    // pins overflow:hidden on the root elements for the board's sake, so
    // this opts out for exactly as long as the public site is mounted.
    useEffect(() => {
        document.documentElement.classList.add('allow-scroll');
        return () => document.documentElement.classList.remove('allow-scroll');
    }, []);

    useEffect(() => {
        const onPop = () => setRoute(readRoute());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const navigate = (to: string) => {
        // Full load for the dispatcher app: it lives in a different lazy
        // chunk behind a different provider tree, and pushState alone would
        // leave this component mounted around it.
        if (to.startsWith('/dispatch')) {
            window.location.href = to;
            return;
        }
        window.history.pushState({}, '', to);
        setRoute(readRoute());
        window.scrollTo({ top: 0 });
    };

    // The holding page is the whole surface — no header or footer around
    // it, since there is nowhere else to go yet.
    if (holding) {
        return (
            <LanguageProvider>
                <PageMeta path={route.path} holding={holding} />
                <div className="font-body antialiased">
                    <ComingSoon />
                </div>
            </LanguageProvider>
        );
    }

    return (
        <LanguageProvider>
        <PageMeta path={route.path} holding={holding} />
        {/* The ground the blocks sit on. A shade darker than the paper
            blocks themselves, since a paper block on a paper ground has no
            edge and the whole arrangement collapses back into one wall. */}
        <div className="min-h-screen bg-pub-paper2 font-body text-pub-onpaper antialiased">
            {/* Four section links and a call to action sit between the top of
                the page and the content itself. This is the one tab that gets
                past them, and it stays invisible until it is focused. */}
            <SkipLink />
            <PublicHeader onNavigate={navigate} />
            {/* tabIndex lets the skip link actually move focus here rather
                than only scrolling, which is the half of it screen readers
                care about. */}
            <main id="main" tabIndex={-1} className="focus:outline-none">
                {route.path === '/preview' ? (
                    <Landing onNavigate={navigate} />
                ) : route.path === '/order' ? (
                    <OrderFlow onNavigate={navigate} />
                ) : route.path === '/track' ? (
                    <TrackPage initialCode={route.code} onNavigate={navigate} />
                ) : route.path === '/privacy' ? (
                    <PrivacyPolicy />
                ) : route.path === '/support' ? (
                    <Support />
                ) : (
                    <Landing onNavigate={navigate} />
                )}
            </main>
            <PublicFooter onNavigate={navigate} />

            {/* Landing only. Someone who lands straight on /track already
                knows what they came for, and someone mid-booking should
                not be interrupted by a tour of the page they left. */}
            {route.path === '/' || route.path === '/preview' ? <SiteTour onBook={() => navigate('/order')} /> : null}
        </div>
        </LanguageProvider>
    );
}
