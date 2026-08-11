import { lazy, Suspense } from 'react';
import './utils/mapIcons'; // side-effect: configures default Leaflet icon paths
import { SocketProvider, useSocket } from './context/SocketContext';
import AuthForm from './components/AuthForm';
import ImageLightbox from './components/ImageLightbox';
import ErrorBoundary from './components/ErrorBoundary';
import { useDocumentTitle } from './hooks/useDocumentTitle';

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

function ScreenLoading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-ink text-steel text-xs font-mono">
      Loading...
    </div>
  );
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
    <>
      <Suspense fallback={<ScreenLoading />}>
        {!jwtToken ? <AuthForm /> : showAdminCenter ? <AdminControlCenterPage /> : <Dashboard />}
      </Suspense>
      <ImageLightbox url={viewingImage} onClose={() => setViewingImage(null)} />
    </>
  );
}

export default function App() {
  // Checked once, not routed — there's no router in this app (see the
  // comment on AppShell above), and a handful of static paths for
  // unattended devices and public pages doesn't justify adding one. Each
  // gets its own tree entirely, not just a different screen inside
  // SocketProvider's dispatcher-only login/CRUD context.
  const path = window.location.pathname;

  if (path.startsWith('/kiosk')) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ScreenLoading />}>
          <KioskApp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // The customer site owns the root, and the dispatcher board moved to
  // /dispatch. A company's public pages are what a stranger typing the
  // domain should get; the internal tool is the thing that needs a path.
  // Deliberately not inside SocketProvider — that context assumes a
  // dispatcher session and starts fetching authenticated feeds.
  if (!path.startsWith('/dispatch')) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ScreenLoading />}>
          <PublicSite />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <SocketProvider>
        <AppShell />
      </SocketProvider>
    </ErrorBoundary>
  );
}
