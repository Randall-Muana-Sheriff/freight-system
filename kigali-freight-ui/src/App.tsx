import { lazy, Suspense } from 'react';
import './utils/mapIcons'; // side-effect: configures default Leaflet icon paths
import { SocketProvider, useSocket } from './context/SocketContext';
import AuthForm from './components/AuthForm';
import ImageLightbox from './components/ImageLightbox';
import ErrorBoundary from './components/ErrorBoundary';
import { DialogProvider } from './components/DialogProvider';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { setNoIndex } from './utils/seo';
import { resolveSurface, shouldRedirectToStaffHost, staffUrl } from './utils/surface';
import { RouteLoader } from './components/RouteLoader';
import { getStaffDomain } from './utils/runtimeConfig';

// Only one of these two ever renders at a time (gated by showAdminCenter),
// and neither is needed at all until after login — code-splitting them
// keeps Leaflet/react-leaflet and the admin panels out of the initial
// bundle a dispatcher downloads just to see the login screen. Previously
// the whole app (dashboard + admin center + every map dependency) shipped
// as a single ~550KB chunk regardless of which screen was actually shown.
const Dashboard = lazy(() => import('./components/Dashboard'));
const AdminControlCenterPage = lazy(() => import('./components/AdminControlCenterPage'));
// Wall displays (control room, dispatch desk, warehouse) — no login, no
// SocketProvider, code-split for the same reason as the two above.
const KioskApp = lazy(() => import('./kiosk/KioskApp'));
// The customer-facing site. Code-split for the same reason as the rest:
// a dispatcher signing in should not download the marketing pages, and a
// customer placing an order should not download Leaflet and the admin
// centre.
const PublicSite = lazy(() => import('./public/PublicSite'));

// The wait between asking for a screen and getting it. Public and staff
// surfaces get different palettes because they are different products;
// resolveSurface has already run by the time this renders, so the caller
// passes what it knows rather than this guessing again.
function ScreenLoading({ tone = 'board' }: { tone?: 'board' | 'public' }) {
  return <RouteLoader tone={tone} />;
}

function AppShell() {
  const {
    jwtToken, showAdminCenter, viewingImage, setViewingImage,
    incidentReports, activeBreachedDrivers,
  } = useSocket();

  // Counted rather than "is there anything at all": a dispatcher wants to
  // know the board went from two problems to three without looking at it.
  // Only things still open — a resolved incident is history, not a demand
  // on anyone's attention — and only while signed in, since the login
  // screen has no business advertising operational state to whoever walks
  // past the monitor.
  const openIncidents = incidentReports.filter((i) => !i.resolved_at).length;
  const attention = jwtToken ? openIncidents + Object.keys(activeBreachedDrivers).length : 0;

  useDocumentTitle(
    !jwtToken ? 'Sign in' : showAdminCenter ? 'Control centre' : 'Dispatch',
    attention
  );

  return (
    // ops-surface sits here rather than on Dashboard because the sign-in
    // screen, the control centre and the board are three siblings, not a
    // hierarchy — putting it on one of them left the other two with faux
    // bold (the board disables weight synthesis) and with the public site's laterite
    // focus ring instead of the board's orange. Everything staff-facing
    // shares one set of root type settings; the customer site has its own.
    <div className="ops-surface contents">
      <Suspense fallback={<ScreenLoading />}>
        {!jwtToken ? <AuthForm /> : showAdminCenter ? <AdminControlCenterPage /> : <Dashboard />}
      </Suspense>
      <ImageLightbox url={viewingImage} onClose={() => setViewingImage(null)} />
    </div>
  );
}

export default function App() {
  // Checked once, not routed — there's no router in this app (see the
  // comment on AppShell above), and a handful of static paths for
  // unattended devices and public pages doesn't justify adding one. Each
  // gets its own tree entirely, not just a different screen inside
  // SocketProvider's dispatcher-only login/CRUD context.
  // Decided by hostname first, then path — see utils/surface.ts. A host
  // called "dispatch" serves the board at its own root, so the team's
  // existing bookmarks keep working; /dispatch still works anywhere.
  const surface = resolveSurface();

  // The board has exactly one home.
  //
  // It answers on the apex's /dispatch path too, so old bookmarks survive,
  // but a session signed in there is stranded on that origin: the JWT
  // lives in localStorage, which is per-origin, so it does not carry to
  // the canonical host and — the part that actually matters — signing out
  // there cannot clear a token sitting in the other origin's storage.
  // Moving before anything renders means only one origin ever holds a
  // session, so the sign-out button can always reach it.
  //
  // replace() rather than assign() so the wrong origin does not sit in
  // history for the back button to return to. No-ops entirely when no
  // staff domain is configured, which is every local checkout.
  const staffDomain = getStaffDomain();
  if (shouldRedirectToStaffHost(surface, staffDomain)) {
    window.location.replace(staffUrl(staffDomain));
    return <ScreenLoading />;
  }

  // Neither the dispatcher board nor a wall display belongs in a search
  // result. Set before render so it is in place by the time a crawler
  // finishes executing the page.
  if (surface !== 'public') setNoIndex();

  if (surface === 'kiosk') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ScreenLoading />}>
          <KioskApp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // The customer site owns the public host. Deliberately not inside
  // SocketProvider — that context assumes a dispatcher session and starts
  // fetching authenticated feeds.
  if (surface === 'public') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ScreenLoading tone="public" />}>
          <PublicSite />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SocketProvider>
        {/* Inside SocketProvider but outside AppShell, so the dashboard,
            the admin centre and MapInteractionContext can all reach it. */}
        <DialogProvider>
          <AppShell />
        </DialogProvider>
      </SocketProvider>
    </ErrorBoundary>
  );
}
