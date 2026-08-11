// Shared header and footer. The header sits on the dark hero and the
// footer closes the page back into the dark, so the site opens and shuts
// on the road with the paperwork in between.
import { InziraMark } from './InziraMark';

const SECTIONS = [
    { id: 'services', label: 'What we move' },
    { id: 'how', label: 'How it works' },
    { id: 'safety', label: 'Safety' },
    { id: 'business', label: 'For business' },
    { id: 'faq', label: 'Questions' },
];

function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function PublicHeader({ onNavigate }: { onNavigate: (path: string) => void }) {
    return (
        <header className="bg-pub-ink">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-5">
                <button onClick={() => onNavigate('/')} aria-label="Inzira home"
                    className="flex items-baseline gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pub-laterite">
                    <InziraMark className="h-6 w-6 translate-y-1" />
                    <span className="display-tight text-xl text-pub-onink">Inzira</span>
                    {/* The word is Kinyarwanda for "the way". Worth saying
                        once, quietly, rather than assuming everyone knows. */}
                    <span className="data-label hidden text-pub-onink-soft/70 sm:inline">the way</span>
                </button>

                <nav className="hidden items-center gap-8 md:flex">
                    {SECTIONS.map((section) => (
                        <button key={section.id} onClick={() => scrollToSection(section.id)}
                            className="text-sm text-pub-onink-soft transition-colors hover:text-pub-onink">
                            {section.label}
                        </button>
                    ))}
                </nav>

                <button onClick={() => onNavigate('/order')}
                    className="bg-pub-laterite px-5 py-2.5 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                    Book a delivery
                </button>
            </div>
        </header>
    );
}

export function PublicFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
    const link = 'text-left text-sm text-pub-onink-soft transition-colors hover:text-pub-onink';

    return (
        <footer className="bg-pub-ink px-5 pb-10 pt-16">
            <div className="mx-auto max-w-6xl">
                <div className="grid gap-10 border-b border-pub-onink/10 pb-12 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2">
                        <div className="flex items-baseline gap-3">
                            <InziraMark className="h-6 w-6 translate-y-1" />
                            <span className="display-tight text-xl text-pub-onink">Inzira</span>
                        </div>
                        <p className="mt-4 max-w-xs text-sm leading-relaxed text-pub-onink-soft">
                            Freight across Kigali, with the position of every consignment
                            visible to the person who sent it.
                        </p>
                    </div>

                    <div className="flex flex-col items-start gap-2.5">
                        <p className="data-label mb-1 text-pub-onink-soft/60">Get moving</p>
                        <button className={link} onClick={() => onNavigate('/order')}>Book a delivery</button>
                        <button className={link} onClick={() => onNavigate('/track')}>Track a shipment</button>
                        <button className={link} onClick={() => scrollToSection('contact')}>Standing routes</button>
                    </div>

                    <div className="flex flex-col items-start gap-2.5">
                        <p className="data-label mb-1 text-pub-onink-soft/60">Company</p>
                        <span className="text-sm text-pub-onink-soft">Gikondo Industrial Zone</span>
                        <span className="text-sm text-pub-onink-soft">Kigali, Rwanda</span>
                        <button className={link} onClick={() => onNavigate('/dispatch')}>Staff sign in</button>
                    </div>
                </div>

                <p className="data-label pt-6 text-pub-onink-soft/50">
                    © {new Date().getFullYear()} Inzira
                </p>
            </div>
        </footer>
    );
}
