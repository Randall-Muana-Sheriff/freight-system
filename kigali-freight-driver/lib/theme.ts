// Inzira driver app visual system, per the dispatcher-provided
// design handoff: Electric Jade on a deep green-black ground, with layered
// surfaces for elevation instead of one flat dark background. Gold is
// reserved for earnings/highlight metrics only, red for safety/emergency
// only — neither should leak into general UI the way `primary` does.
export const theme = {
  colors: {
    // Depth is carried by surface tint, not shadow. On a #060d0b ground a
    // drop shadow has nothing darker to fall on: raise it far enough to
    // see and it stops being a shadow and becomes a grey haze. A hairline
    // border plus a lighter fill also survives direct sunlight through a
    // windscreen, which a soft gradient does not.
    //
    // Which step to use is decided by what the surface IS, not by which
    // screen it is on — the three had drifted to the point where surface2
    // did every job and surface1 did none, so nothing read as nearer than
    // anything else:
    //
    //   surface1  a well or groove — something content sits down inside
    //             (a progress track, a photo frame)
    //   surface2  the default card, and raised controls standing on the
    //             ground (form fields, sheets, modals, tiles)
    //   surface3  the one card per screen carrying its primary action,
    //             plus the toast, which genuinely floats above everything
    //
    // Anything nested inside another surface uses panelSoft instead: it is
    // translucent, so it lightens whatever it happens to sit on rather
    // than needing a step of its own per parent.
    // Green-black rather than navy, so the app sits in the same colour
    // world as inzira.systems and the dispatcher board instead of a blue
    // one of its own. The ground stays dark — that is correct for a cab at
    // night and for glare through a windscreen — only the hue moved.
    //
    // Each step was solved for equal RELATIVE LUMINANCE against the navy it
    // replaces, not equal HSL lightness. That distinction is the whole
    // exercise: green carries a 0.7152 coefficient against blue's 0.0722,
    // so a green at matching HSL lightness is far brighter in luminance
    // terms. Matching lightness first compressed every contrast ratio and
    // pushed danger-on-surface3 to 3.56, under AA. Solved on luminance, the
    // surfaces land within 0.0002 of the originals and the elevation ladder
    // holds at 1.086/1.077/1.089 against the old 1.080/1.086/1.082.
    bg: '#060d0b',
    surface1: '#0b1913',
    surface2: '#0f211a',
    surface3: '#122920',
    panel: 'rgba(15, 33, 26, 0.94)',
    panelSoft: 'rgba(241, 239, 232, 0.05)',
    primary: '#00D97C',
    primaryDeep: '#00A85F',
    accent: '#3B9EFF',
    gold: '#F0C040',
    danger: '#FF4444',
    // The website's own onink/onink-soft. muted gains from the swap rather
    // than losing: #8ba295 is lighter than the blue-grey it replaces, so it
    // goes from 4.44:1 on surface3 — borderline — to 5.65:1.
    text: '#f1efe8',
    muted: '#8ba295',
    border: 'rgba(241, 239, 232, 0.10)',
    success: '#00D97C',
    warning: '#F5A623',
    paper: '#e9e5db',
    ink: '#060d0b',
  },
  fonts: {
    // The same three families the website and the dispatcher board use —
    // Archivo for display, Inter for body, IBM Plex Mono for figures — so a
    // driver and a customer are reading the same typography rather than two
    // unrelated systems. Weight-for-weight with what they replace
    // (Outfit/DM Sans/DM Mono), so nothing in the size scale moves.
    //
    // Archivo is a variable font on the web, where the hero leans on its
    // width axis. React Native gets static instances only, so this is
    // Archivo at its normal width — which is all the app needs, since
    // nothing here is set at signage size.
    //
    // One Archivo weight, not two. 800 and 900 were both loaded under the
    // old family and are near-indistinguishable at the sizes this app
    // actually renders, so the second file bought an extra download and no
    // visible hierarchy — hierarchy comes from the size scale and colour.
    headingBlack: 'Archivo_900Black',
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemiBold: 'Inter_600SemiBold',
    mono: 'IBMPlexMono_500Medium',
  },
  // A closed set of seven steps, replacing the 144 inline font sizes that
  // had accumulated across 17 distinct values (including 11.5, 17, 19 and
  // 21 — values that only existed because there was nothing to snap to).
  //
  // The floor is deliberately higher than it was. 9px and 10px text has no
  // place in an app read one-handed, in a cab, in daylight, sometimes with
  // gloves; those are folded into `micro`, which is itself reserved for
  // status pills. Line heights are paired with each size here so the two
  // can't drift apart at the call site — roughly 1.5x for reading sizes,
  // tighter for display type where generous leading just wastes screen.
  type: {
    display: { fontSize: 26, lineHeight: 31 },
    title: { fontSize: 20, lineHeight: 26 },
    heading: { fontSize: 17, lineHeight: 23 },
    body: { fontSize: 15, lineHeight: 22 },
    bodySm: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 12, lineHeight: 16 },
    micro: { fontSize: 11, lineHeight: 15 },
  },
  // 14-22px on cards, 20px on pills, 50% on avatars (set inline as
  // borderRadius: '50%' per-component, not tokenized here).
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 20,
  },
};
