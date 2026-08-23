// The support page, as a document rather than as scattered strings.
//
// Long-form pages live here instead of in en.ts so the interface
// dictionary stays about the interface, and so whoever translates this
// reads a whole document in order — which is the only way support
// writing, where one answer refers to the screen described in another,
// can be checked for sense.
export const supportEn = {
    eyebrow: 'Help',
    title: 'Support',
    intro:
        'Something wrong with a delivery, or with the Inzira Driver app? Reach us ' +
        'directly. The phone is answered from six in the morning until ten at night, ' +
        'every day of the week, and if cargo is on a truck right now, call rather ' +
        'than write.',
    phoneLabel: 'Phone',
    emailLabel: 'Email',
    // The page told drivers the phone was faster "during working hours"
    // without ever saying which ones. A driver loading at half five wants
    // to know whether ringing is worth it before the truck is loaded, not
    // after.
    phoneHours: '6:00 – 22:00, every day',
    emailHours: 'Answered within a working day',
    drivers: {
        title: 'Drivers',
        intro:
            'Accounts are created by dispatch. There is no sign-up in the app. If your ' +
            'number is not recognised, it has not been registered yet, and dispatch can ' +
            'do that in a moment.',
        answers: [
            {
                problem: 'The verification code never arrives',
                body:
                    'Codes are sent by text and can take a minute on a busy network. Check the ' +
                    'number you typed is the one dispatch registered, then request a new code. ' +
                    'If nothing comes through twice, call us and we will read one to you.',
            },
            {
                problem: 'I have forgotten my PIN',
                body:
                    'Call dispatch. They can reset it, and the app will walk you through ' +
                    'choosing a new one the next time you sign in.',
            },
            {
                problem: 'Dispatch says they cannot see where I am',
                body:
                    'Location only reports while a shift is active, so check the home screen ' +
                    'says you are on shift. If it does, open your phone’s settings for Inzira ' +
                    'Driver and make sure location permission is set to Always. “While Using” ' +
                    'stops reporting the moment the screen locks, which is most of a driving day.',
            },
            {
                problem: 'I cannot upload a delivery photo',
                body:
                    'The photo needs a data connection to reach the office. In a weak-signal ' +
                    'spot, complete the stop when you are moving again. The job stays on your ' +
                    'list until it goes through.',
            },
            {
                problem: 'The app says my documents need attention',
                body:
                    'One of your licences, insurance or roadworthiness certificates is missing, ' +
                    'rejected or expired, and work cannot be assigned until it is approved. The ' +
                    'Profile screen shows which one. Photograph the document again in good light ' +
                    'and re-upload it.',
            },
        ],
    },
    customers: {
        title: 'Customers',
        bodyBefore: 'If you are waiting on a consignment, the tracking code from your confirmation text shows where it has reached on our ',
        trackingLink: 'tracking page',
        bodyAfter: '. If the code does not work, or the delivery is late, call the number above with the code to hand.',
    },
    data: {
        title: 'Your data',
        bodyBefore: 'What we collect, why, and how to ask for a copy or deletion is set out in our ',
        privacyLink: 'privacy policy',
        bodyAfter: '.',
    },
} as const;

// Widened so a translation can differ in wording while matching in shape.
type Widen<T> = T extends string ? string
    : T extends readonly (infer E)[] ? readonly Widen<E>[]
    : { [K in keyof T]: Widen<T[K]> };
export type SupportDoc = Widen<typeof supportEn>;
