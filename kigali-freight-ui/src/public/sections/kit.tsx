// The pieces every band on the public site is built from.
//
// Pulled out of Landing.tsx when the landing page stopped being the whole
// site. Five pages now draw these, and a card shadow or a section gutter
// that differs by two pixels between pages is the sort of thing nobody can
// name but everybody sees.
import { useState, type FormEvent } from 'react';
import { useLanguage } from '../i18n';
import { sendContactMessage } from '../publicApi';

// Stated once so every band on the page sits in the same column and the
// gaps between them are even. A section that set its own would be the one
// that quietly drifts out of line.
export const SECTION = 'px-4 py-3 sm:px-6 sm:py-4';

// A card that sits above the surface rather than being ruled off from it.
// Defined once because there are four groups of them and a shadow that
// differs by two pixels between groups is the sort of thing nobody can
// name but everybody sees.
//
// The shadow is soft and low rather than dramatic: these are meant to
// look like paper resting on paper, and a heavy drop shadow on a page
// this quiet reads as a different site's component pasted in.
export const CARD = 'rounded-md card-float';
export const CARD_HOVER = 'card-float-lift';
export const CARD_DARK = 'rounded-md card-float-dark';
export const BLOCK = 'mx-auto max-w-6xl overflow-hidden rounded-lg';

export function SectionHead({ eyebrow, headline, onPaper = true, className = '' }: {
    eyebrow: string; headline: string; onPaper?: boolean; className?: string;
}) {
    return (
        <div className={className}>
            <p className={`data-label mb-5 ${onPaper ? 'text-pub-laterite' : 'text-pub-laterite-soft'}`}>{eyebrow}</p>
            <h2 className={`display-wide text-[clamp(2rem,4.5vw,3.2rem)] ${onPaper ? 'text-pub-onpaper' : 'text-pub-onink'}`}
                style={{ textWrap: 'balance' } as React.CSSProperties}>
                {headline}
            </h2>
        </div>
    );
}

export function ContactForm() {
    const { t } = useLanguage();
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
                <p className="display-tight text-2xl text-pub-onpaper">{t.form.messageReceived}</p>
                <p className="mt-2 text-[15px] text-pub-onpaper-soft">{t.form.weAnswer}</p>
            </div>
        );
    }

    const field = 'w-full border-b border-pub-onpaper/20 bg-transparent py-2.5 text-[17px] text-pub-onpaper placeholder:text-pub-onpaper-soft/50 focus:border-pub-laterite focus:outline-none';

    return (
        <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">{t.form.name}</span>
                <input required className={field} value={form.name} placeholder={t.order.namePlaceholder}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
                <span className="data-label text-pub-onpaper-soft">{t.form.phone}</span>
                <input required className={field} value={form.phone} placeholder={t.order.phonePlaceholder}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">{t.form.emailOptional}</span>
                <input type="email" className={field} value={form.email} placeholder={t.order.emailPlaceholder}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
                <span className="data-label text-pub-onpaper-soft">{t.form.whatMoved}</span>
                <textarea required rows={3} className={`${field} resize-none`} value={form.message}
                    placeholder={t.misc.enquiryPlaceholder}
                    onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>

            {error ? <p role="alert" className="text-[15px] text-pub-laterite sm:col-span-2">{error}</p> : null}

            <div className="sm:col-span-2">
                <button type="submit" disabled={state === 'sending'}
                    className="focus-ring rounded-md bg-pub-onpaper px-8 py-4 text-sm font-semibold text-pub-paper transition-colors hover:bg-pub-laterite disabled:opacity-60">
                    {state === 'sending' ? t.buttons.sending : t.buttons.send}
                </button>
            </div>
        </form>
    );
}
