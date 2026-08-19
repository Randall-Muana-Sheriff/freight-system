// ─────────────────────────────────────────────────────────────────────
//  CHANGE THE LAUNCH DATE HERE. Nothing else needs editing.
//
//  Before this moment the site serves the countdown page; from this
//  moment it serves the real landing page, on its own, with no deploy
//  needed. Someone loading the page a second after it passes gets the
//  full site.
//
//  Written with an explicit +02:00 offset (Kigali, CAT) rather than a
//  bare date string, which browsers interpret in the visitor's own
//  timezone — a customer in Nairobi would otherwise see a different
//  countdown from one in Kigali.
// ─────────────────────────────────────────────────────────────────────
export const LAUNCH_DATE = new Date('2026-11-02T08:00:00+02:00');

// Shown to visitors. Kept as its own string rather than formatted from
// the date above, because "November 2026" is what should appear on a
// pre-launch page — a precise day invites people to hold you to it.
export const LAUNCH_LABEL = 'November 2026';

// Master switch for the holding page, separate from the date so turning it
// off does not mean losing or faking LAUNCH_DATE.
//
//   true  — the root serves the countdown until LAUNCH_DATE passes
//   false — the root serves the real site now, whatever the date says
//
// Flip to false to open the site early; true holds the countdown until
// LAUNCH_DATE passes, after which the real site takes over on its own.
// Flipped back on: the root serves the countdown again until LAUNCH_DATE.
//
// This has a partner that must agree with it — PRE_LAUNCH in the UI
// container's environment, which decides whether the sitemap advertises
// /order and /track. The two disagreeing is the failure worth avoiding:
// a sitemap offering a bookable service while the front page says the
// company is not open yet points Google at a contradiction.
export const COUNTDOWN_ENABLED = true;

// The countdown is for the public internet, not for us. Holding a
// developer behind it means either working on the site through /preview
// or editing this file to work and remembering to revert it — and the
// second one eventually ships a flipped flag by accident.
//
// So the switch above is scoped to hosts a visitor could actually reach.
// The test is inverted deliberately: a host is exempt only if it is
// recognisably a machine of ours, and anything unrecognised gets the
// countdown. Forgetting to exempt a dev box shows us a holding page;
// forgetting to include some real hostname would open the site early to
// customers, which is the more expensive mistake.
function isLocalHost(hostname: string) {
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '[::1]'
        || hostname === '0.0.0.0'
        || hostname.endsWith('.local')
        // Private LAN ranges — a phone or another laptop opening the dev
        // server over Wi-Fi is still us testing, not a visitor.
        || /^10\./.test(hostname)
        || /^192\.168\./.test(hostname)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

export function isPreLaunch(now: Date = new Date()) {
    if (!COUNTDOWN_ENABLED) return false;
    if (typeof window !== 'undefined' && isLocalHost(window.location.hostname)) return false;
    return now.getTime() < LAUNCH_DATE.getTime();
}
