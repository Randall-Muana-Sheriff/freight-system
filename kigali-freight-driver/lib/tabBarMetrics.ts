import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The icon+label block gets this exact height, dedicated — not shared with
// padding — so it can never get clipped by the device's own inset eating
// into a fixed total height.
const ICON_LABEL_HEIGHT = 50;
const TOP_PADDING = 6;
// Extra clearance below the icon+label block, on top of the device's own
// safe-area/gesture-nav inset — gives the gesture indicator visible
// breathing room instead of sitting flush against the label text.
const BOTTOM_BUFFER = 12;
// Breathing room between a screen's last piece of content and the top edge
// of the tab bar.
const CONTENT_CLEARANCE = 20;

// Single source of truth for the tab bar's geometry. The bar is docked
// flush to the bottom of the screen (no floating margin/gap) — its
// background extends all the way to the true bottom edge, and the
// device's safe-area/gesture-nav inset (plus a bit extra) is absorbed as
// internal bottom padding so the icons/labels themselves sit clear above
// the gesture area with room to spare. The swipe-gesture hit zone above
// the bar and every screen's scroll-content bottom padding read from this
// same value, so they can never drift out of sync with each other or with
// a given device's inset.
export function useTabBarMetrics() {
  const insets = useSafeAreaInsets();
  const bottomPadding = insets.bottom + BOTTOM_BUFFER;
  const totalHeight = TOP_PADDING + ICON_LABEL_HEIGHT + bottomPadding;

  return {
    topPadding: TOP_PADDING,
    bottomPadding,
    totalHeight,
    contentBottomPadding: totalHeight + CONTENT_CLEARANCE,
  };
}
