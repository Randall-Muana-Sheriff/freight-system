// The Support URL every app store requires, and the page a driver lands on
// when something is wrong mid-shift.
//
// Written for two different readers who arrive here for different reasons:
// a driver whose app is misbehaving while cargo is on the truck, and a
// customer wondering where their delivery is. The driver's problems come
// first because theirs are the urgent ones — a reviewer checking this URL
// is looking for evidence the app is genuinely supported, and specific
// answers to real failure modes read as support in a way that a contact
// form alone does not.

import { useSupportDoc } from './i18n';

// An address on the domain, not a personal inbox. It reaches the same person
// — it is an alias forwarding to the Titan mailbox — but a customer whose
// cargo has gone missing is being asked to trust a freight company, and a
// gmail address on the page they reach at that moment costs exactly the
// confidence the page exists to give.
const EMAIL = 'support@inzira.systems';
const PHONE = '+250 732 324 860';
const PHONE_HREF = '+250732324860';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="display-tight mt-12 text-xl text-pub-onpaper">{title}</h2>
            <div className="mt-3 space-y-3 text-[1.0625rem] leading-relaxed text-pub-onpaper-soft">
                {children}
            </div>
        </section>
    );
}

// Problem first, then what to do about it. A driver scanning this page in a
// cab has time to read one line, so the symptom is the thing in bold.
function Answer({ problem, children }: { problem: string; children: React.ReactNode }) {
    return (
        <div className="border-t border-pub-onpaper/10 py-4">
            <p className="font-semibold text-pub-onpaper">{problem}</p>
            <div className="mt-1.5 text-[1.0625rem] leading-relaxed text-pub-onpaper-soft">{children}</div>
        </div>
    );
}

export default function Support() {
    const d = useSupportDoc();
    return (
        <div className="mx-auto my-3 max-w-3xl rounded-lg bg-pub-paper px-6 py-14 sm:px-12 sm:py-16">
            <p className="data-label text-pub-laterite">{d.eyebrow}</p>
            <h1 className="display-wide mt-3 text-4xl text-pub-onpaper sm:text-5xl">{d.title}</h1>

            <p className="mt-8 text-base leading-relaxed text-pub-onpaper">{d.intro}</p>

            <div className="mt-6 flex flex-col gap-3 border-y border-pub-onpaper/10 py-6 sm:flex-row sm:gap-10">
                <div>
                    <p className="data-label text-pub-onpaper-soft/70">{d.phoneLabel}</p>
                    <a href={`tel:${PHONE_HREF}`}
                        className="focus-ring mt-1 block font-mono text-lg font-medium text-pub-laterite underline underline-offset-4">
                        {PHONE}
                    </a>
                </div>
                <div>
                    <p className="data-label text-pub-onpaper-soft/70">{d.emailLabel}</p>
                    <a href={`mailto:${EMAIL}`}
                        className="focus-ring mt-1 block text-lg font-medium text-pub-laterite underline underline-offset-4">
                        {EMAIL}
                    </a>
                </div>
            </div>

            <Section title={d.drivers.title}>
                <p>{d.drivers.intro}</p>
                <div className="mt-4">
                    {d.drivers.answers.map((a) => (
                        <Answer key={a.problem} problem={a.problem}>{a.body}</Answer>
                    ))}
                </div>
            </Section>

            <Section title={d.customers.title}>
                <p>
                    {d.customers.bodyBefore}
                    <a href="/track" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        {d.customers.trackingLink}
                    </a>
                    {d.customers.bodyAfter}
                </p>
            </Section>

            <Section title={d.data.title}>
                <p>
                    {d.data.bodyBefore}
                    <a href="/privacy" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        {d.data.privacyLink}
                    </a>
                    {d.data.bodyAfter}
                </p>
            </Section>
        </div>
    );
}
