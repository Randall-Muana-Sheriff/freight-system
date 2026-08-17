import type { LatLng } from '../../types';

export interface PickHandlers {
  drawModeActive: boolean;
  setDrawnPoints: (updater: (prev: LatLng[]) => LatLng[]) => void;
  dispatchTargetMode: boolean;
  setDispatchLocation: (value: LatLng) => void;
  onDispatchClick: (lat: number, lng: number) => void;
  orderDeliveryTargetMode: boolean;
  setNewOrderDeliveryCoords: (value: LatLng) => void;
  setOrderDeliveryTargetMode: (value: boolean) => void;
  hubTargetMode: boolean;
  setNewHubCoords: (value: LatLng) => void;
  setHubTargetMode: (value: boolean) => void;
  // Pinning a customer-placed order. Unlike the flows above this one takes
  // two clicks — pickup then delivery — so it carries which leg is being
  // picked rather than a plain boolean, and advances itself.
  placementStep: 'pickup' | 'delivery' | null;
  onPlacementPick: (lat: number, lng: number) => void;
}

// Shared by both the map's click handler and the address-search box, so
// "click a spot" and "search an address" are two equivalent ways to feed
// every pick-a-location flow (dispatch/stop/order/hub/placement).
export function applyPickedLocation(lat: number, lng: number, {
  drawModeActive, setDrawnPoints,
  dispatchTargetMode, setDispatchLocation, onDispatchClick,
  orderDeliveryTargetMode, setNewOrderDeliveryCoords, setOrderDeliveryTargetMode,
  hubTargetMode, setNewHubCoords, setHubTargetMode,
  placementStep, onPlacementPick,
}: PickHandlers): void {
  if (drawModeActive) {
    setDrawnPoints((prev) => [...prev, [lat, lng]]);
  } else if (dispatchTargetMode) {
    setDispatchLocation([lat, lng]);
    onDispatchClick(lat, lng);
    } else if (orderDeliveryTargetMode) {
    setNewOrderDeliveryCoords([lat, lng]);
    setOrderDeliveryTargetMode(false);
  } else if (hubTargetMode) {
    setNewHubCoords([lat, lng]);
    setHubTargetMode(false);
  } else if (placementStep) {
    onPlacementPick(lat, lng);
  }
}
