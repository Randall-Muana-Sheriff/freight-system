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
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Strings = Widen<typeof en>;
