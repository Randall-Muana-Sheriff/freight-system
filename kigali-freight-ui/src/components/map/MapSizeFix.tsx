import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Leaflet measures its container at the exact instant it initializes. In a
// nested flex layout (screen -> flex row -> this flex-1 map div), the
// container can still be mid-layout at that moment, so Leaflet locks in a
// stale/wrong size and silently renders at the wrong zoom/bounds forever
// after — it never self-corrects. Forcing invalidateSize() once the
// browser has actually finished a layout+paint pass fixes it.
//
// The window 'resize' listener alone does NOT cover OperationsRail/
// SecondaryPanel's drag-to-resize handles (useResizableWidth): dragging
// one of those changes this map's flex-1 container width via a plain CSS
// reflow, which never fires a window resize event — the window itself
// hasn't changed size. Leaflet then keeps rendering tiles/markers against
// its old, stale internal dimensions while the container has actually
// changed, which is what shows up as the map looking shifted/misaligned
// mid-drag. A ResizeObserver on the map's own container element fires for
// that CSS-driven reflow too, not just an actual window resize.
export default function MapSizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    window.addEventListener('resize', fix);
    const observer = new ResizeObserver(fix);
    observer.observe(map.getContainer());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fix);
      observer.disconnect();
    };
  }, [map]);
  return null;
}
