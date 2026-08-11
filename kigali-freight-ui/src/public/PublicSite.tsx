import { useEffect, useState } from 'react';
import { PublicHeader, PublicFooter } from './Chrome';
import { Landing } from './Landing';
import { OrderFlow } from './OrderFlow';
import { TrackPage } from './TrackPage';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SiteTour } from './SiteTour';

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

export default function PublicSite() {
    const [route, setRoute] = useState<Route>(readRoute);

    // Landing gets the bare product name: a company's home page titling
    // itself "Home · Inzira" reads like a site map, not a front door.
    useDocumentTitle(TITLES[route.path] ?? '');

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

    return (
        <div className="min-h-screen bg-pub-paper font-body text-pub-onpaper antialiased">
            <PublicHeader onNavigate={navigate} />
            <main>
                {route.path === '/order' ? (
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
            {route.path === '/' ? <SiteTour onBook={() => navigate('/order')} /> : null}
        </div>
    );
}
