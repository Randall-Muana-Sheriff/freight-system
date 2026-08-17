import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface BadgeIconOptions {
  background: string;
  border: string;
  glyph: string;
  size?: number;
  pulse?: boolean;
}

// Self-contained SVG markers instead of externally-hosted flaticon PNGs —
// no network dependency, and colored to match the app's own palette rather
// than generic default pins.
function badgeIcon({ background, border, glyph, size = 30, pulse = false }: BadgeIconOptions): L.DivIcon {
  return L.divIcon({
    className: 'freight-map-marker',
    html: `
      <div style="
        width: ${size}px; height: ${size}px;
        background: ${background};
        border: 2px solid ${border};
        border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        ${pulse ? 'animation: freight-marker-pulse 1.4s ease-in-out infinite;' : ''}
      ">
        ${glyph}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const TRUCK_GLYPH = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0F0C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 3h13v13H1z" />
    <path d="M14 8h4l3 3v5h-7V8z" />
    <circle cx="6" cy="18" r="1.6" fill="#0B0F0C" />
    <circle cx="17" cy="18" r="1.6" fill="#0B0F0C" />
  </svg>
`;

const FLAG_GLYPH = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0F0C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 22V4" />
    <path d="M4 4h14l-3 4 3 4H4" />
  </svg>
`;

const WAREHOUSE_GLYPH = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0F0C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 21V10l9-6 9 6v11" />
    <path d="M3 21h18" />
    <path d="M9 21v-6h6v6" />
  </svg>
`;

// A compact single-volume body (sloped hood merging straight into the roof,
// no separate cab/box break) reads as a van at marker size, distinct from
// the box truck's two-piece silhouette below.
const VAN_GLYPH = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B0F0C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 15V7a1 1 0 0 1 1-1h10l6 4.5V15" />
    <path d="M2 15h17" />
    <circle cx="6" cy="18" r="1.6" fill="#0B0F0C" />
    <circle cx="16" cy="18" r="1.6" fill="#0B0F0C" />
  </svg>
`;

// A cab separate from its cargo box — the app's original/default truck
// glyph, kept as the "Medium Truck" shape and the generic fallback for any
// custom vehicle type a dispatcher adds that isn't one of the three known
// names.
const MEDIUM_TRUCK_GLYPH = TRUCK_GLYPH;

// Longer trailer, a distinct cab, and three wheels (tandem rear axle)
// instead of two — a wider, heavier-looking silhouette that reads as
// "biggest vehicle on the map" even before you check its color.
const HEAVY_HAULER_GLYPH = `
  <svg width="20" height="14" viewBox="0 0 30 20" fill="none" stroke="#0B0F0C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 5h11v9H1z" />
    <path d="M12 8h4l5 3.5V14h-9V8z" />
    <path d="M1 14h24" />
    <circle cx="5" cy="17" r="1.5" fill="#0B0F0C" />
    <circle cx="21" cy="17" r="1.5" fill="#0B0F0C" />
    <circle cx="25" cy="17" r="1.5" fill="#0B0F0C" />
  </svg>
`;

export const truckIcon = badgeIcon({ background: '#FF8A3D', border: '#0B0F0C', glyph: TRUCK_GLYPH });
export const violatorIcon = badgeIcon({ background: '#C1442E', border: '#0B0F0C', glyph: TRUCK_GLYPH.replace(/#0B0F0C/g, '#F4EFE4'), pulse: true });
// A driver whose last ping is aging but not yet old enough to drop off the
// map entirely — visually distinct (dim, desaturated) from a truck that's
// actually live right now.
export const staleIcon = badgeIcon({ background: 'rgba(138,145,136,0.55)', border: '#0B0F0C', glyph: TRUCK_GLYPH.replace(/#0B0F0C/g, 'rgba(11,15,12,0.7)') });
export const flagIcon = badgeIcon({ background: '#5B84A6', border: '#0B0F0C', glyph: FLAG_GLYPH, size: 26 });
export const hubIcon = badgeIcon({ background: '#5B8C6E', border: '#0B0F0C', glyph: WAREHOUSE_GLYPH, size: 26 });

// Shape (glyph + size) encodes vehicle type; color/pulse encode live status
// (normal/violator/stale) — kept as two independent dimensions rather than
// trying to fold both into color, since color is already spoken for by
// status and dispatchers scanning for a safety violation need that to stay
// unambiguous regardless of what's driving it.
const VEHICLE_TYPE_GLYPHS: Record<string, { glyph: string; size: number }> = {
  'Light Van': { glyph: VAN_GLYPH, size: 26 },
  'Medium Truck': { glyph: MEDIUM_TRUCK_GLYPH, size: 30 },
  'Heavy Hauler': { glyph: HEAVY_HAULER_GLYPH, size: 36 },
};
const DEFAULT_VEHICLE_GLYPH = { glyph: MEDIUM_TRUCK_GLYPH, size: 30 };

// vehicle_types.name is dispatcher-editable free text (see AdminControlPanel's
// "Manage vehicle types"), not a fixed enum, so any name outside the three
// above falls back to the default glyph rather than throwing or rendering
// nothing.
export type VehicleStatus = 'normal' | 'violator' | 'stale';

const STATUS_STYLES: Record<VehicleStatus, { background: string; border: string; glyphColor: string; pulse: boolean }> = {
  normal: { background: '#FF8A3D', border: '#0B0F0C', glyphColor: '#0B0F0C', pulse: false },
  violator: { background: '#C1442E', border: '#0B0F0C', glyphColor: '#F4EFE4', pulse: true },
  stale: { background: 'rgba(138,145,136,0.55)', border: '#0B0F0C', glyphColor: 'rgba(11,15,12,0.7)', pulse: false },
};

// Leaflet divIcon creation isn't free — building one per marker per render
// would run on every socket tick. Icons are cheap to reuse since they're
// keyed only by (type, status), a small fixed space, so a plain memo cache
// is enough.
const vehicleIconCache = new Map<string, L.DivIcon>();

export function getVehicleIcon(vehicleType?: string | null, status: VehicleStatus = 'normal'): L.DivIcon {
  const cacheKey = `${vehicleType || 'default'}|${status}`;
  const cached = vehicleIconCache.get(cacheKey);
  if (cached) return cached;

  const { glyph, size } = (vehicleType && VEHICLE_TYPE_GLYPHS[vehicleType]) || DEFAULT_VEHICLE_GLYPH;
  const { background, border, glyphColor, pulse } = STATUS_STYLES[status] || STATUS_STYLES.normal;
  const icon = badgeIcon({ background, border, glyph: glyph.replace(/#0B0F0C/g, glyphColor), size, pulse });
  vehicleIconCache.set(cacheKey, icon);
  return icon;
}

// For a small corner legend so dispatchers can learn the shapes at a
// glance rather than having to click every marker once to find out.
export const VEHICLE_TYPE_LEGEND = Object.entries(VEHICLE_TYPE_GLYPHS).map(([name, { glyph }]) => ({
  name,
  glyph: glyph.replace(/#0B0F0C/g, '#F4EFE4'),
}));

// A run's stops are numbered, because the sequence is the whole point —
// an unnumbered pin tells a dispatcher a stop is there, not when the
// driver reaches it. Round rather than the square badge used for vehicles
// and hubs, so a plan reads as distinct from a thing that physically
// exists.
//
// Not memoised like getVehicleIcon: a run has tens of stops with a
// different number on each, so there is nothing to reuse between them, and
// only one run is ever drawn at a time.
export function stopIcon(sequence: number, done: boolean, kind: 'PICKUP' | 'DROP'): L.DivIcon {
  // Done stops recede rather than disappear — a dispatcher tracing where a
  // driver has got to needs the completed half of the run visible.
  const background = done ? 'rgba(138,145,136,0.55)' : kind === 'PICKUP' ? '#5B84A6' : '#5B8C6E';
  return L.divIcon({
    className: 'freight-map-marker',
    html: `
      <div style="
        width: 24px; height: 24px;
        background: ${background};
        border: 2px solid #0B0F0C;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        font: 700 11px/1 ui-monospace, monospace;
        color: #F4EFE4;
      ">${sequence}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
