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

const UPDATED = '17 August 2026';

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
    return (
        <div className="mx-auto max-w-3xl px-5 py-16">
            <p className="data-label text-pub-laterite">Legal</p>
            <h1 className="display-wide mt-3 text-4xl text-pub-onpaper sm:text-5xl">Privacy policy</h1>
            <p className="mt-4 text-[0.9375rem] text-pub-onpaper-soft">Last updated {UPDATED}</p>

            <p className="mt-8 text-base leading-relaxed text-pub-onpaper">
                Inzira moves freight around Kigali. This policy covers both the
                website you are reading and the Inzira Driver mobile app used by
                our drivers. The two collect different things from different
                people, so they are described separately.
            </p>

            <Section id="drivers" title="The driver app">
                <p>
                    Inzira Driver is a work tool, issued to drivers who carry
                    freight for us. Accounts are created by our dispatch team —
                    there is no public sign-up — and the app collects the
                    following while it is in use.
                </p>
                <dl className="mt-5">
                    <DataRow
                        what="Location"
                        why="Latitude, longitude and speed, so dispatch can see where a consignment is and tell the customer who is waiting for it. Collected only between the moment a driver starts a shift and the moment they end it, including while the app is in the background or the phone is locked, because a delivery does not pause when a driver pockets their phone. Ending a shift or signing out stops collection immediately."
                        shared="our dispatch team only"
                    />
                    <DataRow
                        what="Identity"
                        why="Name and phone number, which is also the sign-in username. A PIN is stored only as a one-way hash and cannot be read back by anyone, including us."
                        shared="our dispatch team only"
                    />
                    <DataRow
                        what="Compliance documents"
                        why="Photographs of the licences, insurance and roadworthiness certificates a driver is legally required to hold, reviewed by an administrator before that driver can be given cargo."
                        shared="our compliance reviewers only"
                    />
                    <DataRow
                        what="Delivery photographs"
                        why="A photograph taken at the point of handover as proof of delivery, attached to the consignment it belongs to."
                        shared="our dispatch team, and the customer for their own consignment"
                    />
                    <DataRow
                        what="Diagnostics"
                        why="Crash reports and error traces, so faults can be found and fixed."
                        shared="Sentry, our error-monitoring provider"
                    />
                </dl>
                <p className="mt-5">
                    <strong className="font-semibold text-pub-onpaper">Face ID, Touch ID and fingerprint unlock
                    never leave the phone.</strong> The app asks the device to confirm
                    it is you and receives only a yes or no. No biometric data
                    is transmitted to us, and none is stored on our systems.
                </p>
                <p>
                    Location is not collected when a driver is off shift, and it
                    is never sold, never used for advertising, and never shared
                    with anyone outside the dispatch team who is coordinating
                    that driver&rsquo;s work.
                </p>
            </Section>

            <Section id="customers" title="If you book a delivery">
                <p>
                    Booking through this website asks for your name, a phone
                    number, optionally an email address, and the pickup and
                    delivery addresses. We use them to carry out the delivery
                    and to reach you about it — the tracking code we send by
                    text, and a call if the driver cannot find the address.
                </p>
                <p>
                    Anyone holding the tracking code can see that
                    consignment&rsquo;s progress and the name of its driver. The
                    code is the key, so treat it as you would any other
                    reference for something being delivered to you.
                </p>
            </Section>

            <Section id="retention" title="How long we keep it">
                <p>
                    Consignment records, including delivery photographs, are kept
                    while they may still be needed to settle a query or a claim
                    about that delivery. Driver location history is operational
                    data and is kept only as long as it is useful for
                    coordinating and reviewing work.
                </p>
            </Section>

            <Section id="rights" title="Your choices">
                <p>
                    You can ask us what we hold about you, ask for it to be
                    corrected, or ask for it to be deleted, and we will do so
                    unless we are required to keep it — an example being the
                    compliance documents a licensed carrier has to retain.
                </p>
                <p>
                    Drivers can revoke location access at any time in the
                    phone&rsquo;s own settings. Doing so stops collection, and it
                    also stops dispatch being able to allocate work reliably, so
                    it is worth a conversation with the office first.
                </p>
            </Section>

            {/* Deliberately not id="contact": the landing page uses that for its
                standing-routes enquiry, and the header and footer scroll to it
                from every page. Two elements sharing the id meant a visitor on
                this page clicking "Talk to us" landed in a paragraph about
                erasing their personal data. */}
            <Section id="privacy-contact" title="Contact">
                {/* A working mailbox on a domain that accepts mail.
                    inzira.systems publishes no MX record, so an address there
                    would bounce silently — and a policy whose only contact
                    route is dead is worse than one with none, because it
                    looks answerable. Move this to a company address once the
                    domain accepts mail. */}
                <p>
                    Questions about this policy, or a request to see, correct
                    or delete your own data, can be sent to{' '}
                    <a href="mailto:sherifimran2000@gmail.com"
                        className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        sherifimran2000@gmail.com
                    </a>{' '}
                    or{' '}
                    <a href="tel:+250732324860"
                        className="focus-ring font-mono font-medium text-pub-laterite underline underline-offset-4">
                        +250 732 324 860
                    </a>
                    .
                </p>
                <p>
                    By post: Inzira, Gikondo Industrial Zone, Kigali, Rwanda.
                    Drivers can also raise anything about their own data
                    directly with dispatch. Our{' '}
                    <a href="/support" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        support page
                    </a>{' '}
                    covers everything else.
                </p>
            </Section>
        </div>
    );
}
