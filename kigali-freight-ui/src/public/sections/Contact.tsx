import { useLanguage } from '../i18n';
import { SECTION, BLOCK, SectionHead, ContactForm } from './kit';

export function ContactSection() {
    const { t } = useLanguage();
    return (
        <>
            <section id="contact" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto grid max-w-5xl gap-14 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
                    <div>
                        <SectionHead eyebrow={t.contact.eyebrow} headline={t.contact.headline} />
                        <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-pub-onpaper-soft">{t.contact.body}</p>
                        <p className="data-label mt-8 text-pub-onpaper-soft">{t.contact.address}</p>

                        {/* Hours, and the reason there are three of them: the
                            platform never closes, the phone does, and the
                            account managers keep office hours. Publishing one
                            merged line would mean publishing the narrowest,
                            and someone booking at midnight would think they
                            could not. */}
                        <h3 className="data-label mt-10 text-pub-laterite">{t.contact.hoursTitle}</h3>
                        <dl className="mt-4 space-y-4 border-t border-pub-onpaper/10 pt-4">
                            {t.contact.hours.map((row) => (
                                <div key={row.label}>
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                                        <dt className="text-[17px] font-medium text-pub-onpaper">{row.label}</dt>
                                        <dd className="text-[15px] tabular-nums text-pub-laterite">{row.time}</dd>
                                    </div>
                                    <p className="mt-0.5 max-w-sm text-[15px] leading-relaxed text-pub-onpaper-soft">{row.note}</p>
                                </div>
                            ))}
                        </dl>
                    </div>
                    <ContactForm />
                </div>
                </div>
            </section>
        </>
    );
}
