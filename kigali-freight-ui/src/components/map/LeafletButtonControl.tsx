import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface LeafletButtonControlProps {
  position: L.ControlPosition;
  title: string;
  glyph: string;
  onClick?: () => void;
}

// A minimal wrapper around Leaflet's native L.control so custom buttons
// stack correctly alongside the built-in zoom control instead of floating
// as an unrelated absolutely-positioned div.
export default function LeafletButtonControl({ position, title, glyph, onClick }: LeafletButtonControlProps) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const control = new L.Control({ position });
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
    return () => {
      control.remove();
    };
  }, [map, position, title, glyph]);

  return null;
}
