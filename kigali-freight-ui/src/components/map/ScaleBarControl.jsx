import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export default function ScaleBarControl() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ position: 'bottomleft', metric: true, imperial: false });
    control.addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}
