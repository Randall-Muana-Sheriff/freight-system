import { useEffect, useState } from 'react';
import { PublicHeader, PublicFooter } from './Chrome';
import { Landing } from './Landing';
import { OrderFlow } from './OrderFlow';
import { TrackPage } from './TrackPage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SiteTour } from './SiteTour';
import { setCanonical, setDescription } from '../utils/seo';
import { ComingSoon } from './ComingSoon';
import { isPreLaunch, LAUNCH_LABEL } from './launch';

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

// Customer-facing wording, not the internal screen names — "Dispatch" and
// "Control centre" mean nothing to someone checking on a delivery.
const TITLES: Record<string, string> = {
    '/order': 'Place an order',
    '/track': 'Track shipment',
};

// Each route needs its own, or all three compete in search results with
// the same summary and Google picks one arbitrarily.
const DESCRIPTIONS: Record<string, string> = {
    '/order': 'Book freight across Kigali in under a minute. Pickup, destination and cargo type — no account needed, and a tracking code by text as soon as it is placed.',
    '/track': 'Enter the code from your confirmation text to see where your Inzira consignment is, which stage it has reached, and who is driving it.',
};
const DEFAULT_DESCRIPTION = 'Same-day and bulk freight across Kigali. Book in under a minute with no account, then follow your cargo from pickup to signature with a tracking code.';

// The search snippet has to match what the page actually says. Advertising
// a bookable service while the page tells visitors it is not open yet is
// the kind of mismatch that loses trust before anyone clicks twice.
const PRE_LAUNCH_DESCRIPTION = `Inzira is a freight service for Kigali where you can see exactly where your cargo is, the whole way. Opening ${LAUNCH_LABEL} — leave your number and we will tell you when.`;

export default function PublicSite() {
    const [route, setRoute] = useState<Route>(readRoute);

    // Landing gets the bare product name: a company's home page titling
    // itself "Home · Inzira" reads like a site map, not a front door.
    // /preview is the escape hatch: it shows the finished landing page
    // during the pre-launch period so the site can still be worked on and
    // shown to people, without being what a visitor to the root gets.
    const holding = isPreLaunch() && route.path === '/';

    useDocumentTitle(holding ? `Opening ${LAUNCH_LABEL}` : (TITLES[route.path] ?? ''));

    useEffect(() => {
        setCanonical();
        setDescription(holding ? PRE_LAUNCH_DESCRIPTION : (DESCRIPTIONS[route.path] ?? DEFAULT_DESCRIPTION));
    }, [route.path, holding]);

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
            <div className="font-body antialiased">
                <ComingSoon />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-pub-paper font-body text-pub-onpaper antialiased">
            <PublicHeader onNavigate={navigate} />
            <main>
                {route.path === '/preview' ? (
                    <Landing onNavigate={navigate} />
                ) : route.path === '/order' ? (
                    <OrderFlow onNavigate={navigate} />
                ) : route.path === '/track' ? (
                    <TrackPage initialCode={route.code} onNavigate={navigate} />
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
    );
}
