import { useState, type FormEvent } from 'react';
import { sendContactMessage } from './publicApi';
import { HeroRoute } from './HeroRoute';

// Services are a menu, not a sequence — nobody does same-day delivery
// *before* bulk freight. So they get no numbering. What they do get is the
// one fact a buyer decides on, pulled out in mono, because "up to 1,000 kg"
// and "before noon" are what actually answer "can you do my job?"
const SERVICES = [
    { name: 'Same-day delivery', spec: 'Order before noon', body: 'Anywhere in Kigali, on the road within the hour, tracked the whole way.' },
    { name: 'Bulk freight', spec: 'Palletised loads', body: 'Heavy-van fleet with drivers who load and secure it themselves.' },
    { name: 'Secure transport', spec: 'Sealed & verified', body: 'High-value cargo, tamper-evident sealing, full incident reporting.' },
    { name: 'Scheduled routes', spec: 'Set once, runs daily', body: 'A standing lane between two fixed points. Your supply chain on autopilot.' },
    { name: 'Hub-to-hub', spec: 'Drop and go', body: 'Leave cargo at any hub — we move it to the destination hub for you.' },
    { name: 'Document courier', spec: 'Signature on arrival', body: 'Contracts and certificates with a full chain-of-custody trail.' },
];

// This one IS a sequence — a consignment genuinely passes through these in
// order — so it earns the route-line treatment and the ordinals.
const STOPS = [
    { name: 'You place the order', body: 'Pickup, destination, what it is. No account, no phone call, no waiting for a quote to book.' },
    { name: 'A dispatcher confirms it', body: 'A person checks the addresses and calls you if anything is unclear. Nothing goes to a driver unchecked.' },
    { name: 'A driver takes it', body: 'The nearest verified driver on shift, with your cargo on their manifest and their position on our map.' },
    { name: 'You watch it move', body: 'Your tracking code shows where it is, not just that it left. Refresh it as often as you like.' },
    { name: 'Signed and photographed', body: 'Proof of delivery captured at the door, timestamped against the position it was taken at.' },
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
            <div className="border-l-2 border-pub-laterite bg-pub-paper2 px-8 py-10">
                <p className="display-tight text-2xl text-pub-onpaper">Message received.</p>
                <p className="mt-2 text-sm text-pub-onpaper-soft">We answer on the number you gave us, usually the same day.</p>
            </div>
        );
    }

    const field = 'w-full border-b border-pub-onpaper/20 bg-transparent py-2.5 text-[15px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

    return (
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">Name</span>
                <input required className={field} value={form.name} placeholder="Jean Mutabazi"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">Phone</span>
                <input required className={field} value={form.phone} placeholder="0788 000 000"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">Email — optional</span>
                <input type="email" className={field} value={form.email} placeholder="you@company.rw"
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">What do you need moved?</span>
                <textarea required rows={3} className={`${field} resize-none`} value={form.message}
                    placeholder="Two pallets a week from Gikondo to Musanze…"
                    onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>

            {error ? <p role="alert" className="text-sm text-pub-laterite sm:col-span-2">{error}</p> : null}

            <div className="sm:col-span-2">
                <button type="submit" disabled={state === 'sending'}
                    className="bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:opacity-60">
                    {state === 'sending' ? 'Sending…' : 'Send message'}
                </button>
            </div>
        </form>
    );
}

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
    const [code, setCode] = useState('');

    return (
        <>
            {/* THE ROAD — dark, live, moving. */}
            <section className="bg-pub-ink px-5 pb-16 pt-14 sm:pt-20">
                <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
                    <div>
                        <p className="data-label mb-7 text-pub-laterite-soft">Freight across Kigali</p>
                        <h1 className="display-wide text-[clamp(2.9rem,7.5vw,5.2rem)] text-pub-onink" style={{ textWrap: 'balance' } as React.CSSProperties}>
                            Know where
                            <br />
                            your cargo is.
                        </h1>
                        <p className="mt-7 max-w-md text-lg leading-relaxed text-pub-onink-soft">
                            Most freight goes quiet the moment it leaves your gate. Ours doesn&apos;t —
                            every consignment carries a code that shows you its position until
                            somebody signs for it.
                        </p>

                        <div className="mt-9 flex flex-wrap items-center gap-3">
                            <button onClick={() => onNavigate('/order')}
                                className="bg-pub-laterite px-8 py-4 text-sm font-semibold text-pub-onink transition-colors hover:bg-pub-laterite-soft">
                                Book a delivery
                            </button>
                            <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onNavigate(`/track?code=${encodeURIComponent(code.trim())}`); }}
                                className="flex items-center border-b border-pub-onink/25 focus-within:border-pub-onink">
                                <label htmlFor="hero-track" className="sr-only">Tracking code</label>
                                <input id="hero-track" value={code} onChange={(e) => setCode(e.target.value)}
                                    placeholder="Have a code?"
                                    className="w-40 bg-transparent px-1 py-3.5 font-mono text-sm uppercase text-pub-onink placeholder:normal-case placeholder:text-pub-onink-soft/70 focus:outline-none" />
                                <button type="submit" className="px-2 py-3.5 text-sm font-semibold text-pub-onink hover:text-pub-signal">Track →</button>
                            </form>
                        </div>
                    </div>

                    <HeroRoute />
                </div>
            </section>

            {/* THE PAPERWORK — light, precise, documentary. */}
            <section id="services" className="bg-pub-paper px-5 py-20 sm:py-28">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 max-w-2xl">
                        <p className="data-label mb-5 text-pub-laterite">What we move</p>
                        <h2 className="display-wide text-[clamp(2rem,4.5vw,3.2rem)] text-pub-onpaper">
                            Six ways to get it there.
                        </h2>
                    </div>

                    <div className="grid gap-x-14 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                        {SERVICES.map((service) => (
                            <article key={service.name} className="border-t border-pub-onpaper/15 pt-5">
                                <p className="data-label mb-3 text-pub-laterite">{service.spec}</p>
                                <h3 className="display-tight text-xl text-pub-onpaper">{service.name}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-pub-onpaper-soft">{service.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* The route line: this section is a journey, so it is drawn as
                one. The line is the page's structural signature and the only
                place ordinals appear, because this is the only content where
                order is real information. */}
            <section id="how" className="bg-pub-paper2 px-5 py-20 sm:py-28">
                <div className="mx-auto max-w-3xl">
                    <div className="mb-14">
                        <p className="data-label mb-5 text-pub-laterite">Start to finish</p>
                        <h2 className="display-wide text-[clamp(2rem,4.5vw,3.2rem)] text-pub-onpaper">
                            What happens to your cargo.
                        </h2>
                    </div>

                    <ol className="relative">
                        <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-3 w-px bg-pub-onpaper/20" />
                        {STOPS.map((stop, index) => (
                            <li key={stop.name} className="relative flex gap-7 pb-11 last:pb-0">
                                <span aria-hidden="true"
                                    className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                                        index === 0 ? 'border-pub-laterite bg-pub-laterite' : 'border-pub-onpaper/40 bg-pub-paper2'
                                    }`} />
                                <div>
                                    <p className="data-label mb-1.5 text-pub-onpaper-soft">Stop {index + 1}</p>
                                    <h3 className="display-tight text-lg text-pub-onpaper">{stop.name}</h3>
                                    <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-pub-onpaper-soft">{stop.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section id="contact" className="bg-pub-paper px-5 py-20 sm:py-28">
                <div className="mx-auto grid max-w-5xl gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
                    <div>
                        <p className="data-label mb-5 text-pub-laterite">Talk to us</p>
                        <h2 className="display-wide text-[clamp(2rem,4.5vw,3rem)] text-pub-onpaper">
                            Moving something regularly?
                        </h2>
                        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-pub-onpaper-soft">
                            Standing routes and bulk lanes are priced per business rather than per
                            drop. Tell us the shape of it and we&apos;ll come back with a number.
                        </p>
                        <p className="data-label mt-8 text-pub-onpaper-soft">Gikondo Industrial Zone · Kigali</p>
                    </div>
                    <ContactForm />
                </div>
            </section>
        </>
    );
}
