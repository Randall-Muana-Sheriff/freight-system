// All landing-page copy in one file, so it can be reviewed and edited as
// writing rather than hunted for inside JSX.
//
// Every factual claim here is one the system actually backs. Where a line
// describes a capability, that capability exists in the codebase — the
// five driver documents are REQUIRED_DOCUMENT_TYPES in
// driverVerificationService.js, the five pre-departure checks are
// SAFETY_CHECKLIST_ITEMS in safetyChecklistController.js, the hubs are the
// three bin/migrate.js seeds, proof-of-delivery photos and the offline
// queue are real driver-app features.
//
// Nothing here asserts a delivery count, an on-time percentage, a founding
// year, a named employee or a customer quote. Those are the claims a buyer
// actually decides on and none of them can be checked from the code, so
// they are for the business to supply rather than for this file to invent.

export const HERO = {
    eyebrow: 'Freight across Kigali',
    headline: ['Know where', 'your cargo is.'],
    body:
        'Most freight goes quiet the moment it leaves your gate. Ours doesn’t — every ' +
        'consignment carries a code that shows you its position until somebody signs for it.',
};

// Three claims, each pointing at a real mechanism rather than an adjective.
export const PROOF = [
    {
        stat: 'Every 15 seconds',
        label: 'Position updates',
        body: 'Our drivers’ vehicles report while the job is live — not when someone remembers to check in.',
    },
    {
        stat: 'Five documents',
        label: 'Before a driver works',
        body: 'ID, licence, vehicle registration, insurance and roadworthiness. No papers, no jobs.',
    },
    {
        stat: 'Photo on arrival',
        label: 'Proof of delivery',
        body: 'Timestamped at the door and attached to your consignment, so “it was delivered” is never just a claim.',
    },
];

export const SERVICES = {
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
};

export const JOURNEY = {
    eyebrow: 'Start to finish',
    headline: 'What happens to your cargo.',
    stops: [
        { name: 'You place the order', body: 'Pickup, destination, what it is. No account, no phone call, no waiting on a quote before you can book.' },
        { name: 'A dispatcher confirms it', body: 'A person checks the addresses and rings you if anything is unclear. Nothing reaches a driver unchecked.' },
        { name: 'A driver takes it', body: 'The nearest verified driver on shift, with your cargo on their manifest and their vehicle on our map.' },
        { name: 'You watch it move', body: 'Your code shows where the cargo is, not just that it left. Refresh it as often as you like.' },
        { name: 'Signed and photographed', body: 'Proof captured at the door and timestamped, so the delivery is on record and not just remembered.' },
    ],
};

export const SAFETY = {
    eyebrow: 'Before the wheels turn',
    headline: 'Nothing leaves unchecked.',
    body:
        'The cheapest way to run freight is to hand the keys to whoever is available. ' +
        'We do the slower thing, because the cargo is yours and not ours.',
    columns: [
        {
            title: 'The driver is verified',
            body: 'Five documents on file before a single job — national ID, driving licence, vehicle registration, insurance certificate and roadworthiness certificate. The system will not let an unverified driver be assigned your consignment.',
        },
        {
            title: 'The vehicle is checked',
            body: 'Seatbelt, mirrors and lights, tyre condition and pressure, cargo secured, and the driver confirming they are rested and fit to drive. Five checks, recorded against the day, before the shift starts.',
        },
        {
            title: 'We see it go off course',
            body: 'Delivery areas are fenced on our map. If a vehicle carrying your cargo leaves where it should be, dispatch is alerted while it is happening rather than after you ring to ask.',
        },
        {
            title: 'Problems get reported, not buried',
            body: 'Breakdowns, accidents and damage are logged by the driver from the roadside with a photo, and reach dispatch immediately. You hear it from us first.',
        },
    ],
};

