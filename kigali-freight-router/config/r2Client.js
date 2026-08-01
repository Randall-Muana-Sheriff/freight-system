import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { appConfig } from './appConfig.js';

// Cloudflare R2 speaks the S3 API, so the standard AWS S3 SDK works against
// it directly — just point endpoint at R2's account-specific URL instead
// of AWS. Proof-of-delivery photo upload is optional infrastructure: when
// unconfigured, uploadDeliveryPhoto() throws a clear, catchable error
// rather than the app crashing on startup.
let client = null;
let initAttempted = false;

// A second, lazily-built client used ONLY for presigning download URLs.
// Why two clients: the bucket is private (no more `mc anonymous set
// download`), so every read now goes through a short-lived signed URL —
// but the endpoint used to sign a request must be the same host the
// browser/phone will actually hit, or the signature won't validate. For
// local dev that's the docker-network hostname (`minio`) for uploads but
// a LAN-reachable address (R2_PUBLIC_URL_BASE) for anything a browser or
// phone opens. Real Cloudflare R2 doesn't have this split — its endpoint
// is already publicly reachable — so this just falls back to the same
// endpoint when R2_PUBLIC_URL_BASE isn't set.
let presignClient = null;
let presignInitAttempted = false;

function isConfigured() {
    const { accountId, accessKeyId, secretAccessKey, bucketName } = appConfig.r2;
    return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
}

function getClient() {
    if (initAttempted) return client;
    initAttempted = true;

    if (!isConfigured()) {
        console.warn('⚠️  R2 storage not configured (R2_ACCOUNT_ID etc. unset) — delivery photo upload disabled.');
        return null;
    }

    const endpoint = appConfig.r2.endpoint || `https://${appConfig.r2.accountId}.r2.cloudflarestorage.com`;
    client = new S3Client({
        region: 'auto',
        endpoint,
        // Path-style (endpoint/bucket/key) rather than virtual-hosted-style
        // (bucket.endpoint/key) — required for MinIO, and works fine
        // against real R2 too.
        forcePathStyle: true,
        credentials: {
            accessKeyId: appConfig.r2.accessKeyId,
            secretAccessKey: appConfig.r2.secretAccessKey,
        },
    });
    console.log(`📦 Object storage client initialized (${endpoint}) — delivery photo upload enabled.`);
    return client;
}

// Derives just the origin (scheme://host:port) from R2_PUBLIC_URL_BASE,
// discarding the bucket-name path segment that was previously appended to
// build plain public URLs — the presigner needs a bare endpoint, since it
// appends /<bucket>/<key> itself (forcePathStyle).
function derivePresignEndpoint() {
    if (!appConfig.r2.publicUrlBase) return appConfig.r2.endpoint || `https://${appConfig.r2.accountId}.r2.cloudflarestorage.com`;
    try {
        const url = new URL(appConfig.r2.publicUrlBase);
        return `${url.protocol}//${url.host}`;
    } catch {
        return appConfig.r2.endpoint;
    }
}

function getPresignClient() {
    if (presignInitAttempted) return presignClient;
    presignInitAttempted = true;
    if (!isConfigured()) return null;

    presignClient = new S3Client({
        region: 'auto',
        endpoint: derivePresignEndpoint(),
        forcePathStyle: true,
        credentials: {
            accessKeyId: appConfig.r2.accessKeyId,
            secretAccessKey: appConfig.r2.secretAccessKey,
        },
    });
    return presignClient;
}

const SIGNED_URL_TTL_SECONDS = 15 * 60;

// Turns a stored object key into a short-lived signed GET URL. Called at
// response time, never at upload time — a signed URL baked into a
// database column would silently stop working 15 minutes after being
// written, so only the key is ever persisted (see uploadDeliveryPhoto /
// uploadDriverDocument below).
export async function toSignedUrl(key) {
    if (!key) return null;
    const s3 = getPresignClient();
    if (!s3) return null;
    return getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: appConfig.r2.bucketName, Key: key }),
        { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
}

// Real, byte-level file-type checks — never trust the client-supplied
// Content-Type/mimetype string alone. A caller could label an HTML/SVG
// payload as "image/jpeg" and have it stored and later served back with
// that spoofed type; checking the actual magic bytes closes that off.
const MAGIC_BYTES = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // "%PDF"
};

function matchesSignature(buffer, signature) {
    if (buffer.length < signature.length) return false;
    return signature.every((byte, i) => buffer[i] === byte);
}

// Throws with a clear, catchable message if the buffer's real bytes don't
// match one of the allowed types, regardless of what Content-Type the
// client claimed.
export function assertRealFileType(buffer, allowedMimeTypes) {
    const matched = allowedMimeTypes.find((mime) =>
        (MAGIC_BYTES[mime] || []).some((signature) => matchesSignature(buffer, signature))
    );
    if (!matched) {
        throw new Error('File content does not match an allowed image/PDF format.');
    }
    return matched;
}

// Uploads a single photo buffer, returns its storage KEY (not a URL — see
// toSignedUrl above for why). Throws if R2 isn't configured — callers
// should catch and surface a clear 503-style error rather than silently
// pretending the upload succeeded.
export async function uploadDeliveryPhoto({ buffer, mimeType, orderId }) {
    const s3 = getClient();
    if (!s3) {
        throw new Error('Delivery photo storage is not configured on this server.');
    }

    const realType = assertRealFileType(buffer, ['image/jpeg', 'image/png']);
    const extension = realType === 'image/png' ? 'png' : 'jpg';
    const key = `delivery-confirmations/${orderId}/${randomUUID()}.${extension}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: appConfig.r2.bucketName,
            Key: key,
            Body: buffer,
            ContentType: realType,
        })
    );

    return key;
}

// Uploads a driver's compliance document (ID, license, registration,
// insurance, roadworthiness certificate). Keyed by username + type so a
// re-upload after rejection overwrites the same storage path rather than
// accumulating orphaned old files — the DB row is what tracks history via
// its updated_at/status, not distinct object keys. Returns the storage
// KEY (not a URL — see toSignedUrl above).
export async function uploadDriverDocument({ buffer, mimeType, username, documentType }) {
    const s3 = getClient();
    if (!s3) {
        throw new Error('Document storage is not configured on this server.');
    }

    const realType = assertRealFileType(buffer, ['image/jpeg', 'image/png', 'application/pdf']);
    const extension = realType === 'image/png' ? 'png' : realType === 'application/pdf' ? 'pdf' : 'jpg';
    const key = `driver-documents/${username}/${documentType}.${extension}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: appConfig.r2.bucketName,
            Key: key,
            Body: buffer,
            ContentType: realType,
        })
    );

    return key;
}
