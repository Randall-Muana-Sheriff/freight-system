// Every interface string on the customer site, in one place.
//
// Deliberately the *interface* and not the editorial copy. Landing-page
// prose still lives in content.ts, because rendering writing like "Most
// freight goes quiet the moment it leaves your gate" into Kinyarwanda is
// a copywriting job in Kinyarwanda rather than a translation job, and a
// literal rendering would read as flat as it sounds. Those sections fall
// back to English until a Kinyarwanda speaker writes them properly.
//
// English is the source of truth for the *shape*: rw.ts is typed against
// it, so a key that exists here and nowhere else is caught at build time
// rather than showing up as a blank on someone's phone.

export const en = {
    nav: {
        whatWeMove: 'What we move',
        howItWorks: 'How it works',
        theSystem: 'The system',
        talkToUs: 'Talk to us',
        home: 'Inzira home',
    },
    actions: {
        book: 'Book a delivery',
        track: 'Track a shipment',
        trackSubmit: 'Track',
        looking: 'Looking…',
        placing: 'Placing…',
        placeOrder: 'Place the order',
        showMeAround: 'Show me around',
        standingRoutes: 'Standing routes',
        staffSignIn: 'Staff sign in',
        support: 'Support',
        privacy: 'Privacy',
        skipToContent: 'Skip to content',
        bookInstead: 'Book a delivery instead →',
    },
    track: {
        title: 'Where is it?',
        eyebrow: 'Tracking',
        codeLabel: 'Tracking code',
        finding: 'Finding your consignment',
        collectFrom: 'Collect from',
        deliverTo: 'Deliver to',
        driver: 'Driver',
        placed: 'Placed',
        statusInProgress: 'In progress',
        statusDelivered: 'Delivered',
        statusCancelled: 'Cancelled',
        proofTitle: 'Proof of delivery',
        notYet: 'Not yet',
        milestones: {
            received: 'Order received',
            receivedNote: 'With a dispatcher for checking.',
            assigned: 'Driver assigned',
            assignedNote: 'On a driver’s manifest.',
            collected: 'Collected',
            collectedNote: 'Cargo is on the vehicle.',
            delivered: 'Delivered',
            deliveredNote: 'Signed for, with photo proof.',
        },
    },
    form: {
        name: 'Name',
        phone: 'Phone',
        emailOptional: 'Email — optional',
        whatMoved: 'What do you need moved?',
        messageReceived: 'Message received.',
        weAnswer: 'We answer on the number you gave us, usually the same day.',
    },
    footer: {
        getMoving: 'Get moving',
        company: 'Company',
        tagline: 'Freight across Kigali, with the position of every consignment visible to the person who sent it.',
    },

    // ── Landing-page copy ────────────────────────────────────────────
    // Moved here from content.ts so it can be translated. Arrays are
    // translated whole rather than element by element: a half-translated
    // list of services would read as an error, and "all six or none" is
    // also the natural unit for whoever is doing the writing.
    hero: {
        eyebrow: 'Freight across Kigali',
        headlineTop: 'Know where',
        headlineBottom: 'your cargo is.',
        body:
            'Most freight goes quiet the moment it leaves your gate. Ours doesn\u2019t \u2014 every ' +
            'consignment carries a code that shows you its position until somebody signs for it.',
    },
    services: {
        eyebrow: 'What we move',
        headline: 'Six ways to get it there.',
        items: [
            { name: 'Same-day delivery', spec: 'Order before noon', body: 'Anywhere in Kigali, on the road within the hour, tracked the whole way.' },
            { name: 'Bulk freight', spec: 'Palletised loads', body: 'Heavy-van fleet, with drivers who load and secure the cargo themselves.' },
            { name: 'Secure transport', spec: 'Sealed and verified', body: 'High-value cargo with tamper-evident sealing and an incident report if anything is touched.' },
            { name: 'Scheduled routes', spec: 'Set once, runs daily', body: 'A standing lane between two fixed points, so you stop booking the same job every morning.' },
            { name: 'Hub-to-hub', spec: 'Drop and go', body: 'Leave cargo at any of our hubs and we move it to the destination hub for you.' },
            { name: 'Document courier', spec: 'Signature on arrival', body: 'Contracts and certificates, with a chain of custody you can show a client.' },
        ],
    },
    journey: {
        eyebrow: 'Start to finish',
        headline: 'What happens to your cargo.',
        stops: [
            { name: 'You place the order', body: 'Pickup, destination, what it is. No account, no phone call, no waiting on a quote before you can book.' },
            { name: 'A dispatcher confirms it', body: 'A person checks the addresses and rings you if anything is unclear. Nothing reaches a driver unchecked.' },
            { name: 'A driver takes it', body: 'The nearest verified driver on shift, with your cargo on their manifest and their vehicle on our map.' },
            { name: 'You watch it move', body: 'Your code shows where the cargo is, not just that it left. Refresh it as often as you like.' },
            { name: 'Signed and photographed', body: 'Proof captured at the door and timestamped, so the delivery is on record and not just remembered.' },
        ],
    },
    about: {
        eyebrow: 'The system',
        headline: 'Everyone is looking at the same record.',
        intro:
            'Most freight runs on a phone and a notebook, so what you get told depends on who ' +
            'you ask and when they last checked. Inzira is one system instead. The driver\u2019s ' +
            'phone, the dispatcher\u2019s screen and your tracking page are three views of the same ' +
            'consignment, and they update together.',
        views: [
            { title: 'What you see', body: 'Book with a name and a number \u2014 no account. You get a code that shows the stage your cargo is at, where it was collected from and where it is going, the driver\u2019s first name once one is assigned, and the photograph taken when it was handed over.' },
            { title: 'What the driver carries', body: 'An app holding only their own jobs. It reports the vehicle\u2019s position while the shift is running, takes the proof photo at the door, and reports breakdowns and damage from the roadside. In a signal-dead corner of the city it holds the confirmation and sends it when the connection returns.' },
            { title: 'What dispatch watches', body: 'Every working vehicle on one live map, with fenced delivery areas that raise an alert if a vehicle carrying your cargo leaves where it should be. New orders are checked by a person, and the system suggests the closest available driver rather than whoever answers first.' },
        ],
        closing:
            'None of that is visible from the outside, which is the point \u2014 it is why the code ' +
            'we text you can be trusted to say something true.',
    },
    contact: {
        eyebrow: 'Talk to us',
        headline: 'Moving something regularly?',
        body:
            'Standing routes and bulk lanes are priced per business rather than per drop. ' +
            'Tell us the shape of it and we will come back with a number.',
        address: 'Gikondo Industrial Zone \u00b7 Kigali',
    },
    language: {
        label: 'Language',
        english: 'English',
        kinyarwanda: 'Kinyarwanda',
    },
} as const;

