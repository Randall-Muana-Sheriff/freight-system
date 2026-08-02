import { useMap } from 'react-leaflet';
import LeafletButtonControl from './LeafletButtonControl';

const LOCATE_GLYPH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';

export default function LocateControl() {
  const map = useMap();
  return (
    <LeafletButtonControl
      position="topleft"
      title="Locate me"
      glyph={LOCATE_GLYPH}
      onClick={() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 15),
          (err) => console.error('Geolocation failed:', err.message)
        );
      }}
    />
  );
}
