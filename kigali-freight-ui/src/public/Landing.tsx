import { useState, type FormEvent } from 'react';
import { sendContactMessage } from './publicApi';

// Straight from the design's services list. Six is what was drawn, and
// each line says what the customer gets rather than what we operate.
const SERVICES = [
    { n: '01', name: 'Same-day delivery', tag: 'Most popular', body: 'Order before noon — delivered the same day anywhere in Kigali. Tracked the whole way.' },
    { n: '02', name: 'Bulk freight', tag: null, body: 'Palletised and bulk loads. Heavy-van fleet with professional handling.' },
    { n: '03', name: 'Secure transport', tag: null, body: 'High-value cargo with verified drivers, tamper-evident sealing and full incident reporting.' },
    { n: '04', name: 'Scheduled routes', tag: 'For business', body: 'Set it once, runs daily. Your supply chain on autopilot between fixed locations.' },
    { n: '05', name: 'Hub-to-hub transfer', tag: null, body: 'Drop cargo at any of our hubs — we route it to the destination hub automatically.' },
    { n: '06', name: 'Document courier', tag: null, body: 'Contracts and certificates with signature confirmation and a full audit trail.' },
];

// Mirrors what the backend actually does, which is why step 2 says a
// dispatcher reviews rather than promising instant assignment.
const STEPS = [
    { n: '01', name: 'Place your order', body: 'Pickup, destination, cargo type. No account needed.' },
    { n: '02', name: 'Dispatcher reviews', body: 'We confirm the details and assign the nearest verified driver.' },
    { n: '03', name: 'Live tracking', body: 'Follow the delivery with the code we text you.' },
    { n: '04', name: 'Delivered', body: 'Photo proof of delivery captured on arrival.' },
];

