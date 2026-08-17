// src/kiosk/KioskDashboard.tsx — the actual wall-display layout: a
// full-bleed live map with a glanceable status strip on top. No buttons,
// no forms, nothing that mutates state — every interactive affordance
// from the dispatcher dashboard is simply not rendered here, not
// disabled-but-present.
import { useEffect, useState } from 'react';
import { Truck, PackageCheck, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import KioskMap from './KioskMap';
import { fetchKigaliWeather, type KioskWeather } from './weather';
import { isUrgentIncident } from '../utils/incidentSeverity';
import type { Hub, Order, Incident, TrackedAsset } from '../types';

const WEATHER_POLL_MS = 10 * 60 * 1000;

interface KioskDashboardProps {
    isConnected: boolean;
    deviceLabel: string | null;
    trackedAssets: Record<string, TrackedAsset>;
    routeHistories: Record<string, [number, number][]>;
    savedHubs: Hub[];
    activeOrders: Order[];
    inFlightOrders: Order[];
    incidentReports: Incident[];
    resolveDriverName: (identifier: string) => string;
}

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    return now;
}

function StatChip({ icon, value, label, accentClassName }: { icon: React.ReactNode; value: number; label: string; accentClassName: string }) {
    return (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-panel/70 border border-line/10 rounded-lg">
            <div className={accentClassName}>{icon}</div>
            <div>
                <div className="text-3xl font-bold text-paper leading-none font-mono tabular-nums">{value}</div>
                <div className="text-micro text-steel uppercase tracking-widest mt-0.5">{label}</div>
            </div>
        </div>
    );
}

export default function KioskDashboard({
    isConnected,
    deviceLabel,
    trackedAssets,
    routeHistories,
    savedHubs,
    activeOrders,
    inFlightOrders,
    incidentReports,
    resolveDriverName,
}: KioskDashboardProps) {
    const now = useClock();
    const [weather, setWeather] = useState<KioskWeather | null>(null);

    useEffect(() => {
        void fetchKigaliWeather().then(setWeather);
        const id = setInterval(() => void fetchKigaliWeather().then(setWeather), WEATHER_POLL_MS);
        return () => clearInterval(id);
    }, []);

    const urgentIncidents = incidentReports.filter(isUrgentIncident);

    return (
        <div className="h-screen w-screen relative bg-ink overflow-hidden">
            <div className="absolute inset-0">
                <KioskMap trackedAssets={trackedAssets} routeHistories={routeHistories} savedHubs={savedHubs} resolveDriverName={resolveDriverName} />
            </div>

            <div className="absolute top-0 left-0 right-0 z-[500] flex items-center justify-between gap-4 px-6 py-4 bg-gradient-to-b from-ink/95 via-ink/70 to-transparent pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <div className="flex items-center gap-2">
                        {isConnected ? <Wifi size={16} className="text-tarp" /> : <WifiOff size={16} className="text-rust" />}
                        <span className="text-body font-bold uppercase tracking-widest text-paper">Inzira Fleet Operations</span>
                        {deviceLabel && (
                            <>
                                <span className="text-steel/40">·</span>
                                <span className="text-body font-bold uppercase tracking-widest text-route">{deviceLabel}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <StatChip icon={<PackageCheck size={22} strokeWidth={2.5} />} value={activeOrders.length} label="Awaiting dispatch" accentClassName="text-hazard" />
                    <StatChip icon={<Truck size={22} strokeWidth={2.5} />} value={inFlightOrders.length} label="In transit" accentClassName="text-route" />
                    <StatChip icon={<AlertTriangle size={22} strokeWidth={2.5} />} value={urgentIncidents.length} label="Urgent incidents" accentClassName={urgentIncidents.length > 0 ? 'text-rust' : 'text-steel'} />

                    {weather && (
                        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-panel/70 border border-line/10 rounded-lg">
                            <span className="text-2xl leading-none" aria-hidden="true">{weather.icon}</span>
                            <div>
                                <div className="text-2xl font-bold text-paper leading-none font-mono tabular-nums">{weather.temperatureC}°C</div>
                                <div className="text-micro text-steel uppercase tracking-widest mt-0.5">{weather.label}</div>
                            </div>
                        </div>
                    )}

                    <div className="px-5 py-2.5 bg-panel/70 border border-line/10 rounded-lg text-right">
                        <div className="text-2xl font-bold text-paper leading-none font-mono tabular-nums">
                            {now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Kigali', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-micro text-steel uppercase tracking-widest mt-0.5">Kigali</div>
                    </div>
                </div>
            </div>

            {urgentIncidents.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 z-[500] bg-gradient-to-t from-ink/95 via-ink/80 to-transparent px-6 py-4">
                    <div className="flex items-center gap-3 overflow-x-auto">
                        {urgentIncidents.map((incident) => {
                            const [title] = String(incident.description || '').split('\n\n');
                            return (
                                <div
                                    key={incident.id}
                                    className="flex items-center gap-2.5 shrink-0 px-4 py-2.5 bg-rust/15 border border-rust/40 rounded-lg"
                                >
                                    <AlertTriangle size={16} className="text-rust shrink-0" strokeWidth={2.5} />
                                    <div className="text-body">
                                        <span className="font-bold text-paper">{resolveDriverName(incident.driver_name || '')}</span>
                                        <span className="text-steel"> — {title}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
