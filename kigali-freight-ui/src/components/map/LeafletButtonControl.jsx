import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// A minimal wrapper around Leaflet's native L.control so custom buttons
// stack correctly alongside the built-in zoom control instead of floating
// as an unrelated absolutely-positioned div.
export default function LeafletButtonControl({ position, title, glyph, onClick }) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const control = L.control({ position });
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const link = L.DomUtil.create('a', '', container);
      link.href = '#';
      link.title = title;
      link.style.display = 'flex';
      link.style.alignItems = 'center';
      link.style.justifyContent = 'center';
      link.innerHTML = glyph;
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(link, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        onClickRef.current?.();
      });
      return container;
    };
    control.addTo(map);
    return () => control.remove();
  }, [map, position, title, glyph]);

  return null;
}
