import { useLanguage } from '../i18n';
import { SECTION, BLOCK, SectionHead } from './kit';

export function JourneySection({ leads = false }: { leads?: boolean }) {
    const { t } = useLanguage();
    return (
        <>
            {/* The one section that is genuinely a sequence, so the one
                section drawn as a route with ordinals. */}
            <section id="how" className={SECTION}>
                <div className={`${BLOCK} bg-pub-paper px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-3xl">
                    <SectionHead level={leads ? 1 : 2} eyebrow={t.journey.eyebrow} headline={t.journey.headline} className="mb-14" />
                    <ol className="relative">
                        <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-3 w-px bg-pub-onpaper/20" />
                        {t.journey.stops.map((stop, index) => (
                            <li key={stop.name} className="relative flex gap-7 pb-11 last:pb-0">
                                <span aria-hidden="true"
                                    className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                                        index === 0 ? 'border-pub-laterite bg-pub-laterite' : 'border-pub-onpaper/40 bg-pub-paper2'
                                    }`} />
                                <div>
                                    <p className="data-label mb-1.5 text-pub-onpaper-soft">{t.journeyExtra.stopLabel} {index + 1}</p>
                                    <h3 className="display-tight text-lg text-pub-onpaper">{stop.name}</h3>
                                    <p className="mt-1.5 max-w-xl text-[17px] leading-relaxed text-pub-onpaper-soft">{stop.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
                </div>
            </section>
        </>
    );
}
