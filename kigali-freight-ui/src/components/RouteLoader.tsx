// What the product shows while it is fetching something.
//
// The brand mark (see public/InziraMark.tsx) is a route curving into a
// destination. So the loading state is that same geometry in motion: the
// way draws itself, the load travels along it, and it arrives. Inzira is
// Kinyarwanda for "the way", and a freight company's waiting state may as
// well mean something rather than spin.
//
// Deliberately not a rotating spinner. A spinner turns forever and says
// only "still busy"; a route being travelled says "on its way", which is
// the same thing the customer is actually waiting to hear.
//
// Animated with declarative CSS and SMIL rather than requestAnimationFrame
// on purpose. This is mostly rendered as a Suspense fallback — on screen
// precisely while the browser is downloading and parsing a JavaScript
// chunk — and a JS-driven animation competes with that work and stutters
// exactly when it is being looked at. The driver app learned this the
// expensive way when Animated.sequence stalled 600ms on a busy cold start.

// The mark's own path, at its native scale. Shared with InziraMark rather
// than redrawn, so the loader is the logo moving, not a lookalike.
const ROUTE = 'M108 788C160 812 210 820 260 818C340 814 420 760 494 699C570 636 700 575 800 522';
const DESTINATION = { cx: 902, cy: 592, r: 140 };

type Tone = 'board' | 'public' | 'public-ink';

// Two surfaces, two palettes. The dispatcher board is a dark tool and uses
// route orange; the customer site is paper and uses laterite. Passing the
// tone rather than reading the surface keeps this component ignorant of
// which app it is in.
const TONES: Record<Tone, { route: string; marker: string; ground: string; label: string }> = {
    board: {
        route: 'text-steel/35',
        marker: 'fill-route',
        ground: 'bg-ink',
        label: 'text-steel',
    },
    public: {
        route: 'text-pub-onpaper-soft/30',
        marker: 'fill-pub-laterite',
        ground: 'bg-pub-paper',
        label: 'text-pub-onpaper-soft',
    },
    // The customer site's dark half — tracking and the hero sit on ink,
    // where the paper tone's faint road would be invisible.
    'public-ink': {
        route: 'text-pub-onink-soft/30',
        marker: 'fill-pub-laterite',
        ground: 'bg-pub-ink',
        label: 'text-pub-onink-soft',
    },
};

interface RouteLoaderProps {
    tone?: Tone;
    /** Fills the viewport. Off for inline use inside a panel. */
    fullScreen?: boolean;
    /** Announced to screen readers, and shown under the mark when given. */
    label?: string;
    className?: string;
}

export function RouteLoader({
    tone = 'board',
    fullScreen = true,
    label,
    className = '',
}: RouteLoaderProps) {
    const t = TONES[tone];

    return (
        <div
            // role=status rather than an aria-live region on the text: this
            // is a waiting state, not an alert, and it should not interrupt
            // whatever a screen reader is already saying.
            role="status"
            aria-live="polite"
            className={[
                fullScreen ? `h-screen w-screen ${t.ground}` : 'w-full py-10',
                'flex flex-col items-center justify-center gap-4',
                className,
            ].join(' ')}
        >
            {/* Bounds fit the stroke's full width and the destination dot,
                which sits beyond the path's end — cropping either is the
                easy mistake here. */}
            <svg
                viewBox="60 430 1010 450"
                className="w-32 max-w-[45vw]"
                fill="none"
                aria-hidden="true"
            >
                {/* The road, faint and complete: where the load is going,
                    visible before it gets there. */}
                <path
                    d={ROUTE}
                    stroke="currentColor"
                    strokeWidth="78"
                    strokeLinecap="round"
                    className={t.route}
                />

                {/* The same road drawn again, this time stroking itself in.
                    pathLength normalises the geometry to 100 so the dash
                    animation needs no measured length — change the curve and
                    the timing still holds. */}
                <path
                    id="inzira-route"
                    d={ROUTE}
                    pathLength={100}
                    stroke="currentColor"
                    strokeWidth="78"
                    strokeLinecap="round"
                    className={`${t.marker.replace('fill-', 'text-')} inzira-route-draw`}
                />

                {/* Arrival. Scales up as the load lands rather than being
                    there from the start, so the motion resolves instead of
                    merely stopping. */}
                <circle
                    cx={DESTINATION.cx}
                    cy={DESTINATION.cy}
                    r={DESTINATION.r}
                    className={`${t.marker} inzira-route-arrive`}
                    style={{ transformOrigin: `${DESTINATION.cx}px ${DESTINATION.cy}px` }}
                />

                {/* The load itself, travelling the curve. animateMotion
                    keeps this in SVG coordinate space and follows the real
                    path — a CSS transform could only approximate the arc. */}
                <g className="inzira-route-cargo">
                    <rect x={-46} y={-46} width={92} height={92} rx={18} className={t.marker} />
                    <animateMotion dur="1.9s" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.42 0 0.58 1">
                        <mpath href="#inzira-route" />
                    </animateMotion>
                </g>
            </svg>

            {label ? (
                <p className={`data-label ${t.label}`}>{label}</p>
            ) : (
                <span className="sr-only">Loading</span>
            )}
        </div>
    );
}

export default RouteLoader;