function ContactForm() {
    const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setState('sending');
        setError(null);
        try {
            await sendContactMessage(form);
            setState('sent');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send your message.');
            setState('idle');
        }
    };

    if (state === 'sent') {
        return (
            <div className="rounded-2xl border border-brand-jade/40 bg-brand-surface2 p-10 text-center">
                <p className="font-display text-2xl font-black text-brand-text">Message received.</p>
                <p className="mt-2 font-body text-sm text-brand-muted">We&apos;ll get back to you on the number you gave us.</p>
            </div>
        );
    }

    const field = 'w-full rounded-xl border border-brand-line bg-brand-ink px-4 py-3 font-body text-sm text-brand-text placeholder:text-brand-muted/70 focus:border-brand-jade focus:outline-none';
    const label = 'mb-1.5 block font-body text-xs font-bold uppercase tracking-widest text-brand-muted';

    return (
        <form onSubmit={submit} className="rounded-2xl border border-brand-line bg-brand-surface2 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className={label} htmlFor="contact-name">Name</label>
                    <input id="contact-name" required className={field} value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jean Mutabazi" />
                </div>
                <div>
                    <label className={label} htmlFor="contact-phone">Phone</label>
                    <input id="contact-phone" required className={field} value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0788 000 000" />
                </div>
            </div>
            <div className="mt-4">
                <label className={label} htmlFor="contact-email">Email (optional)</label>
                <input id="contact-email" type="email" className={field} value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.rw" />
            </div>
            <div className="mt-4">
                <label className={label} htmlFor="contact-message">Message</label>
                <textarea id="contact-message" required rows={5} className={field} value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Tell us about your freight needs…" />
            </div>

            {error ? <p role="alert" className="mt-4 font-body text-sm text-red-400">{error}</p> : null}

            <button type="submit" disabled={state === 'sending'}
                className="mt-6 w-full rounded-full bg-brand-jade py-3.5 font-body font-bold text-brand-ink transition-colors hover:bg-brand-jade-deep disabled:opacity-60">
                {state === 'sending' ? 'Sending…' : 'Send message'}
            </button>
        </form>
    );
}

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
    const [code, setCode] = useState('');

    return (
        <>
            <section className="relative overflow-hidden border-b border-brand-line">
                <div className="mx-auto max-w-6xl px-5 py-24 text-center sm:py-32">
                    <p className="mb-6 font-body text-xs font-bold uppercase tracking-[0.2em] text-brand-jade">
                        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-jade align-middle" />
                        Kigali, Rwanda
                    </p>
                    <h1 className="font-display text-5xl font-black leading-[0.95] tracking-tight text-brand-text sm:text-7xl"
                        style={{ textWrap: 'balance' } as React.CSSProperties}>
                        Freight. On time.
                        <br />
                        <span className="text-brand-jade">Every time.</span>
                    </h1>
                    <p className="mx-auto mt-6 max-w-xl font-body text-base leading-relaxed text-brand-muted sm:text-lg">
                        Verified drivers, live GPS and delivery you can follow from pickup to
                        signature — across Kigali.
                    </p>

                    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                        <button onClick={() => onNavigate('/order')}
                            className="rounded-full bg-brand-jade px-7 py-3.5 font-body font-bold text-brand-ink transition-colors hover:bg-brand-jade-deep">
                            Place a freight order
                        </button>
                        <button onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
                            className="rounded-full border border-brand-line px-7 py-3.5 font-body font-medium text-brand-text transition-colors hover:border-brand-jade hover:text-brand-jade">
                            Explore services
                        </button>
                    </div>

                    {/* A customer arriving to check on a delivery is the most
                        common visit, so tracking is on the hero, not buried. */}
                    <form
                        onSubmit={(e) => { e.preventDefault(); if (code.trim()) onNavigate(`/track?code=${encodeURIComponent(code.trim())}`); }}
                        className="mx-auto mt-12 flex max-w-md items-center gap-2 rounded-full border border-brand-line bg-brand-surface2 p-2"
                    >
                        <label htmlFor="hero-track" className="pl-4 font-body text-xs font-bold uppercase tracking-widest text-brand-muted">
                            Track
                        </label>
                        <input id="hero-track" value={code} onChange={(e) => setCode(e.target.value)}
                            placeholder="INZ-XXXXXXXX"
                            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none" />
                        <button type="submit" className="rounded-full bg-brand-jade px-5 py-2 font-body text-sm font-bold text-brand-ink hover:bg-brand-jade-deep">
                            Go
                        </button>
                    </form>
                </div>
            </section>

            <section id="services" className="border-b border-brand-line">
                <div className="mx-auto max-w-6xl px-5 py-20">
                    <div className="mb-12 flex items-baseline gap-5">
                        <h2 className="font-body text-xs font-bold uppercase tracking-[0.2em] text-brand-jade">Services</h2>
                        <div className="h-px flex-1 bg-brand-line" />
                    </div>
                    <ul>
                        {SERVICES.map((service) => (
                            <li key={service.n} className="grid items-baseline gap-2 border-b border-brand-line py-7 sm:grid-cols-[auto_1fr_2fr_auto] sm:gap-8">
                                <span className="font-mono text-sm text-brand-muted/60">{service.n}</span>
                                <h3 className="font-display text-xl font-black tracking-tight text-brand-text">{service.name}</h3>
                                <p className="font-body text-sm leading-relaxed text-brand-muted">{service.body}</p>
                                {service.tag ? (
                                    <span className="justify-self-start rounded-full border border-brand-jade/40 px-3 py-1 font-body text-xs font-bold uppercase tracking-wider text-brand-jade sm:justify-self-end">
                                        {service.tag}
                                    </span>
                                ) : <span />}
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section id="how" className="border-b border-brand-line bg-brand-surface">
                <div className="mx-auto max-w-6xl px-5 py-20">
                    <div className="mb-12 flex items-baseline gap-5">
                        <h2 className="font-body text-xs font-bold uppercase tracking-[0.2em] text-brand-jade">How it works</h2>
                        <div className="h-px flex-1 bg-brand-line" />
                    </div>
                    <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {STEPS.map((step) => (
                            <li key={step.n} className="rounded-2xl border border-brand-line bg-brand-surface2 p-6">
                                <span className="font-display text-3xl font-black text-brand-jade/25">{step.n}</span>
                                <h3 className="mt-3 font-display text-lg font-black tracking-tight text-brand-text">{step.name}</h3>
                                <p className="mt-2 font-body text-sm leading-relaxed text-brand-muted">{step.body}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section id="contact">
                <div className="mx-auto max-w-2xl px-5 py-20">
                    <div className="mb-10 text-center">
                        <p className="mb-4 font-body text-xs font-bold uppercase tracking-[0.2em] text-brand-jade">Get in touch</p>
                        <h2 className="font-display text-4xl font-black leading-tight tracking-tight text-brand-text sm:text-5xl">
                            Let&apos;s talk <span className="text-brand-jade">freight.</span>
                        </h2>
                        <p className="mt-4 font-body text-base text-brand-muted">
                            Bulk enquiry, a standing route, or your very first order — we&apos;re quick to respond.
                        </p>
                    </div>
                    <ContactForm />
                </div>
            </section>
        </>
    );
}
