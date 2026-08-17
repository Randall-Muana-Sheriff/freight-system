# App Store listing — Inzira Driver

Copy each field into App Store Connect. Character limits are Apple's and are
enforced by the form, so the counts in each heading were measured against the
exact strings in the blocks below rather than estimated. If you edit the
wording, re-measure — the description in particular is nowhere near its
ceiling, but the subtitle has four characters of headroom.

Lives in the repo rather than only in App Store Connect so the wording is
versioned with the app it describes, and so the next release can be diffed
against what is currently live.

- **ASC App ID:** 6802449407
- **Bundle ID:** com.muana.inzirafreightdriver

---

## App Name — 13/30

```
Inzira Driver
```

## Subtitle — 26/30

```
For Inzira freight drivers
```

Says who it is for in the one line shown under the name in search results.
Worth spending the subtitle on this rather than on features: the single most
likely bad outcome for this listing is a member of the public installing it,
finding they cannot create an account, and leaving a one-star review saying
it does not work.

## Promotional text — 133/170

Changeable at any time without a new review, so use it for anything seasonal
or temporary.

```
Built for the drivers moving freight across Kigali. Your runs, your stops, and proof of every delivery — in one place, on one screen.
```

## Description — 1718/4000

```
Inzira Driver is the working app for drivers carrying freight with Inzira across Kigali.

Accounts are issued by our dispatch team. There is no public sign-up: if you drive for Inzira, dispatch registers your phone number and you sign in with a code and your PIN.

YOUR DAY, IN ORDER
Start your shift and see exactly what has been assigned to you. Multi-stop runs arrive already sequenced, so you know which collection or drop comes next and how far is left — no working it out from a list of addresses.

PROOF, NOT PAPERWORK
Capture a photo at handover and it is attached to that consignment immediately. The office and the customer can see the delivery is done before you have pulled away.

THE OFFICE KNOWS WHERE YOU ARE
While your shift is active, your position updates for dispatch, so nobody has to ring you to ask where you have reached — and the customer waiting at the other end can watch their cargo approach. Tracking runs only between starting and ending a shift, and stops the moment you clock off.

BEFORE YOU PULL OUT
A short pre-departure check covers the things worth catching in the yard rather than on the road: seatbelt, mirrors and lights, tyres, load security, and whether you are fit to drive.

WHEN SOMETHING GOES WRONG
Report a breakdown, a blocked road or an incident straight from the app, and dispatch sees it as it happens rather than at the end of the day.

YOUR PAPERWORK IN ONE PLACE
Licence, insurance and roadworthiness documents live in the app, with their approval status and expiry dates visible, so a lapsed certificate is something you can see coming instead of discovering when work stops arriving.

Sign in quickly with Face ID or your fingerprint where your phone supports it.
```

## Keywords — 96/100

Comma-separated, no spaces after commas (spaces waste characters).

```
freight,logistics,delivery,dispatch,cargo,haulage,courier,transport,trucking,route,Kigali,Rwanda
```

Deliberately omits the app's own name — Apple already indexes the app name
and subtitle, so repeating them here spends the budget twice.

## Category

- **Primary:** Business
- **Secondary:** Productivity

Not Navigation: the app shows a driver their sequenced stops, it does not
give turn-by-turn directions, and claiming a category the app does not serve
invites a rejection.

## Age rating

4+ — no objectionable content of any kind.

## URLs

- **Support URL:** https://inzira.systems/support
- **Privacy Policy URL:** https://inzira.systems/privacy
- **Marketing URL** (optional): https://inzira.systems

## Version

```
1.1.0
```

Must match the built binary, which reports 1.1.0 (build 3).

## Copyright

```
2026 Jennifer Maxwell
```

Apple asks for whoever holds the exclusive rights, and the account is an
Individual one in that name — so this matches the seller shown on the
listing. Change it to the company name at the same time as converting the
account to an Organization, not before, so the two never disagree.

## Sign-In Information

Tick **Sign-in required**, then fill the two boxes. They are labelled
username and password because most apps use those; ours does not, so the
demo phone number and PIN go in and the Notes field explains the code step
in between.

- **User name:** `+250780000000`
- **Password:** `4819`

## Contact Information

Who Apple calls if review has a question. Use a phone that will actually be
answered — an unanswered review query stalls the submission rather than
failing it, which is worse because nothing tells you it is waiting.

- **Email:** sherifimran2000@gmail.com
- **Phone:** +250 732 324 860

## Version Release

Choose **Manually release this version**.

Approval and publication become two separate decisions, so a build that
passes review at 3am does not go public before anyone has looked at it on a
real phone. Automatic release is the right choice later, once a release has
been through this once.

---

## Review notes

Paste this into "Notes" in App Store Connect. The demo account matters more
than anything else on this page: sign-in is phone number → SMS code → PIN,
and a reviewer cannot receive a Rwandan text message, so without the fixed
code below they cannot open the app at all.

```
This app is used by delivery drivers working for Inzira, a freight company
in Kigali, Rwanda. Accounts are created by our dispatch team, so there is no
public sign-up.

DEMO ACCOUNT
  Phone number: +250780000000
  Verification code: 211000
  PIN: 4819

Sign-in is normally phone number -> SMS code -> PIN. No SMS is sent to the
demo number above; its verification code is fixed to 211000 so it can be
used from anywhere. Enter the phone number, tap continue, enter 211000, then
enter the PIN 4819.

The account has two sample consignments assigned so the job list is
populated.

BACKGROUND LOCATION
The app requests Always location because a driver's position is reported to
our dispatchers, and to the customer awaiting the delivery, while a shift is
in progress. A delivery does not pause when a driver's phone locks or goes
into a pocket, so While Using is not sufficient for the feature to work.
Location is collected only between the driver starting and ending a shift,
is never collected off shift, and is not used for advertising or shared with
any third party. This is described in our privacy policy at
https://inzira.systems/privacy.

To see it working: sign in, tap "Start shift" on the home screen, and grant
location permission when prompted.
```

---

## Still needed before submitting

Screenshots. App Store Connect is asking for the **6.5" display** slot —
1284 × 2778 portrait (or 1242 × 2688, an older 6.5" size it still accepts).
Apple reuses these for every other size, so this one set is enough. Only the
first three appear on the install sheet, so lead with the strongest.

They have to come from a real device or an iOS simulator. Good candidates,
in order of how well they show what the app is for:

1. Home screen mid-shift — the shift card with jobs counted
2. A multi-stop run showing the sequenced stops
3. Proof-of-delivery capture
4. The pre-departure safety check
5. Documents screen with approval states

Take them on the TestFlight build with the demo account signed in, so the
screens are populated rather than empty.
