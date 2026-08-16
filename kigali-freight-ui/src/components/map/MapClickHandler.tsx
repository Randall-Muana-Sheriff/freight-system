import { useMapEvents } from 'react-leaflet';
import { applyPickedLocation, type PickHandlers } from './applyPickedLocation';

interface MapClickHandlerProps extends PickHandlers {
  onBackgroundClick?: () => void;
}

export default function MapClickHandler({ onBackgroundClick, ...pickHandlers }: MapClickHandlerProps) {
  const { drawModeActive, dispatchTargetMode, stopTargetMode, orderDeliveryTargetMode, hubTargetMode, placementStep } = pickHandlers;
  const anyPickModeActive = drawModeActive || dispatchTargetMode || stopTargetMode || orderDeliveryTargetMode || hubTargetMode || Boolean(placementStep);
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
