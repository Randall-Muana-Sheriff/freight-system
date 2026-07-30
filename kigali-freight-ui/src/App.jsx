import './utils/mapIcons'; // side-effect: configures default Leaflet icon paths
import { SocketProvider, useSocket } from './context/SocketContext';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';

function AppShell() {
  const { jwtToken } = useSocket();
  return jwtToken ? <Dashboard /> : <AuthForm />;
}

export default function App() {
  return (
    <SocketProvider>
      <AppShell />
    </SocketProvider>
  );
}
