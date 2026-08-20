import { useEffect, useState } from 'react';
import { useLanguage } from './i18n';

// The button appears once there is enough page behind you to make going
// back worth a click — roughly one screen. Showing it from the top means
// offering to return somewhere the reader has not left.
const REVEAL_AFTER_PX = 700;

export function BackToTop() {
    const { t } = useLanguage();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // passive: this listener never calls preventDefault, and saying so
        // lets the browser scroll without waiting to find that out.
        //
        // The work is one number comparison, but it runs on every scroll
        // event, so the state is only touched when the answer actually
        // changes — otherwise React re-renders on every pixel of a scroll.
        const onScroll = () => {
            setVisible((was) => {
                const now = window.scrollY > REVEAL_AFTER_PX;
                return now === was ? was : now;
            });
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll(); // a reload part-way down the page starts scrolled
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const toTop = () => {
        // Smooth by default, instant for anyone who has asked for less
        // motion — a full-page glide is exactly the kind of movement that
        // setting exists to stop.
        //
        // Guarded because matchMedia is not guaranteed to exist. Without
        // this the handler throws rather than scrolling, so the button
        // stops working entirely wherever it is missing — a worse outcome
        // than ignoring a preference we could not read.
        const reduced =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    };

    return (
        <button
            type="button"
            onClick={toTop}
            aria-label={t.backToTop.label}
            // Kept in the DOM so it can fade rather than blink, but taken
            // out of the tab order and hidden from screen readers while
            // invisible — a control nobody can see should not be the next
            // thing a keyboard lands on.
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            className={`focus-ring fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-pub-laterite text-pub-onink shadow-lg transition-all duration-200 hover:bg-pub-laterite-soft sm:bottom-8 sm:right-8 ${
                visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
            }`}
        >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true"
                stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
            </svg>
        </button>
    );
}
