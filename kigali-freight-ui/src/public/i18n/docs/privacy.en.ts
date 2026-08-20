// The privacy policy, as a document.
//
// Structured rather than free prose so a translation keeps the same
// sections in the same order — a policy whose clauses move around between
// languages is one nobody can point at in a conversation.
//
// The English is authoritative. A translated policy is still a legal
// document, and stating which version governs is standard practice rather
// than a hedge; the French carries that line explicitly.
export const privacyEn = {
    eyebrow: 'Legal',
    title: 'Privacy policy',
    updatedPrefix: 'Last updated',
    updated: '17 August 2026',
    governingNote: '',
    intro:
        'Inzira moves freight around Kigali. This policy covers both the website you are ' +
        'reading and the Inzira Driver mobile app used by our drivers. The two collect ' +
        'different things from different people, so they are described separately.',
    driverApp: {
        title: 'The driver app',
        intro:
            'Inzira Driver is a work tool, issued to drivers who carry freight for us. ' +
            'Accounts are created by our dispatch team — there is no public sign-up — and ' +
            'the app collects the following while it is in use.',
        sharedWithLabel: 'Shared with:',
        rows: [
            { what: 'Location', why: 'Latitude, longitude and speed, so dispatch can see where a consignment is and tell the customer who is waiting for it. Collected only between the moment a driver starts a shift and the moment they end it, including while the app is in the background or the phone is locked, because a delivery does not pause when a driver pockets their phone. Ending a shift or signing out stops collection immediately.', shared: 'our dispatch team only' },
            { what: 'Identity', why: 'Name and phone number, which is also the sign-in username. A PIN is stored only as a one-way hash and cannot be read back by anyone, including us.', shared: 'our dispatch team only' },
            { what: 'Compliance documents', why: 'Photographs of the licences, insurance and roadworthiness certificates a driver is legally required to hold, reviewed by an administrator before that driver can be given cargo.', shared: 'our compliance reviewers only' },
            { what: 'Delivery photographs', why: 'A photograph taken at the point of handover as proof of delivery, attached to the consignment it belongs to.', shared: 'our dispatch team, and the customer for their own consignment' },
            { what: 'Diagnostics', why: 'Crash reports and error traces, so faults can be found and fixed.', shared: 'Sentry, our error-monitoring provider' },
        ],
        biometricsStrong: 'Face ID, Touch ID and fingerprint unlock never leave the phone.',
        biometricsRest:
            ' The app asks the device to confirm it is you and receives only a yes or no. ' +
            'No biometric data is transmitted to us, and none is stored on our systems.',
        closing:
            'Location is not collected when a driver is off shift, and it is never sold, ' +
            'never used for advertising, and never shared with anyone outside the dispatch ' +
            'team who is coordinating that driver’s work.',
    },
    customers: {
        title: 'If you book a delivery',
        body:
            'Booking through this website asks for your name, a phone number, optionally an ' +
            'email address, and the pickup and delivery addresses. We use them to carry out ' +
            'the delivery and to reach you about it — the tracking code we send by text, and ' +
            'a call if the driver cannot find the address.',
        body2:
            'Anyone holding the tracking code can see that consignment’s progress and the ' +
            'name of its driver. The code is the key, so treat it as you would any other ' +
            'reference for something being delivered to you.',
    },
    retention: {
        title: 'How long we keep it',
        body:
            'Consignment records, including delivery photographs, are kept while they may ' +
            'still be needed to settle a query or a claim about that delivery. Driver ' +
            'location history is operational data and is deleted automatically after 90 ' +
            'days, which is long enough to review a disputed delivery or investigate an ' +
            'incident weeks after it happened.',
    },
    rights: {
        title: 'Your choices',
        body:
            'You can ask us what we hold about you, ask for it to be corrected, or ask for ' +
            'it to be deleted, and we will do so unless we are required to keep it — an ' +
            'example being the compliance documents a licensed carrier has to retain.',
        body2:
            'Drivers can revoke location access at any time in the phone’s own settings. ' +
            'Doing so stops collection, and it also stops dispatch being able to allocate ' +
            'work reliably, so it is worth a conversation with the office first.',
    },
    contact: {
        title: 'Contact',
        bodyBefore: 'Questions about this policy, or a request to see, correct or delete your own data, can be sent to ',
        bodyMiddle: ' or ',
        bodyAfter: '.',
        postal: 'By post: Inzira, Gikondo Industrial Zone, Kigali, Rwanda. Drivers can also raise anything about their own data directly with dispatch. Our ',
        supportLink: 'support page',
        postalAfter: ' covers everything else.',
    },
} as const;

// Widened so a translation can differ in wording while matching in shape.
type Widen<T> = T extends string ? string
    : T extends readonly (infer E)[] ? readonly Widen<E>[]
    : { [K in keyof T]: Widen<T[K]> };
export type PrivacyDoc = Widen<typeof privacyEn>;
