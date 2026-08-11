// Shared header/footer for the customer site, plus the brand mark. Kept
// in one file because all three are small and always change together.
import { InziraMark } from './InziraMark';

export const NAV_LINKS = [
    { id: 'services', label: 'Services' },
    { id: 'how', label: 'How' },
    { id: 'contact', label: 'Contact' },
];

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function PublicHeader({ onNavigate }: { onNavigate: (path: string) => void }) {
    return (
        <header className="sticky top-0 z-50 border-b border-brand-line bg-brand-ink/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
                <button
                    onClick={() => onNavigate('/')}
                    className="flex items-center gap-2.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-jade"
                    aria-label="Inzira home"
                >
                    <InziraMark className="h-8 w-8" />
                    <span className="font-display text-lg font-black tracking-tight text-brand-text">inzira</span>
                </button>

                {/* Anchor links only make sense on the landing page; on the
                    order and track pages the header is just a way home. */}
                <nav className="hidden items-center gap-7 md:flex">
                    {NAV_LINKS.map((link) => (
                        <button
                            key={link.id}
                            onClick={() => scrollToSection(link.id)}
                            className="font-body text-sm text-brand-muted transition-colors hover:text-brand-text"
                        >
                            {link.label}
                        </button>
                    ))}
                </nav>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onNavigate('/track')}
                        className="rounded-full border border-brand-line px-4 py-2 font-body text-sm font-medium text-brand-text transition-colors hover:border-brand-jade hover:text-brand-jade"
                    >
                        Track
                    </button>
                    <button
                        onClick={() => onNavigate('/order')}
                        className="rounded-full bg-brand-jade px-4 py-2 font-body text-sm font-bold text-brand-ink transition-colors hover:bg-brand-jade-deep"
                    >
                        Place order
                    </button>
                </div>
            </div>
        </header>
    );
}

export function PublicFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
    return (
        <footer className="border-t border-brand-line bg-brand-surface">
            <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <div className="mb-3 flex items-center gap-2.5">
                        <InziraMark className="h-7 w-7" />
                        <span className="font-display text-base font-black tracking-tight text-brand-text">inzira</span>
                    </div>
                    <p className="font-body text-sm leading-relaxed text-brand-muted">
                        Rwanda&apos;s technology-backed freight network. Professional drivers,
                        real-time tracking, delivery you can follow.
                    </p>
                </div>

                <div>
                    <h3 className="mb-3 font-body text-xs font-bold uppercase tracking-widest text-brand-muted">Services</h3>
                    <ul className="space-y-2 font-body text-sm text-brand-text/80">
                        <li>Same-day delivery</li>
                        <li>Bulk freight</li>
                        <li>Secure transport</li>
                        <li>Scheduled routes</li>
                    </ul>
                </div>

                <div>
                    <h3 className="mb-3 font-body text-xs font-bold uppercase tracking-widest text-brand-muted">Platform</h3>
                    <ul className="space-y-2 font-body text-sm">
                        <li><button onClick={() => onNavigate('/order')} className="text-brand-text/80 hover:text-brand-jade">Place an order</button></li>
                        <li><button onClick={() => onNavigate('/track')} className="text-brand-text/80 hover:text-brand-jade">Track shipment</button></li>
                        <li><button onClick={() => onNavigate('/dispatch')} className="text-brand-text/80 hover:text-brand-jade">Staff sign in</button></li>
                    </ul>
                </div>

                <div>
                    <h3 className="mb-3 font-body text-xs font-bold uppercase tracking-widest text-brand-muted">Get in touch</h3>
                    <ul className="space-y-2 font-body text-sm text-brand-text/80">
                        <li>Gikondo Industrial Zone, Kigali</li>
                        <li><button onClick={() => scrollToSection('contact')} className="hover:text-brand-jade">Send us a message</button></li>
                    </ul>
                </div>
            </div>

            <div className="border-t border-brand-line">
                <p className="mx-auto max-w-6xl px-5 py-5 font-body text-xs text-brand-muted">
                    © {new Date().getFullYear()} Inzira. Kigali, Rwanda.
                </p>
            </div>
        </footer>
    );
}
