// Kigali Freight driver app visual system, per the dispatcher-provided
// design handoff: Electric Jade on a deep navy-black ground, with layered
// surfaces for elevation instead of one flat dark background. Gold is
// reserved for earnings/highlight metrics only, red for safety/emergency
// only — neither should leak into general UI the way `primary` does.
export const theme = {
  colors: {
    bg: '#050C18',
    surface1: '#0A1628',
    surface2: '#0F1E35',
    surface3: '#162440',
    panel: 'rgba(15, 30, 53, 0.94)',
    panelSoft: 'rgba(242, 246, 251, 0.05)',
    primary: '#00D97C',
    primaryDeep: '#00A85F',
    accent: '#3B9EFF',
    gold: '#F0C040',
    danger: '#FF4444',
    text: '#F2F6FB',
    muted: '#7C8AA6',
    border: 'rgba(242, 246, 251, 0.10)',
    success: '#00D97C',
    warning: '#F5A623',
    paper: '#EDF3FA',
    ink: '#050C18',
  },
  fonts: {
    heading: 'Outfit_800ExtraBold',
    headingBlack: 'Outfit_900Black',
    body: 'DMSans_400Regular',
    bodyMedium: 'DMSans_500Medium',
    bodySemiBold: 'DMSans_600SemiBold',
    mono: 'DMMono_500Medium',
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
