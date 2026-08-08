// src/components/AdminControlCenterPage.tsx — full-screen admin console,
// separate from the day-to-day dispatch dashboard. Structured as a proper
// settings-style console (left nav, one section at a time) rather than one
// long stacked scroll — Statistics, Invite Driver, Document Verification,
// User & Role Governance, and the Audit Log each get the full content width
// instead of fighting neighbors for space.
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { ArrowLeft, BarChart3, FileCheck, ShieldCheck, ScrollText, Users, Truck, PackageCheck, AlertTriangle, Clock, RefreshCw, UserPlus, MonitorPlay, Settings } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { fetchAdminStats, fetchFleetPerformanceReport } from '../utils/api';
import AdminUserGovernance from './AdminUserGovernance';
import InviteDriverPanel from './InviteDriverPanel';
import SystemAuditLogs from './SystemAuditLogs';
import DriverDocumentReview from './DriverDocumentReview';
import KioskDevicesPanel from './KioskDevicesPanel';
import DispatchSettingsPanel from './DispatchSettingsPanel';

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

interface NavItem {
  id: string;
  label: string;
  icon: IconType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'drivers', label: 'Invite driver', icon: UserPlus },
  { id: 'documents', label: 'Document verification', icon: FileCheck },
  { id: 'governance', label: 'User & role governance', icon: ShieldCheck },
  { id: 'kiosks', label: 'Kiosk displays', icon: MonitorPlay },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
  { id: 'settings', label: 'Dispatch settings', icon: Settings },
];

type OrderStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'ARRIVED' | 'DELIVERED' | 'CANCELLED';

const ORDER_STATUS_STYLE: Record<OrderStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'bg-hazard' },
  ASSIGNED: { label: 'Assigned', color: 'bg-carbon' },
  PICKED_UP: { label: 'Picked up', color: 'bg-carbon' },
  IN_TRANSIT: { label: 'In transit', color: 'bg-route' },
  ARRIVED: { label: 'Arrived', color: 'bg-route' },
  DELIVERED: { label: 'Delivered', color: 'bg-tarp' },
  CANCELLED: { label: 'Cancelled', color: 'bg-rust' },
};
const ORDER_STATUS_ORDER: OrderStatus[] = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'];

interface AdminStats {
  accounts: { driver: number; dispatcher: number; admin: number };
  vehicles: number;
  deliveredThisWeek: number;
  openIncidents: number;
  avgDeliveryHours: number | null;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
}

interface FleetPerformanceRow {
  driverName: string;
  completedDeliveriesCount: number;
  averageUnloadingDwellTimeMinutes: number;
  worstCaseDwellTimeMinutes: number;
}

interface FleetPerformanceReport {
  fleetMetrics: FleetPerformanceRow[];
}

interface StatCardProps {
  icon: IconType;
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}

