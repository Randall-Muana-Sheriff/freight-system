// All landing-page copy in one file, so it can be reviewed and edited as
// writing rather than hunted for inside JSX.
//
// Every factual claim here is one the system actually backs, and nothing
// asserts a delivery count, an on-time percentage, a founding year, a
// named employee or a customer quote. Those are the claims a buyer
// actually decides on and none can be checked from the code, so they are
// for the business to supply rather than for this file to invent.
//
// The page is deliberately four sections: the hero, what we move, what
// happens to a consignment, and how to reach us. A longer draft (proof
// band, safety, proof of delivery, for business, coverage, FAQ, about) is
// in git at a5bac0f if any of it is ever wanted back.

export const HERO = {
    eyebrow: 'Freight across Kigali',
    headline: ['Know where', 'your cargo is.'],
    body:
        'Most freight goes quiet the moment it leaves your gate. Ours doesn’t — every ' +
        'consignment carries a code that shows you its position until somebody signs for it.',
};

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

// Explains the platform rather than the company's history — no founding
// year, no staff. Every capability named here is one that exists: guest
// booking and code tracking (publicOrderController), the driver app's
// telemetry, offline queue, proof photos and incident reporting, and the
// dispatch board's live map, geofences and nearest-driver assignment.
export const ABOUT = {
    eyebrow: 'The system',
    headline: 'Everyone is looking at the same record.',
    intro:
        'Most freight runs on a phone and a notebook, so what you get told depends on who ' +
        'you ask and when they last checked. Inzira is one system instead. The driver’s ' +
        'phone, the dispatcher’s screen and your tracking page are three views of the same ' +
        'consignment, and they update together.',
    views: [
        {
            title: 'What you see',
            body:
                'Book with a name and a number — no account. You get a code that shows the ' +
                'stage your cargo is at, where it was collected from and where it is going, ' +
                'the driver’s first name once one is assigned, and the photograph taken when ' +
                'it was handed over.',
        },
        {
            title: 'What the driver carries',
            body:
                'An app holding only their own jobs. It reports the vehicle’s position while ' +
                'the shift is running, takes the proof photo at the door, and reports ' +
                'breakdowns and damage from the roadside. In a signal-dead corner of the ' +
                'city it holds the confirmation and sends it when the connection returns.',
        },
        {
            title: 'What dispatch watches',
            body:
                'Every working vehicle on one live map, with fenced delivery areas that raise ' +
                'an alert if a vehicle carrying your cargo leaves where it should be. New ' +
                'orders are checked by a person, and the system suggests the closest ' +
                'available driver rather than whoever answers first.',
        },
    ],
    closing:
        'None of that is visible from the outside, which is the point — it is why the code ' +
        'we text you can be trusted to say something true.',
};

export const CONTACT = {
    eyebrow: 'Talk to us',
    headline: 'Moving something regularly?',
    body:
        'Standing routes and bulk lanes are priced per business rather than per drop. ' +
        'Tell us the shape of it and we will come back with a number.',
    address: 'Gikondo Industrial Zone · Kigali',
};
