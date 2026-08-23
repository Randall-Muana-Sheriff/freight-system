import { useLanguage } from '../i18n';
import { SECTION, BLOCK, CARD, SectionHead } from './kit';

export function BusinessSection({ leads = false }: { leads?: boolean }) {
    const { t } = useLanguage();
    return (
        <>
            {/* The business track. It sits directly above the contact form
                and hands off into it, which is why its closing line and the
                form's heading were rewritten together: the section makes the
                offer, the form takes the enquiry. */}
            <section id="business" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <div className="mb-12 max-w-2xl">
                        <SectionHead level={leads ? 1 : 2} eyebrow={t.business.eyebrow} headline={t.business.headline} />
                        <p className="mt-6 text-lg leading-relaxed text-pub-onpaper-soft">{t.business.intro}</p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-3">
                        {t.business.offers.map((offer) => (
                            <article key={offer.name} className={`bg-pub-paper2 px-6 py-7 ${CARD}`}>
                                <h3 className="display-tight text-lg text-pub-onpaper">{offer.name}</h3>
                                <p className="mt-2.5 text-[17px] leading-relaxed text-pub-onpaper-soft">{offer.body}</p>
                            </article>
                        ))}
                    </div>

                    <div className="mt-12 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="max-w-xl border-l-2 border-pub-laterite pl-5 text-[17px] leading-relaxed text-pub-onpaper-soft">
                            {t.business.closing}
                        </p>
                        <button onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="focus-ring shrink-0 rounded-md border border-pub-onpaper/25 px-6 py-3 text-center font-semibold text-pub-onpaper">
                            {t.business.cta}
                        </button>
                    </div>
                </div>
                </div>
            </section>
        </>
    );
}
