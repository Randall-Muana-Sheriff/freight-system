import { useLanguage } from '../i18n';
import { SECTION, BLOCK, SectionHead } from './kit';

export function FaqSection({ leads = false }: { leads?: boolean }) {
    const { t } = useLanguage();
    return (
        <>
            {/* Objections, immediately before the form that catches
                whatever is left. A <dl> rather than a stack of divs: these
                genuinely are terms and their definitions, and it is the
                markup a screen reader can navigate as pairs.

                Two columns on wide screens, and the first answer is much
                the longest — it is the liability one, and it earns the
                room. */}
            <section id="faq" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-5xl">
                    <SectionHead level={leads ? 1 : 2} eyebrow={t.faq.eyebrow} headline={t.faq.headline} className="mb-12 max-w-2xl" />

                    {/* Columns rather than a two-column grid. In a grid every
                        row is as tall as its tallest cell, and the liability
                        answer is three times the length of "how do I pay" —
                        which left a hole beside it big enough to read as a
                        missing section. Flowed content packs instead, and
                        break-inside keeps a question with its answer. */}
                    <dl className="gap-x-12 md:columns-2">
                        {t.faq.items.map((item) => (
                            <div key={item.q} className="mb-9 break-inside-avoid">
                                <dt className="display-tight text-lg text-pub-onpaper">{item.q}</dt>
                                <dd className="mt-2 text-[17px] leading-relaxed text-pub-onpaper-soft">{item.a}</dd>
                            </div>
                        ))}
                    </dl>

                    <p className="mt-12 border-l-2 border-pub-laterite pl-5 text-[17px] leading-relaxed text-pub-onpaper-soft">
                        {t.faq.closing}
                    </p>
                </div>
                </div>
            </section>
        </>
    );
}
