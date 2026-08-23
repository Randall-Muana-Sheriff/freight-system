import { useLanguage } from '../i18n';
import { SECTION, BLOCK, CARD_DARK, SectionHead } from './kit';

export function SystemSection() {
    const { t } = useLanguage();
    return (
        <>
            {/* Returns to the dark ground: this section is about the
                machinery on the road, and it gives the long light stretch
                a break before the page closes on the contact form. */}
            <section id="system" className={SECTION}>
                <div className={`${BLOCK} bg-pub-ink px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <div className="mb-14 max-w-2xl">
                        <SectionHead eyebrow={t.about.eyebrow} headline={t.about.headline} onPaper={false} />
                        <p className="mt-6 text-lg leading-relaxed text-pub-onink-soft">{t.about.intro}</p>
                    </div>

                    <div className="grid gap-5 md:grid-cols-3">
                        {t.about.views.map((view) => (
                            <article key={view.title} className={`bg-pub-ink2 px-6 py-7 ${CARD_DARK}`}>
                                <h3 className="display-tight text-lg text-pub-onink">{view.title}</h3>
                                <p className="mt-2.5 text-[17px] leading-relaxed text-pub-onink-soft">{view.body}</p>
                            </article>
                        ))}
                    </div>

                    <p className="mt-12 max-w-2xl border-l-2 border-pub-laterite pl-5 text-[17px] leading-relaxed text-pub-onink-soft">
                        {t.about.closing}
                    </p>
                </div>
                </div>
            </section>
        </>
    );
}
