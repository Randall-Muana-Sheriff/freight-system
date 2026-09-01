// Basemap URLs shared by the dispatcher board and the kiosk wall display.
//
// Streets: CARTO dark_all — the original dashboard basemap. Raster tiles
// now require `?key=` or every square is watermarked "API KEY REQUIRED".
// The key is read at runtime (see getCartoApiKey); it is never hardcoded.
// Kiosk uses dark_nolabels so neighborhood names don't compete with fleet
// markers at wall-display distance.
//
// Satellite / no-key fallback: Esri. Esri's tile scheme is {z}/{y}/{x},
// not OSM/CARTO's {z}/{x}/{y}.

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const CARTO_MAX_ZOOM = 20;

export type CartoRasterStyle = 'dark_all' | 'dark_nolabels';

export function cartoTileUrl(style: CartoRasterStyle, key: string): string {
  return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`;
}
