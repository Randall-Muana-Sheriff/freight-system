// The route mark. Same curve-into-destination geometry as the browser
// favicon and the driver app's launcher icon, but drawn in the public
// site's own palette and without the rounded tile behind it — on a page
// the mark can sit directly on the ground, where an app icon cannot.
export function InziraMark({ className = 'h-6 w-6' }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 26" fill="none" className={className} aria-hidden="true">
            <g transform="translate(-2 -9) scale(0.0335)">
                <path
                    d="M108 788C160 812 210 820 260 818C340 814 420 760 494 699C570 636 700 575 800 522"
                    stroke="currentColor"
                    strokeWidth="78"
                    strokeLinecap="round"
                    fill="none"
                    className="text-pub-onink-soft"
                />
                <circle cx="902" cy="592" r="140" className="fill-pub-laterite" />
            </g>
        </svg>
    );
}
