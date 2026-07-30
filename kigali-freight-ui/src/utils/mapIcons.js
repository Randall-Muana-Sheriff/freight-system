import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Self-contained SVG markers instead of externally-hosted flaticon PNGs —
// no network dependency, and colored to match the app's own palette rather
// than generic default pins.
function badgeIcon({ background, border, glyph, size = 30, pulse = false }) {
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

export const truckIcon = badgeIcon({ background: '#FF8A3D', border: '#0B0F0C', glyph: TRUCK_GLYPH });
export const violatorIcon = badgeIcon({ background: '#C1442E', border: '#0B0F0C', glyph: TRUCK_GLYPH.replace(/#0B0F0C/g, '#F4EFE4'), pulse: true });
// A driver whose last ping is aging but not yet old enough to drop off the
// map entirely — visually distinct (dim, desaturated) from a truck that's
// actually live right now.
export const staleIcon = badgeIcon({ background: 'rgba(138,145,136,0.55)', border: '#0B0F0C', glyph: TRUCK_GLYPH.replace(/#0B0F0C/g, 'rgba(11,15,12,0.7)') });
export const flagIcon = badgeIcon({ background: '#5B84A6', border: '#0B0F0C', glyph: FLAG_GLYPH, size: 26 });
export const hubIcon = badgeIcon({ background: '#5B8C6E', border: '#0B0F0C', glyph: WAREHOUSE_GLYPH, size: 26 });
