// The Inzira route mark, same geometry as the browser favicon and the
// driver app's launcher icon (kigali-freight-ui/public/favicon.svg) —
// traced from that PNG, authored in its 1024 space and scaled down, so all
// three stay identical rather than being three drawings of the same idea.
export function InziraMark({ className = 'h-8 w-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
            <defs>
                <linearGradient id="inzira-mark-ground" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#0F1E35" />
                    <stop offset="1" stopColor="#050C18" />
                </linearGradient>
            </defs>
            <rect width="32" height="32" rx="7" fill="url(#inzira-mark-ground)" />
            <g transform="scale(0.03125) translate(-319 -308) scale(1.25)">
                <path
                    d="M108 788C160 812 210 820 260 818C340 814 420 760 494 699C570 636 700 575 800 522"
                    stroke="#DADFE5"
                    strokeWidth="69"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
                <circle cx="902" cy="592" r="134" fill="#00D97C" />
            </g>
        </svg>
    );
}
