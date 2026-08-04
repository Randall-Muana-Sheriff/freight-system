import crypto from 'crypto';
import { generateSecret, generate, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import { appConfig } from '../config/appConfig.js';

const ISSUER = 'Inzira';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export class TotpNotConfiguredError extends Error {
    constructor() {
        super('MFA is not configured on this server yet.');
        this.name = 'TotpNotConfiguredError';
    }
}

function getEncryptionKey() {
    if (!appConfig.totpEncryptionKey) throw new TotpNotConfiguredError();
    const key = Buffer.from(appConfig.totpEncryptionKey, 'base64');
    if (key.length !== 32) {
        // A misconfigured key (wrong length) should fail loudly and
        // immediately, not produce silently-broken encryption.
        throw new Error('TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes (generate with `openssl rand -base64 32`).');
    }
    return key;
}

// AES-256-GCM: the secret has to be retrievable (unlike a password hash)
// to generate a comparison code, so this is encryption, not hashing.
// Each encryption uses a fresh random IV, stored alongside the ciphertext
// and auth tag — none of it is secret on its own without the key.
export function encryptSecret(plainSecret) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join('.');
}

export function decryptSecret(encoded) {
    const key = getEncryptionKey();
    const [ivB64, cipherB64, tagB64] = String(encoded).split('.');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherB64, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
}

export function generateTotpSecret() {
    return generateSecret();
}

export function buildOtpauthUri(secret, username) {
    return generateURI({ issuer: ISSUER, label: username, secret });
}

export async function generateQrCodeDataUrl(otpauthUri) {
    return QRCode.toDataURL(otpauthUri);
}

export async function verifyTotpCode(secret, token) {
    if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return false;
    const result = await verify({ secret, token });
    return result.valid;
}

function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
}

// The hyphen in "XXXX-XXXX" is a display affordance only — hashing
// always uses this canonical (uppercase, no punctuation/whitespace) form
// so a recovery code still matches whether a user pastes it exactly as
// shown or retypes it without the hyphen.
function canonicalizeRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function generateOneRecoveryCode() {
    let code = '';
    for (let i = 0; i < 8; i += 1) {
        code += RECOVERY_CODE_ALPHABET[crypto.randomInt(0, RECOVERY_CODE_ALPHABET.length)];
    }
    return { display: `${code.slice(0, 4)}-${code.slice(4)}`, canonical: code };
}

// Ten single-use backup codes, shown to the user exactly once at
// enrollment — the only self-service way back into an account after a
// lost authenticator device. Returns both the plaintext (to display) and
// the hashes (what actually gets stored in totp_recovery_code_hashes).
export function generateRecoveryCodes() {
    const generated = Array.from({ length: 10 }, generateOneRecoveryCode);
    return {
        codes: generated.map((c) => c.display),
        hashes: generated.map((c) => hashCode(c.canonical)),
    };
}

// Consumes a matching unused recovery code from the stored hash list —
// returns the updated hash array (with the used one removed) on success,
// or null if the code doesn't match anything, so the caller can tell
// "wrong code" apart from "worked, here's what to persist."
export function consumeRecoveryCode(storedHashes, suppliedCode) {
    if (!Array.isArray(storedHashes) || !suppliedCode) return null;
    const suppliedHash = hashCode(canonicalizeRecoveryCode(suppliedCode));
    const index = storedHashes.indexOf(suppliedHash);
    if (index === -1) return null;
    return [...storedHashes.slice(0, index), ...storedHashes.slice(index + 1)];
}
