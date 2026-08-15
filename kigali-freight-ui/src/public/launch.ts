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
// Set to false while the booking flow is being worked on. Flip back to
// true to put the countdown up again; nothing else needs changing.
export const COUNTDOWN_ENABLED = false;

export function isPreLaunch(now: Date = new Date()) {
    return COUNTDOWN_ENABLED && now.getTime() < LAUNCH_DATE.getTime();
}
