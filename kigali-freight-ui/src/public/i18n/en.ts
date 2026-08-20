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

    // ── Booking form ─────────────────────────────────────────────────
    order: {
        eyebrow: 'Booking · no account needed',
        received: 'Order received',
        collectFrom: 'Collect from',
        collectPlaceholder: 'Gikondo Industrial Zone, gate 3',
        deliverTo: 'Deliver to',
        deliverPlaceholder: 'Kimironko Market, shop 14',
        whatIsIt: 'What is it',
        choose: 'Choose…',
        weight: 'Weight in kg',
        weightPlaceholder: '150',
        neededBy: 'When do you need it — optional',
        instructions: 'Anything the driver should know — optional',
        instructionsPlaceholder: 'Fragile. Ask for Claudine at the gate.',
        yourName: 'Your name',
        namePlaceholder: 'Jean Mutabazi',
        phonePlaceholder: '0788 000 000',
        emailPlaceholder: 'you@company.rw',
        failed: 'Could not place your order.',
        codeCopied: 'Tracking code copied',
    },
    // ── Hero illustration ────────────────────────────────────────────
    hero_art: {
        alt: 'Illustration of a shipment moving from Gikondo to Kimironko across the Inzira hub network',
        inTransit: 'In transit',
        sampleShipment: 'Sample shipment',
    },
    misc: {
        closeTour: 'Close the tour',
        reference: 'Reference',
        haveACode: 'Have a code?',
        codePlaceholder: 'INZ-XXXXXXXX',
        enquiryPlaceholder: 'Two pallets a week from Gikondo to Musanze…',
        address: 'Gikondo Industrial Zone',
        cityCountry: 'Kigali, Rwanda',
    },
    // ── Page titles and search descriptions ──────────────────────────
    // Translated too: a French visitor's browser tab and a French search
    // result should not be in English.
    meta: {
        titleOrder: 'Place an order',
        titleTrack: 'Track shipment',
        titlePrivacy: 'Privacy policy',
        titleSupport: 'Support',
        descOrder: 'Book freight across Kigali in under a minute. Pickup, destination and cargo type — no account needed, and a tracking code by text as soon as it is placed.',
        descTrack: 'Enter the code from your confirmation text to see where your Inzira consignment is, which stage it has reached, and who is driving it.',
        descPrivacy: 'What the Inzira website and the Inzira Driver app collect, why, who it is shared with, and how to ask for your own data.',
        descSupport: 'Help with a delivery or the Inzira Driver app — phone, email, and answers to the problems drivers hit most often.',
        descDefault: 'Same-day and bulk freight across Kigali. Book in under a minute with no account, then follow your cargo from pickup to signature with a tracking code.',
    },

    // ── Holding page ─────────────────────────────────────────────────
    // Translated even though the countdown is currently off: it is turned
    // on and off by a switch, and the language should not be the thing
    // that decides whether it can be.
    coming: {
        theWay: 'the way',
        openingPrefix: 'Opening',
        headlineTop: 'Freight across Kigali,',
        headlineBottom: 'with nothing hidden.',
        body:
            'We’re building a freight service where the person who sent the cargo can see ' +
            'exactly where it is, the whole way. Not open to the public yet — leave your ' +
            'number and we’ll tell you the day it is.',
        days: 'Days',
        hours: 'Hours',
        minutes: 'Min',
        seconds: 'Sec',
        opensOn: 'Inzira opens on',
        notifyMe: 'Tell me',
    },

    // ── Server-supplied values ───────────────────────────────────────
    // The cargo list comes from the API and the API validates against it,
    // so the English string is the identifier and must travel back
    // unchanged. Only the label is translated. Keyed by that identifier,
    // and looked up with a fallback to the raw value: a type added on the
    // server should appear in English rather than vanish from the form.
    cargo: {
        'General goods': 'General goods',
        'Retail stock': 'Retail stock',
        'Construction materials': 'Construction materials',
        'Perishables': 'Perishables',
        'Documents': 'Documents',
        'Fragile / high-value': 'Fragile / high-value',
        'Other': 'Other',
    },
    neededBy: {
        today: 'Today',
        tomorrow: 'Tomorrow',
        this_week: 'This week',
        flexible: 'I’m flexible',
    },
    review: {
        collectFrom: 'Collect from',
        deliverTo: 'Deliver to',
        cargo: 'Cargo',
        weight: 'Weight',
        needed: 'Needed',
        contact: 'Contact',
        notes: 'Notes',
    },

    // ── API errors ───────────────────────────────────────────────────
    // Keyed by the server's error code so the wording can be translated.
    // Any code missing here falls back to the server's own message, which
    // is English — readable, if not ideal, and better than a blank.
    errors: {
        NOT_FOUND: 'No shipment found with that code. Check the code from your confirmation text.',
        MISSING_CODE: 'Enter a tracking code.',
        MISSING_FIELDS: 'Please fill in the pickup and delivery addresses and what is being moved.',
        MISSING_LOCATIONS: 'Please give both a pickup and a delivery address.',
        MISSING_CONTACT: 'Please give a name and a phone number so we can reach you.',
        INVALID_CARGO_TYPE: 'Choose a cargo type from the list.',
        INVALID_NEEDED_BY: 'Choose one of the offered times, or leave it blank.',
        INVALID_PHONE: 'That does not look like a Rwandan mobile number.',
        INVALID_WEIGHT: 'Enter the weight in kilograms as a number.',
        ORDER_CREATE_FAILED: 'We could not place your order just now. Please try again.',
        TRACK_FAILED: 'We could not look that up just now. Please try again.',
        CONTACT_FAILED: 'We could not send your message just now. Please try again.',
        TOKEN_COLLISION: 'Something went wrong generating your tracking code. Please try again.',
        UNREADABLE: 'The server sent a response we could not read. Please try again.',
        GENERIC: 'Something went wrong. Please try again.',
    },

    // ── Strings the first sweep missed ───────────────────────────────
    // All multi-line JSX text, which a single-line pattern cannot see.
    // Worth noting rather than quietly fixing: "no matches" from a search
    // is only as trustworthy as the pattern behind it.
    steps: {
        heading: 'Where’s it going?',
        cargo: 'Cargo',
        contact: 'Contact',
        check: 'Check',
        continue: 'Continue',
        keepCode: 'Keep this code.',
        keepCodeBody: 'It’s how you see where your cargo is. A dispatcher is checking the details now and will call you if anything needs confirming.',
        trackItNow: 'Track it now',
        done: 'Done',
        neededByNote: 'This tells the dispatcher how to plan your run. They’ll confirm what’s possible when they call.',
        phoneNote: 'Your tracking code goes to this number, and it’s the number the dispatcher rings if the pickup address needs checking.',
    },
    trackExtra: {
        cancelledNote: 'This shipment was cancelled. Call us if that’s unexpected.',
        photographedAt: 'Photographed at handover',
        onDate: 'on',
        byDriver: 'by',
    },
    comingExtra: {
        thanks: 'Thanks — we’ll text you on the day we open.',
    },

    // ── Buttons whose text lives inside a JSX expression ─────────────
    // A fourth shape the sweeps kept missing: string literals inside a
    // ternary. Three separate patterns were needed before the site was
    // actually clean, which is the real lesson — "no matches" is only ever
    // as good as the pattern behind it.
    buttons: {
        send: 'Send message',
        sending: 'Sending…',
        copyCode: 'Copy code',
        copied: 'Copied',
        cancel: 'Cancel',
        back: '← Back',
        gotIt: 'Got it',
        next: 'Next',
    },
    tour: {
        bookTitle: 'Book from here',
        bookBody: 'Pickup, destination, what you’re sending. It takes a name and a phone number — no account to create.',
        trackTitle: 'Already sent something?',
        trackBody: 'Put the code from your confirmation text in here to see where your cargo has got to.',
    },

    // ── Hero action cards ────────────────────────────────────────────
    entries: {
        bookTitle: 'Book a delivery',
        bookBody: 'Under a minute, no account.',
        trackTitle: 'Track a shipment',
        trackBody: 'See where your cargo is.',
        standingTitle: 'Standing routes',
        standingBody: 'Regular lanes, priced per business.',
    },
    nav_mobile: {
        open: 'Open menu',
        close: 'Close menu',
    },
    journeyExtra: {
        stopLabel: 'Stop',
    },
    backToTop: {
        label: 'Back to top',
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
