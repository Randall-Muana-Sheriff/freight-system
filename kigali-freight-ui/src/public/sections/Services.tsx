import { useLanguage } from '../i18n';
import { SECTION, BLOCK, CARD, SectionHead } from './kit';

export function ServicesSection() {
    const { t } = useLanguage();
    return (
        <>
            <section id="services" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <SectionHead eyebrow={t.services.eyebrow} headline={t.services.headline} className="mb-14 max-w-2xl" />
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {t.services.items.map((service) => (
                            <article key={service.name} className={`bg-pub-paper2 px-6 py-7 ${CARD}`}>
                                <p className="data-label mb-3 text-pub-laterite">{service.spec}</p>
                                <h3 className="display-tight text-xl text-pub-onpaper">{service.name}</h3>
                                <p className="mt-2 text-[17px] leading-relaxed text-pub-onpaper-soft">{service.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
                </div>
            </section>
        </>
    );
}
