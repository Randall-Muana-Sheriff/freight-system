import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Leaflet measures its container at the exact instant it initializes. In a
// nested flex layout (screen -> flex row -> this flex-1 map div), the
// container can still be mid-layout at that moment, so Leaflet locks in a
// stale/wrong size and silently renders at the wrong zoom/bounds forever
// after — it never self-corrects. Forcing invalidateSize() once the
// browser has actually finished a layout+paint pass fixes it; the resize
// listener covers the panel/window being resized afterward too.
export default function MapSizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    window.addEventListener('resize', fix);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fix);
    };
  }, [map]);
  return null;
}
