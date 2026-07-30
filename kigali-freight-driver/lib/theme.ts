// Palette rooted in the physical artifacts of freight work — a waybill's
// cream stock, its carbon-copy blue duplicate, route-marker orange, hazard
// amber — rather than generic dark-dashboard neon. `paper`/`ink` are for the
// manifest-ticket surface (auth screens); everything else is the app's
// standard dark ground.
export const theme = {
  colors: {
    bg: '#0B0F0C',
    panel: 'rgba(20, 26, 22, 0.90)',
    panelSoft: 'rgba(244,239,228,0.05)',
    primary: '#FF8A3D',
    primaryDeep: '#D96A22',
    accent: '#5B84A6',
    danger: '#C1442E',
    text: '#F4EFE4',
    muted: '#8A9188',
    border: 'rgba(244,239,228,0.10)',
    success: '#5B8C6E',
    warning: '#E0A238',
    paper: '#F4EFE4',
    ink: '#0B0F0C',
  },
  // Sharper than a typical dark-app "bubbly" scale on purpose — crisp
  // corners read as ticket/document, not glass-card.
  radius: {
    xl: 10,
    lg: 8,
    md: 6,
    sm: 4,
  },
};

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.32,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 10,
};