export const DELIVERY = {
    eyebrow: 'At the door',
    headline: 'Proof, not a phone call.',
    body:
        'A delivery is finished when there is a record of it. Our drivers photograph the ' +
        'handover on arrival and the photo is timestamped and attached to your consignment. ' +
        'If the driver is somewhere with no signal — and parts of this city are — the ' +
        'confirmation is held on the phone and uploaded the moment the connection returns. ' +
        'It is never lost and never quietly skipped.',
};

export const BUSINESS = {
    eyebrow: 'For businesses',
    headline: 'Stop booking the same job every morning.',
    body:
        'If you move goods on a rhythm — stock to a shop, parts to a site, documents ' +
        'between offices — a standing route costs less than booking each drop, and your ' +
        'team stops spending mornings on the phone.',
    points: [
        { title: 'A named dispatcher', body: 'One person who knows your lanes, your access codes and who to ring at your end.' },
        { title: 'Priority when it matters', body: 'Urgent consignments are flagged in our queue and picked up before routine work.' },
        { title: 'Quoted per business', body: 'Standing lanes are priced on volume and distance, not off a public rate card.' },
    ],
};

export const COVERAGE = {
    eyebrow: 'Where we run',
    headline: 'Three hubs, one city.',
    body:
        'Cargo can be dropped at any hub and collected from any other, which is usually ' +
        'faster and cheaper than a door-to-door run across town.',
    hubs: [
        { name: 'Nyabugogo', role: 'Central bus and logistics hub', note: 'The northern gateway, and where most inbound freight lands.' },
        { name: 'Kimironko', role: 'Commercial market hub', note: 'Retail stock and market traders in the north-east.' },
        { name: 'Gikondo', role: 'Industrial warehousing hub', note: 'Bulk, industrial and palletised cargo in the south.' },
    ],
};

export const FAQ = {
    eyebrow: 'Before you book',
    headline: 'Questions people ask.',
    items: [
        {
            q: 'What does it cost?',
            a: 'We quote per job. An envelope across town and two pallets to a building site are not the same work, and a public rate card would be wrong for both. Place the order or send us a message and a dispatcher comes back with a number before anything moves.',
        },
        {
            q: 'Do I need an account?',
            a: 'No. Your first order needs a name and a phone number, nothing else. You track it with the code we text you.',
        },
        {
            q: 'How do I know where my cargo is?',
            a: 'Every order gets a tracking code. Enter it on this site and you see the current stage, the pickup and delivery addresses, and the driver’s first name once one is assigned. No login.',
        },
        {
            q: 'What if I lose the code?',
            a: 'Ring us with the phone number you booked on and we will find the consignment. The code is the fast way, not the only way.',
        },
        {
            q: 'How quickly does a driver get assigned?',
            a: 'A dispatcher reviews every order before it reaches a driver, so it depends on how clear the addresses are and what is on the road. If something about your booking is unclear, you get a phone call rather than a delay you never hear about.',
        },
        {
            q: 'Can you handle fragile or high-value cargo?',
            a: 'Yes. Say so in the instructions when you book, and ask about secure transport for anything that needs sealing and a verified handover.',
        },
    ],
};

export const ABOUT = {
    eyebrow: 'Why we built this',
    headline: 'Freight here runs on phone calls.',
    body: [
        'You send goods across Kigali and then you start ringing. You ring the office, ' +
        'the office rings the driver, the driver does not pick up because he is driving. ' +
        'An hour later you know roughly where your cargo was an hour ago.',
        'We built the tracking first and the freight company around it. Every vehicle ' +
        'reports its position while it is working, every delivery is photographed, and ' +
        'the person who sent the goods can see all of it without asking anyone. That is ' +
        'the whole product. The rest is doing the driving properly.',
    ],
};

export const CONTACT = {
    eyebrow: 'Talk to us',
    headline: 'Moving something regularly?',
    body:
        'Standing routes and bulk lanes are priced per business rather than per drop. ' +
        'Tell us the shape of it and we will come back with a number.',
    address: 'Gikondo Industrial Zone · Kigali',
};
