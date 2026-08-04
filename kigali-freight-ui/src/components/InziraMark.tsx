// src/components/InziraMark.tsx — the compact brand mark: a short route
// bleeding toward a corner, ending in a destination pin. Cropped from the
// same device as the full "inzira" wordmark (see the brand proposal) —
// not a separate icon invented for small spaces. Replaces the old "KF"
// monogram wherever a small square badge is needed (login screen,
// dashboard header).
//
// Uses currentColor throughout rather than a hardcoded brand color: the
// dashboard's own accent is orange (the `route` token), not the driver
// app's jade — this mark inherits whatever `text-*` color its container
// already sets, so it stays consistent with each surface's existing
// palette instead of forcing a mismatched second accent color into UI
// chrome that wasn't otherwise being redesigned.
// Stroke weight and opacity are deliberately bolder here than the hero
// wordmark's underline device — at a 20-24px badge size (login screen,
// header), a thin delicate line reads as barely-there next to the bold
// "KF" text it replaced. This needs to hold its own at a glance, not
// reward close inspection.
export function InziraMark({ size = 26 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3,29 C 15,39 23,15 37,22" stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" opacity="0.85" />
            <circle cx="37" cy="22" r="7.5" fill="currentColor" />
        </svg>
    );
}
