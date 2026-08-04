// src/components/InziraWordmark.tsx — the full hero brand treatment: the
// word "inzira" with a route line running its full width underneath,
// ending in a destination pin just past the last letter. Reserved for
// spaces that can actually give the brand a moment — the login screen,
// not the persistent header (see InziraMark for the compact badge used
// there instead).
//
// The route device is an absolutely-positioned SVG stretched to 100%
// width with preserveAspectRatio="none", so it always spans exactly the
// rendered width of the text above it regardless of font/OS differences
// — no fragile pixel-matching against a specific font's metrics.
export function InziraWordmark({ className = '' }: { className?: string }) {
    return (
        <div className={`relative inline-block pb-3 ${className}`}>
            <div className="text-4xl font-black tracking-tight text-paper leading-none">inzira</div>
            <div className="absolute left-0 right-[-8%] bottom-0 h-[18%] min-h-[6px] text-route">
                <svg viewBox="0 0 100 22" preserveAspectRatio="none" fill="none" className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1,4 C 26,20 52,1 76,9 C 84,12 88,10.5 91,11.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <circle cx="95" cy="12" r="5.5" fill="currentColor" />
                </svg>
            </div>
        </div>
    );
}
