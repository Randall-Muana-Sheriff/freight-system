// Every string on the customer site, in one place.
//
// This began as the interface only, with the landing-page prose kept in a
// separate content.ts on the argument that rendering writing like "Most
// freight goes quiet the moment it leaves your gate" into Kinyarwanda is a
// copywriting job in Kinyarwanda rather than a translation job. That file
// is gone: the split meant editorial copy could not be translated at all,
// and French is now complete. The argument still holds for Kinyarwanda,
// which is why rw.ts is allowed to be partial — those sections fall back
// to English until a Kinyarwanda speaker writes them properly, rather than
// being rendered literally and reading as flat as that sounds.
//
// English is the source of truth for the *shape*: rw.ts is typed against
// it, so a key that exists here and nowhere else is caught at build time
// rather than showing up as a blank on someone's phone.

export const en = {
    nav: {
        // Two of these name a category and the rest name a section inside
        // one. Both live here because both are navigation, and the menu
        // cannot be assembled from one file and translated from another.
        whatWeDo: 'What we do',
        howItWorks: 'How it works',
        talkToUs: 'Talk to us',

        whatWeMove: 'What we move',
        pricing: 'Pricing',
        forBusiness: 'For business',
        theJourney: 'What happens to your cargo',
        theSystem: 'The system',
        questions: 'Common questions',
        home: 'Inzira home',
    },
    // The line under each item in the menu. Kept out of `nav` on purpose:
    // nav is interface and rw.ts is required to carry it in full, while
    // these are six short pieces of writing that want a Kinyarwanda writer
    // rather than a literal rendering. Absent from rw.ts they fall back to
    // English, which is the same bargain the rest of the prose makes.
    nav_desc: {
        whatWeMove: 'From an envelope to a full load',
        pricing: 'The rate card, published in full',
        forBusiness: 'Standing routes and bulk lanes',
        theJourney: 'Booking to signature, one step at a time',
        theSystem: 'What driver, dispatcher and you each see',
        questions: 'Liability, payment, what we carry',
    },
    actions: {
        book: 'Book a delivery',
        track: 'Track a shipment',
        trackSubmit: 'Track',
        looking: 'Looking…',
        placing: 'Placing…',
        placeOrder: 'Place the booking',
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
        finding: 'Finding your shipment',
        // Arriving here without a code — from the nav rather than from a
        // confirmation text — previously gave a heading, a field and nothing
        // else. This says where the code comes from and offers the way on.
        idleTitle: 'The code is in your confirmation text.',
        idleBody: 'It looks like INZ-XXXXXXXX and arrives by SMS the moment a booking is placed. No account, and nothing to sign in to.',
        idleNoCode: 'Not booked anything yet?',
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
            received: 'Booking received',
            receivedNote: 'With a dispatcher for checking.',
            assigned: 'Driver assigned',
            assignedNote: 'On a driver’s manifest.',
            collected: 'Collected',
            collectedNote: 'Cargo is on the vehicle.',
            delivered: 'Delivered',
            deliveredNote: 'Signed for, with proof captured.',
        },
    },
    form: {
        name: 'Name',
        phone: 'Phone',
        emailOptional: 'Email (optional)',
        whatMoved: 'What do you need moved?',
        messageReceived: 'Message received.',
        weAnswer: 'We answer on the number you gave us, usually the same day.',
    },
    footer: {
        getMoving: 'Get moving',
        company: 'Company',
        questions: 'Common questions',
        tagline: 'Freight across Kigali and the rest of Rwanda, with the position of every shipment visible to the person who sent it.',
    },

    // ── Landing-page copy ────────────────────────────────────────────
    // Editorial copy, translated rather than siloed. Arrays are
    // translated whole rather than element by element: a half-translated
    // list of services would read as an error, and "all six or none" is
    // also the natural unit for whoever is doing the writing.
    hero: {
        // What the company does, said once. The page previously led with
        // "Track your cargo", which speaks to somebody already holding a code
        // and tells a first-time visitor nothing about the business.
        headline: 'Freight across Kigali, visible the whole way',
        // The headline names the city because that is the identity; the
        // lead is where the rest of the country gets said. The rate card
        // has priced long runs since August and the site claimed Kigali
        // only, which undersold the service to every reader who needed a
        // load moved further than that.
        lead:
            'Same-day delivery across the city, and full loads anywhere in Rwanda. Book in '
            + 'under a minute without an account, then follow the cargo from pickup to signature.',
        trackPrompt: 'Track your cargo',
    },
    services: {
        eyebrow: 'What we move',
        headline: 'Six ways to get it there',
        items: [
            { name: 'Same-day delivery', spec: 'Up to 1 t \u00b7 Kigali', body: 'Booked before noon, on the road within the hour and tracked the whole way. The van fleet reaches every district in the city.' },
            { name: 'Bulk freight', spec: '1 \u2013 12 t \u00b7 nationwide', body: 'Palletised and loose loads in trucks and haulers, with drivers who load and secure the cargo themselves rather than watching you do it.' },
            { name: 'Secure transport', spec: 'Sealed \u00b7 incident-reported', body: 'High-value cargo under tamper-evident seal, photographed at both ends, with a written incident report if a seal is broken in between.' },
            { name: 'Scheduled routes', spec: 'Set once \u00b7 runs daily', body: 'A standing lane between two fixed points, priced per lane rather than per drop, so you stop booking the same job every morning.' },
            { name: 'Hub-to-hub', spec: 'Nyabugogo \u00b7 Kimironko \u00b7 Gikondo', body: 'Leave cargo at any of our three hubs and we move it to the destination hub. It is the cheapest way to send something that is not urgent.' },
            { name: 'Document courier', spec: 'Signature on arrival', body: 'Contracts and certificates moved same-day, with a timestamped chain of custody you can put in front of a client.' },
        ],
    },
    // ── Pricing ─────────────────────────────────────────────────
    // Published on purpose, and unusually for this market. Freight in Kigali
    // is priced over the phone, which means the number depends on who is
    // asking and how hard they push. Putting the card on the page is the same
    // promise the tracking code makes: what you are told does not change
    // depending on who is telling you.
    //
    // Every figure mirrors the live card in pricing_rates, and the three
    // worked examples were quoted through the real /quote endpoint rather
    // than worked out by hand — 25,733 / 57,893 / 231,410, rounded here to
    // the nearest hundred. A published price that has quietly gone stale is
    // worse than publishing nothing, so if that card moves this moves with it.
    pricing: {
        eyebrow: 'What it costs',
        headline: 'Our rate card, in public',
        intro:
            'Freight here is normally priced over the phone, which means the number depends on '
            + 'who is asking. Ours does not. Every quote we give is built from this card: a base '
            + 'fare, the road distance, the weight, and a floor under the short jobs.',
        columns: {
            vehicle: 'Vehicle',
            payload: 'Payload',
            base: 'Base',
            perKm: 'Per km',
            perKg: 'Per kg',
            minimum: 'Minimum',
        },
        rows: [
            { vehicle: 'Light van', payload: 'Up to 1 t', base: '8,000', perKm: '700', perKg: '8', minimum: '15,000' },
            { vehicle: 'Medium truck', payload: '1 \u2013 8 t', base: '18,000', perKm: '900', perKg: '6', minimum: '40,000' },
            { vehicle: 'Heavy hauler', payload: '8 \u2013 12 t', base: '60,000', perKm: '1,500', perKg: '3.5', minimum: '120,000' },
        ],
        unitNote: 'All figures in RWF. We choose the vehicle from the weight you give, so you do not need to know which one the job takes.',
        examplesTitle: 'What that comes to',
        examples: [
            { job: '400 kg, Nyabugogo to Kimironko', detail: '15 km by road', price: '25,700' },
            { job: '3 tonnes, ten kilometres across the city', detail: '16 km by road', price: '57,900' },
            { job: '4 tonnes, Kigali to Rubavu', detail: '157 km by road', price: '231,400' },
        ],
        notesTitle: 'What moves the number',
        notes: [
            { title: 'Distance is measured by road', body: 'Not in a straight line across the map. Runs beyond 25 km drop to a lower rate for the remainder, because a highway kilometre does not cost what a city one does.' },
            { title: 'The first hour of waiting is free', body: 'After that, loading and unloading time is charged by the hour: 3,800 RWF for a van, 8,500 for a truck, 19,400 for a hauler. A normal handover never reaches it.' },
            { title: 'Heavier and further, by arrangement', body: 'Loads above 12 tonnes, and anything crossing a border, are priced by hand rather than from this card. Tell us what it is and we will come back with a number.' },
        ],
        closing:
            'These are worked examples rather than a quote. The booking form prices your actual job '
            + 'before you commit to anything, and a dispatcher confirms it once the pickup and '
            + 'drop-off are pinned.',
        cta: 'Get a quote',
    },
    // ── The hub ──────────────────────────────────────────────────────
    // The landing page stopped being the whole site. Pricing, the business
    // track, the walkthrough and the questions each got their own page,
    // because eight sections on one page is a scroll nobody finishes and
    // it is not how a carrier this size is read — DHL's home page is a
    // handful of teasers pointing at pages, not the pages themselves.
    //
    // These are the doors. The order of the list is the order of the paths
    // in Landing.tsx and the two have to stay in step; a test checks the
    // lengths agree, which is the part that would otherwise rot silently.
    explore: {
        eyebrow: 'Go deeper',
        headline: 'The rest of it',
        items: [
            { title: 'Pricing', body: 'The whole rate card: base fare, per kilometre, per kilogram, plus three real jobs priced end to end.', cta: 'See what it costs' },
            { title: 'For business', body: 'Standing routes and bulk lanes, rated per lane rather than per drop, on one account.', cta: 'Standing routes' },
            { title: 'How it works', body: 'Booking to signature step by step, and what the driver, the dispatcher and you each see.', cta: 'Start to finish' },
            { title: 'Common questions', body: 'Liability, payment, collection times, and what we will not carry.', cta: 'Read the answers' },
        ],
    },
    journey: {
        eyebrow: 'Start to finish',
        headline: 'What happens to your cargo',
        stops: [
            { name: 'You book it', body: 'Pickup, destination, what it is. No account, no phone call, and a price before you commit to anything, up to twelve tonnes. Heavier than that we quote by hand.' },
            { name: 'A dispatcher takes it on', body: 'Every booking is put on a driver by a person, who rings you if anything is unclear. Nothing here dispatches itself. No cargo reaches a driver because a machine decided it should.' },
            { name: 'A driver takes it', body: 'A verified driver, chosen from the closest ones free. Their licence and their vehicle’s insurance have to be approved and still in date, or the system will not let your cargo onto their manifest at all.' },
            { name: 'You follow it', body: 'Your code shows the stage your cargo has reached: received, assigned, collected, delivered. It also gives the first name of the driver carrying it. Refresh it as often as you like.' },
            { name: 'Signed for at the door', body: 'Proof captured at handover and timestamped, either a photograph or a code read back by whoever received it. Either way the delivery is on record rather than remembered.' },
        ],
    },
    about: {
        eyebrow: 'The system',
        headline: 'Everyone is looking at the same record',
        intro:
            'Most freight runs on a phone and a notebook, so what you get told depends on who ' +
            'you ask and when they last checked. Inzira is one system instead. The driver\u2019s ' +
            'phone, the dispatcher\u2019s screen and your tracking page are three views of the same ' +
            'shipment, and they update together.',
        views: [
            { title: 'What you see', body: 'Book with a name and a number. No account. You get a code that shows the stage your cargo is at, where it was collected from and where it is going, the driver\u2019s first name once one is assigned, and the proof taken at handover, either a photograph or a code read back by whoever received it.' },
            { title: 'What the driver carries', body: 'An app holding only their own jobs. It reports the vehicle\u2019s position while the shift is running, takes the proof at the door, and reports breakdowns and damage from the roadside. In a signal-dead corner of the city it holds the confirmation until the connection returns. It also moves the photograph out of the camera\u2019s scratch space into its own storage first, so the phone cannot quietly bin your proof of delivery while it waits.' },
            { title: 'What dispatch watches', body: 'Every working vehicle on one live map, with restricted zones and speed limits that raise an alert the moment a vehicle enters one or drives too fast for the road. Orders are assigned by a person, and the job is offered to one named driver the system has ranked as closest. It is never broadcast to whoever answers first.' },
        ],
        closing:
            'None of that is visible from the outside, which is the point. It is why the code ' +
            'we text you can be trusted to say something true.',
    },
    // ── For business ──────────────────────────────────────────
    // The section the site did not have. 'Standing routes — priced per
    // business' has sat on a hero card since launch with nowhere to land: a
    // logistics manager who clicked it arrived at a general contact form and
    // a paragraph. Everything on the site until now addressed one
    // undifferentiated reader, which is the gap between this and how DHL or
    // Uber Freight organise the same offer.
    business: {
        eyebrow: 'For business',
        headline: 'Freight you do not have to book every morning',
        intro:
            'A one-off delivery works from the form above. Moving the same thing along the same '
            + 'road every week is a different arrangement, and it should not be priced as though '
            + 'a stranger rang once.',
        offers: [
            { name: 'Standing routes', body: 'A lane between two fixed points running to a schedule you set. Agreed once, then it simply happens, and it is rated against the volume rather than the drop.' },
            { name: 'Bulk lanes', body: 'Regular full-vehicle movements, including the runs out of Kigali. Priced per lane once we know the weight, the frequency and the road.' },
            { name: 'One account, one record', body: 'Every shipment on the account in one place rather than scattered across driver receipts, each with its tracking code and proof-of-delivery photograph attached to the line it belongs to. Payment stays per delivery by mobile money for now.' },
        ],
        closing:
            'Tell us the shape of it: what moves, how often, and between where. We will come back '
            + 'with a rate for the lane.',
        cta: 'Talk to us about a lane',
    },
    // ── Before you book ─────────────────────────────────────────
    // The objections that stop a booking, answered where they are being
    // had rather than on the support page — which is written for drivers
    // mid-shift and is not where someone deciding whether to trust us
    // will ever look.
    //
    // The first answer is the one that matters and the one most freight
    // sites fudge. We are not an insurer and saying so plainly is worth
    // more than an implication that we might be: a sender who finds out
    // after a loss is a sender we have lied to. What we do carry is
    // evidence, so the answer says exactly that instead of apologising.
    faq: {
        eyebrow: 'Before you book',
        headline: 'The questions worth asking first',
        items: [
            {
                q: 'What happens if my cargo is damaged or lost?',
                a: 'We are a haulier, not an insurer, and we do not cover the value of what we carry. Cargo insurance is the sender\u2019s to arrange, and for anything high-value you should. What we are responsible for is evidence: a photograph at handover, a tamper-evident seal on secure jobs, and a written incident report filed from the roadside rather than remembered later. If something goes wrong you will know what happened, when, and who was carrying it.',
            },
            {
                // The best trust claim on the site, and it went unsaid for
                // months. It is worth more than the ones around it because
                // it is a gate in the code rather than a promise about
                // process: isDriverVerified requires every document to be
                // approved AND unexpired, for the driver and for the vehicle
                // they are driving, and assignment refuses without it.
                q: 'Who is driving my cargo?',
                a: 'A driver whose licence and identity we have checked, in a vehicle whose insurance and roadworthiness we have checked. That is not a promise about our hiring. It is a gate in the system. If an insurance certificate lapses overnight, the next morning the system simply refuses to put cargo on that driver until it is renewed, and it warns us three weeks before anything is due to expire so it rarely gets that far.',
            },
            {
                q: 'How do I pay?',
                a: 'Mobile money, per delivery, once a dispatcher has confirmed the price. There is no card to enter and nothing to set up in advance.',
            },
            {
                q: 'Do I need an account?',
                a: 'No. A name and a phone number is the whole of it. The tracking code arrives by text and is all you need to follow the cargo. There is nothing to sign into and no password to lose.',
            },
            {
                q: 'How firm is the price I am shown?',
                a: 'The figure on the booking form is worked from the weight alone until the pickup and drop-off are pinned on the map, at which point it is calculated from the real road distance. A dispatcher confirms it before anything moves. Waiting time is the only thing that can be added afterwards, and only past the free first hour.',
            },
            {
                q: 'Is there anything you will not carry?',
                a: 'The booking form lists the cargo types we handle. If what you are sending is not one of them, ask before you book rather than after. It is a short conversation and it is better had at the start.',
            },
            {
                q: 'How soon will it be collected?',
                a: 'You can book at any hour. The booking side of this never closes. Same-day work placed before noon is normally on the road within the hour. Anything later, or a full load leaving the city, is planned with you when the dispatcher rings to confirm, and that call comes between six in the morning and ten at night.',
            },
        ],
        closing: 'Anything not answered here, just ask. The phone is answered from six in the morning until ten at night, every day.',
    },
    contact: {
        eyebrow: 'Talk to us',
        headline: 'Tell us what you move',
        body:
            'A lane to price, a load our rate card does not cover, or a question before you ' +
            'book. This reaches a person rather than a queue, and we answer the same working day.',
        address: 'Gikondo Industrial Zone \u00b7 Kigali',
        // Three layers rather than one line, because they genuinely are
        // three and collapsing them would mean publishing the narrowest.
        // The platform never closes; a phone answered at six in the morning
        // is not the same promise as an account manager at their desk, and
        // a shipper who rings at eight on a Sunday should know which of the
        // three they are getting before they dial.
        hoursTitle: 'When we are open',
        hours: [
            { label: 'Booking and tracking', time: 'Every hour, every day', note: 'The site takes bookings, finds the driver and shows you how far along your cargo is, at any hour of any day of the year. Nothing here keeps office hours.' },
            { label: 'Support', time: '6:00 \u2013 22:00, daily', note: 'A person on the phone, from the first loading of the morning to the last delivery running late.' },
            { label: 'Business accounts', time: 'Monday to Friday, 8:00 \u2013 17:00', note: 'Standing routes, bulk lanes and anything settled on account.' },
        ],
    },

    // ── Booking form ─────────────────────────────────────────────────
    order: {
        waitingNotice: 'If loading or unloading keeps the driver longer than {minutes} minutes, the extra time is charged at {rate} RWF an hour. Nothing is added for a normal handover.',
        detention: 'Waiting time',
        price: 'Price',
        priceEstimate: 'Estimated price',
        estimateNote: 'An estimate from the weight alone. We confirm it once we have the pickup and drop-off pinned.',
        priceQuoting: 'Working it out…',
        eyebrow: 'Booking · no account needed',
        received: 'Booking received',
        collectFrom: 'Collect from',
        collectPlaceholder: 'Gikondo Industrial Zone, gate 3',
        deliverTo: 'Deliver to',
        deliverPlaceholder: 'Kimironko Market, shop 14',
        whatIsIt: 'What is it',
        choose: 'Choose…',
        weight: 'Weight in kg',
        weightPlaceholder: '150',
        neededBy: 'When do you need it? (optional)',
        instructions: 'Anything the driver should know (optional)',
        instructionsPlaceholder: 'Fragile. Ask for Claudine at the gate.',
        yourName: 'Your name',
        namePlaceholder: 'Jean Mutabazi',
        phonePlaceholder: '0788 000 000',
        emailPlaceholder: 'you@company.rw',
        failed: 'Could not place your booking.',
        codeCopied: 'Tracking code copied',
    },
    // ── Hero illustration ────────────────────────────────────────────
    hero_art: {
        alt: 'Illustration of a shipment moving from Gikondo to Kimironko across the Inzira hub network',
        inTransit: 'In transit',
        sampleShipment: 'Sample shipment',
        // Interpolated rather than concatenated, because word order around a
        // number is not the same in every language.
        kmToRun: '{km} km to run',
        eta: 'ETA {minutes} min',
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
        titleOrder: 'Book a delivery',
        titleTrack: 'Track shipment',
        titlePrivacy: 'Privacy policy',
        titleSupport: 'Support',
        titlePricing: 'Pricing',
        titleHow: 'How it works',
        titleBusiness: 'For business',
        titleFaq: 'Common questions',
        descOrder: 'Book freight across Kigali and nationwide in under a minute. Pickup, destination and cargo type. Priced from a published rate card, no account needed, and a tracking code by text as soon as it is placed.',
        descTrack: 'Enter the code from your confirmation text to see which stage your Inzira shipment has reached, who is driving it, and the photograph taken at handover.',
        descPrivacy: 'What the Inzira website and the Inzira Driver app collect, why, who it is shared with, and how to ask for your own data.',
        descSupport: 'Help with a delivery or the Inzira Driver app. Phone, email, and answers to the problems drivers hit most often.',
        descPricing: 'What freight costs in Kigali and across Rwanda, published in full: base fare, per kilometre and per kilogram for vans, trucks and haulers, with worked examples.',
        descHow: 'What happens to your cargo from the moment you book to the signature at the door, and what the driver, the dispatcher and you each see while it moves.',
        descBusiness: 'Standing routes and bulk lanes for businesses moving freight regularly across Kigali and Rwanda, rated per lane rather than per delivery.',
        descFaq: 'Liability, payment, collection times and what we will not carry. The questions worth asking before you book freight with Inzira.',
        descDefault: 'Same-day and bulk freight across Kigali and the rest of Rwanda, with the rate card published. Book in under a minute with no account, then follow your cargo from pickup to signature with a tracking code.',
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
            'We’re building a freight service where the person who sent the cargo can follow ' +
            'it the whole way. Not open to the public yet. Leave your ' +
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
        WEIGHT_NEEDS_QUOTE: 'That load is heavier than we can price online. Tell us about it and we will come back with a number.',
        ORDER_CREATE_FAILED: 'We could not place your booking just now. Please try again.',
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
        heading: 'What are we moving?',
        cargo: 'Cargo',
        contact: 'Contact',
        check: 'Check',
        continue: 'Continue',
        keepCode: 'Keep this code.',
        keepCodeBody: 'It’s how you follow your cargo’s progress. A dispatcher is checking the details now and will call you if anything needs confirming.',
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
        thanks: 'Thanks. We’ll text you on the day we open.',
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
        bookBody: 'Pickup, destination, what you’re sending. It takes a name and a phone number, and there is no account to create.',
        trackTitle: 'Already sent something?',
        trackBody: 'Put the code from your confirmation text in here to see where your cargo has got to.',
    },

    // ── Hero action cards ────────────────────────────────────────────
    entries: {
        bookTitle: 'Book a delivery',
        bookBody: 'Under a minute, no account.',
        trackTitle: 'Track a shipment',
        trackBody: 'See the stage it has reached.',
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
