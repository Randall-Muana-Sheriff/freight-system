import { useMapEvents } from 'react-leaflet';
import { applyPickedLocation } from './applyPickedLocation';

export default function MapClickHandler({ onBackgroundClick, ...pickHandlers }) {
  const { drawModeActive, dispatchTargetMode, stopTargetMode, orderDeliveryTargetMode, hubTargetMode } = pickHandlers;
  const anyPickModeActive = drawModeActive || dispatchTargetMode || stopTargetMode || orderDeliveryTargetMode || hubTargetMode;
  useMapEvents({
    click(e) {
      if (anyPickModeActive) {
        applyPickedLocation(e.latlng.lat, e.latlng.lng, pickHandlers);
      } else {
        // Clicking empty map space while nothing is being placed just
        // deselects whichever vehicle's trail is currently shown (marker
        // clicks never reach here — Leaflet stops that propagation).
        onBackgroundClick?.();
      }
    },
  });
  return null;
}
