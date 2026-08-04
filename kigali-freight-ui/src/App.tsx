import { lazy, Suspense } from 'react';
import './utils/mapIcons'; // side-effect: configures default Leaflet icon paths
import { SocketProvider, useSocket } from './context/SocketContext';
import AuthForm from './components/AuthForm';
import ImageLightbox from './components/ImageLightbox';
import ErrorBoundary from './components/ErrorBoundary';

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

function ScreenLoading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-ink text-steel text-xs font-mono">
      Loading...
    </div>
  );
}

function AppShell() {
  const { jwtToken, showAdminCenter, viewingImage, setViewingImage } = useSocket();
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
  // comment on AppShell above), and one static path for an unattended
  // device doesn't justify adding one. A kiosk gets its own tree entirely,
  // not just a different screen inside SocketProvider's dispatcher-only
  // login/CRUD context.
  if (window.location.pathname.startsWith('/kiosk')) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<ScreenLoading />}>
          <KioskApp />
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
