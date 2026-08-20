// Required before the driver app can be listed on the App Store or Play
// Store, and doubly so because that app collects background location.
//
// Written from what the code actually does rather than from a template:
// the location task in kigali-freight-driver/lib/locationTracking.ts sends
// latitude, longitude and speed and nothing else, it runs only between
// shift start and shift end, and the biometric unlock is a local check
// that never produces data to send. A policy that overstates collection is
// as wrong as one that understates it, and this is the document a reviewer
// reads first.

import { usePrivacyDoc } from './i18n';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-24">
            <h2 className="display-tight mt-12 text-xl text-pub-onpaper">{title}</h2>
            <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-pub-onpaper-soft">
                {children}
            </div>
        </section>
    );
}

// A plain definition row. The App Store's own privacy questionnaire is
// structured this way — data type, why, who sees it — so matching that
// shape makes the two answers easy to keep consistent with each other.
function DataRow({ what, why, shared }: { what: string; why: string; shared: string }) {
    return (
        <div className="border-t border-pub-onpaper/10 py-3 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="data-label pt-0.5 text-pub-onpaper">{what}</dt>
            <dd className="mt-1 text-[0.9375rem] leading-relaxed text-pub-onpaper-soft sm:mt-0">
                {why} <span className="text-pub-onpaper/70">Shared with: {shared}.</span>
            </dd>
        </div>
    );
}

export default function PrivacyPolicy() {
    const d = usePrivacyDoc();
    return (
        <div className="mx-auto max-w-3xl px-5 py-16">
            <p className="data-label text-pub-laterite">{d.eyebrow}</p>
            <h1 className="display-wide mt-3 text-4xl text-pub-onpaper sm:text-5xl">{d.title}</h1>
            <p className="mt-4 text-[0.9375rem] text-pub-onpaper-soft">{d.updatedPrefix} {d.updated}</p>
            {/* Present only on a translated policy: a legal document in two
                languages has to say which one governs, or a discrepancy
                becomes an argument rather than a typo. */}
            {d.governingNote ? (
                <p className="mt-2 text-sm italic text-pub-onpaper-soft/80">{d.governingNote}</p>
            ) : null}

            <p className="mt-8 text-base leading-relaxed text-pub-onpaper">{d.intro}</p>

            <Section id="drivers" title={d.driverApp.title}>
                <p>{d.driverApp.intro}</p>
                <dl className="mt-5">
                    {d.driverApp.rows.map((row) => (
                        <DataRow key={row.what} what={row.what} why={row.why} shared={row.shared} />
                    ))}
                </dl>
                <p className="mt-5">
                    <strong className="font-semibold text-pub-onpaper">{d.driverApp.biometricsStrong}</strong>{d.driverApp.biometricsRest}
                </p>
                <p>{d.driverApp.closing}</p>
            </Section>

            <Section id="customers" title={d.customers.title}>
                <p>{d.customers.body}</p>
                <p>{d.customers.body2}</p>
            </Section>

            <Section id="retention" title={d.retention.title}>
                <p>{d.retention.body}</p>
            </Section>

            <Section id="rights" title={d.rights.title}>
                <p>{d.rights.body}</p>
                <p>{d.rights.body2}</p>
            </Section>

            {/* Deliberately not id="contact": the landing page uses that for its
                standing-routes enquiry, and the header and footer scroll to it
                from every page. Two elements sharing the id meant a visitor on
                this page clicking "Talk to us" landed in a paragraph about
                erasing their personal data. */}
            <Section id="privacy-contact" title={d.contact.title}>
                {/* A working mailbox on a domain that accepts mail.
                    inzira.systems publishes no MX record, so an address there
                    would bounce silently — and a policy whose only contact
                    route is dead is worse than one with none, because it
                    looks answerable. Move this to a company address once the
                    domain accepts mail. */}
                <p>
                    {d.contact.bodyBefore}
                    <a href="mailto:sherifimran2000@gmail.com"
                        className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        sherifimran2000@gmail.com
                    </a>
                    {d.contact.bodyMiddle}
                    <a href="tel:+250732324860"
                        className="focus-ring font-mono font-medium text-pub-laterite underline underline-offset-4">
                        +250 732 324 860
                    </a>
                    {d.contact.bodyAfter}
                </p>
                <p>
                    {d.contact.postal}
                    <a href="/support" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        {d.contact.supportLink}
                    </a>
                    {d.contact.postalAfter}
                </p>
            </Section>
        </div>
    );
}