function StatCard({ icon: Icon, label, value, accent = 'text-route', sub }: StatCardProps) {
  return (
    <div className="bg-panel border border-line/10 rounded-md p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-steel font-mono">{label}</span>
        <Icon size={15} strokeWidth={2.5} className={accent} />
      </div>
      <div className="text-2xl font-bold text-paper tabular-nums">{value}</div>
      {sub ? <div className="text-[10px] text-steel">{sub}</div> : null}
    </div>
  );
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function StatisticsSection({ jwtToken }: { jwtToken: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats(jwtToken) as AdminStats);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalAccounts = stats ? stats.accounts.driver + stats.accounts.dispatcher + stats.accounts.admin : 0;
  const totalOrders = stats ? Object.values(stats.ordersByStatus).reduce((sum: number, n) => sum + (n || 0), 0) : 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-paper font-sans">Statistics</h2>
          <p className="text-[11px] text-steel mt-0.5">System-wide counts, refreshed on demand.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-steel hover:text-paper transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={12} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="p-3 bg-rust/10 border border-rust/30 text-rust rounded text-xs font-mono mb-4">{error}</div>
      ) : null}

      {!stats && loading ? (
        <div className="text-steel text-xs font-mono">Loading statistics…</div>
      ) : stats ? (
        <div className="space-y-8">
          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-steel font-mono mb-3">Accounts &amp; fleet</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={Users} label="Drivers" value={stats.accounts.driver} accent="text-carbon" />
              <StatCard icon={Users} label="Dispatchers" value={stats.accounts.dispatcher} accent="text-carbon" sub={`${totalAccounts} accounts total`} />
              <StatCard icon={Truck} label="Vehicles" value={stats.vehicles} accent="text-route" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-steel font-mono mb-3">Delivery performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={PackageCheck} label="Delivered this week" value={stats.deliveredThisWeek} accent="text-tarp" />
              <StatCard
                icon={AlertTriangle}
                label="Open incidents"
                value={stats.openIncidents}
                accent={stats.openIncidents > 0 ? 'text-rust' : 'text-tarp'}
              />
              <StatCard icon={Clock} label="Avg. delivery time" value={formatHours(stats.avgDeliveryHours)} accent="text-carbon" sub="Creation to confirmed delivery" />
              <StatCard icon={PackageCheck} label="Total orders" value={totalOrders} accent="text-route" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-wider text-steel font-mono mb-3">Orders by status</h3>
            <div className="bg-panel border border-line/10 rounded-md p-4 space-y-3">
              {ORDER_STATUS_ORDER.filter((status) => stats.ordersByStatus[status]).length === 0 ? (
                <div className="text-steel text-xs font-mono text-center py-2">No orders recorded yet.</div>
              ) : (
                ORDER_STATUS_ORDER.map((status) => {
                  const count = stats.ordersByStatus[status] || 0;
                  if (count === 0) return null;
                  const pct = totalOrders > 0 ? Math.max((count / totalOrders) * 100, 3) : 0;
                  const style = ORDER_STATUS_STYLE[status];
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <div className="w-24 shrink-0 text-[11px] text-steel font-mono">{style.label}</div>
                      <div className="flex-1 h-2 bg-panel-soft rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${style.color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-10 shrink-0 text-right text-xs font-bold text-paper tabular-nums">{count}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <FleetPerformanceSection />
        </div>
      ) : null}
    </section>
  );
}

// Per-driver unloading dwell-time analytics — how long a driver typically
// sits at the destination between arrival and confirmed delivery, and their
// worst case. Only covers drivers with at least one DELIVERED order that has
// a matching arrival geofence alert, so a small/new fleet may show nothing.
function FleetPerformanceSection() {
  const { jwtToken, resolveDriverName } = useSocket();
  const [report, setReport] = useState<FleetPerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchFleetPerformanceReport(jwtToken) as FleetPerformanceReport);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = report?.fleetMetrics || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-wider text-steel font-mono">Fleet performance &middot; unloading dwell time</h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-steel hover:text-paper transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={12} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="p-3 bg-rust/10 border border-rust/30 text-rust rounded text-xs font-mono">{error}</div>
      ) : !report && loading ? (
        <div className="text-steel text-xs font-mono">Loading performance report…</div>
      ) : metrics.length === 0 ? (
        <div className="bg-panel border border-line/10 rounded-md p-4 text-steel text-xs font-mono text-center">
          No driver has a completed delivery with a recorded arrival yet.
        </div>
      ) : (
        <div className="bg-panel border border-line/10 rounded-md overflow-hidden">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-line/10 text-steel uppercase text-[9px] tracking-wider font-mono">
                <th className="px-4 py-2 font-medium">Driver</th>
                <th className="px-4 py-2 font-medium text-right">Deliveries</th>
                <th className="px-4 py-2 font-medium text-right">Avg. dwell</th>
                <th className="px-4 py-2 font-medium text-right">Worst case</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((row) => (
                <tr key={row.driverName} className="border-b border-line/5 last:border-0">
                  <td className="px-4 py-2 text-paper font-bold truncate max-w-[200px]">{resolveDriverName(row.driverName)}</td>
                  <td className="px-4 py-2 text-right font-mono text-carbon tabular-nums">{row.completedDeliveriesCount}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatHours(row.averageUnloadingDwellTimeMinutes / 60)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-hazard">{formatHours(row.worstCaseDwellTimeMinutes / 60)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminControlCenterPage() {
  const { jwtToken, userRole, setShowAdminCenter } = useSocket();
  const [activeSection, setActiveSection] = useState('overview');

  if (userRole !== 'admin') {
    return null;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-ink text-paper overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-line/10 shrink-0">
        <button
          type="button"
          onClick={() => setShowAdminCenter(false)}
          className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-steel hover:text-paper transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.5} />
          Back to dispatch
        </button>
        <h1 className="text-sm font-bold uppercase tracking-wide text-paper">Admin Control Center</h1>
        <div className="w-[110px]" aria-hidden="true" />
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-60 shrink-0 border-r border-line/10 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[12px] font-bold text-left transition-colors ${
                  isActive ? 'bg-route/12 text-route border border-route/30' : 'text-steel border border-transparent hover:text-paper hover:bg-panel-soft'
                }`}
              >
                <Icon size={15} strokeWidth={2.5} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-6xl">
            {activeSection === 'overview' && <StatisticsSection jwtToken={jwtToken} />}
            {activeSection === 'drivers' && <InviteDriverPanel />}
            {activeSection === 'documents' && <DriverDocumentReview />}
            {activeSection === 'governance' && <AdminUserGovernance />}
            {activeSection === 'kiosks' && <KioskDevicesPanel />}
            {activeSection === 'audit' && <SystemAuditLogs />}
            {activeSection === 'settings' && <DispatchSettingsPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}
