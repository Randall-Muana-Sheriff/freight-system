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

const EMAIL = 'sherifimran2000@gmail.com';
const PHONE = '+250 732 324 860';
const PHONE_HREF = '+250732324860';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="display-tight mt-12 text-xl text-pub-onpaper">{title}</h2>
            <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-pub-onpaper-soft">
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
            <div className="mt-1.5 text-[0.9375rem] leading-relaxed text-pub-onpaper-soft">{children}</div>
        </div>
    );
}

export default function Support() {
    return (
        <div className="mx-auto max-w-3xl px-5 py-16">
            <p className="data-label text-pub-laterite">Help</p>
            <h1 className="display-wide mt-3 text-4xl text-pub-onpaper sm:text-5xl">Support</h1>

            <p className="mt-8 text-base leading-relaxed text-pub-onpaper">
                Something wrong with a delivery, or with the Inzira Driver app?
                Reach us directly — during working hours the phone is faster
                than email, and if cargo is on a truck right now, call.
            </p>

            <div className="mt-6 flex flex-col gap-3 border-y border-pub-onpaper/10 py-6 sm:flex-row sm:gap-10">
                <div>
                    <p className="data-label text-pub-onpaper-soft/70">Phone</p>
                    <a href={`tel:${PHONE_HREF}`}
                        className="focus-ring mt-1 block font-mono text-lg font-medium text-pub-laterite underline underline-offset-4">
                        {PHONE}
                    </a>
                </div>
                <div>
                    <p className="data-label text-pub-onpaper-soft/70">Email</p>
                    <a href={`mailto:${EMAIL}`}
                        className="focus-ring mt-1 block text-lg font-medium text-pub-laterite underline underline-offset-4">
                        {EMAIL}
                    </a>
                </div>
            </div>

            <Section title="Drivers">
                <p>
                    Accounts are created by dispatch — there is no sign-up in
                    the app. If your number is not recognised, it has not been
                    registered yet, and dispatch can do that in a moment.
                </p>
                <div className="mt-4">
                    <Answer problem="The verification code never arrives">
                        Codes are sent by text and can take a minute on a busy
                        network. Check the number you typed is the one dispatch
                        registered, then request a new code. If nothing comes
                        through twice, call us and we will read one to you.
                    </Answer>
                    <Answer problem="I have forgotten my PIN">
                        Call dispatch. They can reset it, and the app will walk
                        you through choosing a new one the next time you sign in.
                    </Answer>
                    <Answer problem="Dispatch says they cannot see where I am">
                        Location only reports while a shift is active, so check
                        the home screen says you are on shift. If it does, open
                        your phone&rsquo;s settings for Inzira Driver and make
                        sure location permission is set to <em>Always</em> —
                        &ldquo;While Using&rdquo; stops reporting the moment the
                        screen locks, which is most of a driving day.
                    </Answer>
                    <Answer problem="I cannot upload a delivery photo">
                        The photo needs a data connection to reach the office.
                        In a weak-signal spot, complete the stop when you are
                        moving again — the job stays on your list until it goes
                        through.
                    </Answer>
                    <Answer problem="The app says my documents need attention">
                        One of your licences, insurance or roadworthiness
                        certificates is missing, rejected or expired, and work
                        cannot be assigned until it is approved. The Profile
                        screen shows which one. Photograph the document again in
                        good light and re-upload it.
                    </Answer>
                </div>
            </Section>

            <Section title="Customers">
                <p>
                    If you are waiting on a consignment, the tracking code from
                    your confirmation text shows where it has reached on our{' '}
                    <a href="/track" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        tracking page
                    </a>
                    . If the code does not work, or the delivery is late, call
                    the number above with the code to hand.
                </p>
            </Section>

            <Section title="Your data">
                <p>
                    What we collect, why, and how to ask for a copy or deletion
                    is set out in our{' '}
                    <a href="/privacy" className="focus-ring font-medium text-pub-laterite underline underline-offset-4">
                        privacy policy
                    </a>
                    .
                </p>
            </Section>
        </div>
    );
}
