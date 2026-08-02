import { useMap } from 'react-leaflet';
import LeafletButtonControl from './LeafletButtonControl';

const FULLSCREEN_GLYPH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';

export default function FullscreenControl() {
  const map = useMap();
  return (
    <LeafletButtonControl
      position="topleft"
      title="Toggle fullscreen"
      glyph={FULLSCREEN_GLYPH}
      onClick={() => {
        if (document.fullscreenElement) document.exitFullscreen();
        else map.getContainer().requestFullscreen?.();
      }}
    />
  );
}
