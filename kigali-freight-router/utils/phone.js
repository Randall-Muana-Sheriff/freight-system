import { randomInt } from 'crypto';

// Canonicalizes any of the shapes a Rwandan mobile number might arrive in —
// "0788123456", "788123456", "+250788123456", "(078) 123-456" — to one
// consistent "+250XXXXXXXXX" form. This matters because a dispatcher typing
// a number into the web invite form and a driver typing the same number
// into the app's phone step must resolve to the exact same users row.
// Returns null (never throws) for anything that isn't a valid 9-digit
// Rwandan mobile number once punctuation/prefixes are stripped.
export function normalizePhone(input) {
    if (typeof input !== 'string') return null;
    const digitsOnly = input.replace(/\D/g, '');

    let nationalNumber;
    if (digitsOnly.startsWith('250') && digitsOnly.length === 12) {
        nationalNumber = digitsOnly.slice(3);
    } else if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
        nationalNumber = digitsOnly.slice(1);
    } else if (digitsOnly.length === 9) {
        nationalNumber = digitsOnly;
    } else {
        return null;
    }

    if (!/^7[0-9]{8}$/.test(nationalNumber)) return null;
    return `+250${nationalNumber}`;
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
