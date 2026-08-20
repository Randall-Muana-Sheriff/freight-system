import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from './i18n';

// A two-stop tour for someone arriving for the first time: where to book,
// and where to check on something already booked. Those are the only two
// things a visitor needs to find, so the tour stops at two — a tour that
// walks someone through a whole page is an admission the page doesn't
// explain itself.
//
// Targets are marked with data-tour in the markup rather than matched by
// CSS selector, so restyling the hero cannot silently break the tour by
// renaming a class.

const STORAGE_KEY = 'inzira.tour.seen.v1';

type Step = { target: string; title: string; body: string };

const STEPS: Step[] = [
    {
        target: 'book',
        title: 'Book from here',
        body: 'Pickup, destination, what you’re sending. It takes a name and a phone number — no account to create.',
    },
    {
        target: 'track',
        title: 'Already sent something?',
        body: 'Put the code from your confirmation text in here to see where your cargo has got to.',
    },
];

const PAD = 8;

interface Rect { top: number; left: number; width: number; height: number }

export function SiteTour({ onBook }: { onBook: () => void }) {
    const { t } = useLanguage();
    const [step, setStep] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [open, setOpen] = useState(false);
    const cardRef = useRef<HTMLDivElement | null>(null);

    // Only for genuine first visits. A returning customer coming back to
    // track a delivery should not have to dismiss a tour to do it.
    useEffect(() => {
        try {
            if (localStorage.getItem(STORAGE_KEY)) return;
        } catch {
            // Private browsing with storage disabled — show the tour and
            // accept that it may reappear, rather than crashing the page.
        }
        // Wait a beat so webfonts and the hero canvas have settled; a
        // highlight measured mid-layout lands in the wrong place.
        const timer = window.setTimeout(() => setOpen(true), 900);
        return () => window.clearTimeout(timer);
    }, []);

    const finish = useCallback(() => {
        setOpen(false);
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            /* storage unavailable — nothing to persist to */
        }
    }, []);

    const measure = useCallback(() => {
        const node = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
        if (!node) {
            setRect(null);
            return;
        }
        const box = node.getBoundingClientRect();
        setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    }, [step]);

    useEffect(() => {
        if (!open) return;
        const node = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
        node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Measure after the smooth scroll has had time to land, then keep
        // the highlight pinned to the target if anything moves.
        const settle = window.setTimeout(measure, 420);
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, { passive: true });
        return () => {
            window.clearTimeout(settle);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure);
        };
    }, [open, step, measure]);

    useEffect(() => {
        if (!open) return;
        cardRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') finish();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, step, finish]);

    if (!open || !rect) return null;

    const isLast = step === STEPS.length - 1;
    const current = STEPS[step];

    // Below the target when there is room, otherwise above it.
    const below = rect.top + rect.height + 190 < window.innerHeight;
    const cardTop = below ? rect.top + rect.height + PAD + 10 : rect.top - PAD - 10;
    const cardLeft = Math.min(Math.max(12, rect.left), window.innerWidth - 336);

    return (
        <div className="fixed inset-0 z-[100]" role="presentation">
            {/* One element does both the dimming and the cut-out: a huge
                spread shadow darkens everything except this box. Avoids an
                SVG mask or four separate panels that drift out of sync. */}
            <div
                className="pointer-events-none absolute rounded-sm"
                style={{
                    top: rect.top - PAD,
                    left: rect.left - PAD,
                    width: rect.width + PAD * 2,
                    height: rect.height + PAD * 2,
                    boxShadow: '0 0 0 9999px rgba(10, 23, 18, 0.82)',
                    outline: '2px solid #ffc24b',
                    outlineOffset: '2px',
                }}
            />

            {/* Clicking the dimmed area leaves the tour, which is what
                someone jabbing at the page is trying to do. */}
            <button
                className="absolute inset-0 h-full w-full cursor-default"
                aria-label={t.misc.closeTour}
                onClick={finish}
            />

            <div
                ref={cardRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-title"
                className="absolute w-[min(21rem,calc(100vw-1.5rem))] bg-pub-paper p-5 shadow-2xl focus:outline-none"
                style={{ top: cardTop, left: cardLeft, transform: below ? undefined : 'translateY(-100%)' }}
            >
                <p className="data-label text-pub-laterite">Step {step + 1} of {STEPS.length}</p>
                <h2 id="tour-title" className="display-tight mt-2 text-lg text-pub-onpaper">{current.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-pub-onpaper-soft">{current.body}</p>

                <div className="mt-5 flex items-center justify-between gap-3">
                    <button onClick={finish} className="text-sm font-medium text-pub-onpaper-soft hover:text-pub-onpaper">
                        Skip
                    </button>
                    <div className="flex items-center gap-2">
                        {step > 0 ? (
                            <button onClick={() => setStep(step - 1)}
                                className="px-3 py-2.5 text-sm font-semibold text-pub-onpaper-soft hover:text-pub-onpaper">
                                Back
                            </button>
                        ) : null}
                        <button
                            onClick={() => {
                                if (!isLast) { setStep(step + 1); return; }
                                finish();
                            }}
                            className="bg-pub-onpaper px-5 py-2.5 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite"
                        >
                            {isLast ? 'Got it' : 'Next'}
                        </button>
                    </div>
                </div>

                {isLast ? (
                    <button
                        onClick={() => { finish(); onBook(); }}
                        className="mt-3 w-full border-t border-pub-onpaper/15 pt-3 text-left text-sm font-semibold text-pub-laterite hover:underline"
                    >
                        Or book a delivery now →
                    </button>
                ) : null}
            </div>
        </div>
    );
}

// Lets the footer offer the tour again — and makes it testable without
// clearing site data by hand.
export function restartTour() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* nothing to clear */
    }
    window.location.reload();
}