// Keys enforced, values not. `as const` above makes every English value a
// literal type, which without this would require the Kinyarwanda to be
// character-for-character identical to the English — the type system
// demanding a translation not be a translation. Widening to `string` keeps
// the part that matters: a key added to en.ts and forgotten in rw.ts is a
// build failure, not a blank space on somebody's phone.
type Widen<T> = T extends string
    ? string
    : T extends readonly (infer E)[]
        ? readonly Widen<E>[]
        : { [K in keyof T]: Widen<T[K]> };

export type Strings = Widen<typeof en>;

// What an in-progress translation is allowed to look like.
//
// French is complete and typed as Strings. Kinyarwanda is deliberately
// partial: the interface is translated and the editorial prose is waiting
// on a Kinyarwanda writer, so its file must be allowed to have holes
// without the build failing. Anything absent falls back to English at
// runtime — a visitor sees a real English sentence rather than a blank,
// which is the only acceptable behaviour for a page that is live.
//
// Arrays are all-or-nothing on purpose. A half-translated list of six
// services reads as a fault, and "translate all six or leave them" is
// also the natural unit of work for whoever is writing.
export type PartialStrings<T = Strings> = T extends string
    ? string
    : T extends readonly (infer E)[]
        ? readonly Widen<E>[]
        : { [K in keyof T]?: PartialStrings<T[K]> };
