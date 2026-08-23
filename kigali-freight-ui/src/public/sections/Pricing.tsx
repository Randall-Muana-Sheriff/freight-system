import { useLanguage } from '../i18n';
import { SECTION, BLOCK, CARD_DARK, SectionHead } from './kit';

export function PricingSection({ onNavigate }: { onNavigate: (path: string) => void }) {
    const { t } = useLanguage();
    return (
        <>
            {/* Pricing sits on the dark ground, and it is the only light
                section broken this early in the page. Two reasons: figures
                read harder against ink than against paper, and a rate card
                published in a market that does not publish rate cards is
                the boldest thing the site says. It should not look like
                another quiet paper block.

                The table scrolls inside its own container rather than
                letting the page scroll sideways — six columns do not fit a
                phone, and a landing page that pans horizontally feels
                broken even when the content is fine. */}
            <section id="pricing" className={SECTION}>
                <div className={`${BLOCK} bg-pub-ink px-6 py-16 sm:px-12 sm:py-20`}>
                <div className="mx-auto max-w-6xl">
                    <div className="mb-12 max-w-2xl">
                        <SectionHead eyebrow={t.pricing.eyebrow} headline={t.pricing.headline} onPaper={false} />
                        <p className="mt-6 text-lg leading-relaxed text-pub-onink-soft">{t.pricing.intro}</p>
                    </div>

                    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
                        <table className="w-full min-w-[34rem] border-collapse text-left">
                            <thead>
                                <tr className="border-b border-pub-onink/25">
                                    {[t.pricing.columns.vehicle, t.pricing.columns.payload, t.pricing.columns.base,
                                      t.pricing.columns.perKm, t.pricing.columns.perKg, t.pricing.columns.minimum].map((head, i) => (
                                        <th key={head} scope="col"
                                            className={`data-label pb-3 font-normal text-pub-onink-soft/70 ${i > 1 ? 'text-right' : ''}`}>
                                            {head}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {t.pricing.rows.map((row) => (
                                    <tr key={row.vehicle} className="border-b border-pub-onink/10 last:border-0">
                                        <th scope="row" className="py-4 pr-4 text-[17px] font-medium text-pub-onink">{row.vehicle}</th>
                                        <td className="py-4 pr-4 text-[17px] text-pub-onink-soft">{row.payload}</td>
                                        {[row.base, row.perKm, row.perKg, row.minimum].map((cell, i) => (
                                            <td key={i} className="py-4 pl-4 text-right text-[17px] tabular-nums text-pub-onink">{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-4 text-[15px] leading-relaxed text-pub-onink-soft/80">{t.pricing.unitNote}</p>

                    <h3 className="data-label mt-14 text-pub-laterite">{t.pricing.examplesTitle}</h3>
                    <div className="mt-5 grid gap-5 sm:grid-cols-3">
                        {t.pricing.examples.map((ex) => (
                            <article key={ex.job} className={`bg-pub-ink2 px-6 py-7 ${CARD_DARK}`}>
                                <p className="display-tight text-2xl tabular-nums text-pub-onink">{ex.price}<span className="ml-1.5 text-base text-pub-onink-soft">RWF</span></p>
                                <p className="mt-3 text-[17px] leading-relaxed text-pub-onink">{ex.job}</p>
                                <p className="mt-1 text-[15px] text-pub-onink-soft">{ex.detail}</p>
                            </article>
                        ))}
                    </div>

                    <h3 className="data-label mt-14 text-pub-laterite">{t.pricing.notesTitle}</h3>
                    <dl className="mt-5 grid gap-x-10 gap-y-7 sm:grid-cols-3">
                        {t.pricing.notes.map((note) => (
                            <div key={note.title}>
                                <dt className="display-tight text-lg text-pub-onink">{note.title}</dt>
                                <dd className="mt-1.5 text-[17px] leading-relaxed text-pub-onink-soft">{note.body}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className="mt-12 flex flex-col gap-5 border-t border-pub-onink/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
                        <p className="max-w-xl text-[17px] leading-relaxed text-pub-onink-soft">{t.pricing.closing}</p>
                        <button onClick={() => onNavigate('/order')}
                            className="focus-ring shrink-0 rounded-md bg-pub-laterite px-6 py-3 text-center font-semibold text-white">
                            {t.pricing.cta}
                        </button>
                    </div>
                </div>
                </div>
            </section>
        </>
    );
}
