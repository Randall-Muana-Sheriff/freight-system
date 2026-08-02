import type { LatLng } from '../../types';

export interface PickHandlers {
  drawModeActive: boolean;
  setDrawnPoints: (updater: (prev: LatLng[]) => LatLng[]) => void;
  dispatchTargetMode: boolean;
  setDispatchLocation: (value: LatLng) => void;
  onDispatchClick: (lat: number, lng: number) => void;
  stopTargetMode: boolean;
  setNewStopCoords: (value: LatLng) => void;
  setStopTargetMode: (value: boolean) => void;
  orderDeliveryTargetMode: boolean;
  setNewOrderDeliveryCoords: (value: LatLng) => void;
  setOrderDeliveryTargetMode: (value: boolean) => void;
  hubTargetMode: boolean;
  setNewHubCoords: (value: LatLng) => void;
  setHubTargetMode: (value: boolean) => void;
}

// Shared by both the map's click handler and the address-search box, so
// "click a spot" and "search an address" are two equivalent ways to feed
// the same four pick-a-location flows (dispatch/stop/order/hub).
export function applyPickedLocation(lat: number, lng: number, {
  drawModeActive, setDrawnPoints,
  dispatchTargetMode, setDispatchLocation, onDispatchClick,
  stopTargetMode, setNewStopCoords, setStopTargetMode,
  orderDeliveryTargetMode, setNewOrderDeliveryCoords, setOrderDeliveryTargetMode,
  hubTargetMode, setNewHubCoords, setHubTargetMode,
}: PickHandlers): void {
  if (drawModeActive) {
    setDrawnPoints((prev) => [...prev, [lat, lng]]);
  } else if (dispatchTargetMode) {
    setDispatchLocation([lat, lng]);
    onDispatchClick(lat, lng);
  } else if (stopTargetMode) {
    setNewStopCoords([lat, lng]);
    setStopTargetMode(false);
  } else if (orderDeliveryTargetMode) {
    setNewOrderDeliveryCoords([lat, lng]);
    setOrderDeliveryTargetMode(false);
  } else if (hubTargetMode) {
    setNewHubCoords([lat, lng]);
    setHubTargetMode(false);
  }
}
