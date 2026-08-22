import { randomInt } from 'crypto';

// Canonicalises any of the shapes a mobile number might arrive in --
// "0788123456", "788123456", "+250788123456", "(078) 123-456" -- to one
// consistent E.164 form. This matters because a dispatcher typing a number
// into the web invite form and a driver typing the same number into the app's
// phone step must resolve to the exact same users row.
//
// This was Rwanda-only: it hardcoded the 250 dialling code and the national
// pattern ^7[0-9]{8}, so +233, +234, +254 and +256 were all rejected outright.
// That gated driver sign-in and customer booking, which meant nobody in Accra
// could open an account or place an order -- the one thing that would have
// stopped an expansion dead.
//
// Now backed by libphonenumber-js rather than another regex, because the
// per-country rules are genuinely intricate -- Nigeria has ten national
// digits where its neighbours have nine, Liberia has both seven and eight --
// and a pattern that is subtly wrong rejects real customers who have no way
// to tell you why.
//
// MOBILE is required, not merely a valid number. Every account here is
// reached by SMS: a landline passes validation, is accepted, and then never
// receives the one-time code, which looks to the person holding it like the
// system is simply broken. FIXED_LINE_OR_MOBILE is allowed because in some
// countries the ranges genuinely are not distinguishable, and refusing those
// would exclude real mobiles.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// The market this deployment serves, used as the default region so a local
// number typed without a country code still resolves. An international number
// is accepted whatever its country: freight crosses borders here, and a
// Ugandan driver on a Kigali-Kampala run is an ordinary case rather than an
// exception.
const DEFAULT_REGION = process.env.MARKET_COUNTRY_CODE || 'RW';

const SMS_REACHABLE = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

export function normalizePhone(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    let parsed;
    try {
        parsed = parsePhoneNumberFromString(trimmed, DEFAULT_REGION);
    } catch {
        // Never throws for the caller. Every call site treats null as "not a
        // usable number" and says so to the person typing.
        return null;
    }

    if (!parsed || !parsed.isValid()) return null;

    const type = parsed.getType();
    // An unknown type means the metadata cannot tell, not that it is a
    // landline -- rejecting those would exclude valid mobiles in countries
    // with less precise range data.
    if (type && !SMS_REACHABLE.has(type)) return null;

    return parsed.number;
}

export function generateOtpCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguity when read aloud/copied

export function generateInviteCode() {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
        code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
    }
    return code;
}
