import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { appConfig } from './appConfig.js';

// Cloudflare R2 speaks the S3 API, so the standard AWS S3 SDK works against
// it directly — just point endpoint at R2's account-specific URL instead
// of AWS. Proof-of-delivery photo upload is optional infrastructure: when
// unconfigured, uploadDeliveryPhoto() throws a clear, catchable error
// rather than the app crashing on startup.
let client = null;
let initAttempted = false;

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

// Uploads a single photo buffer, returns its public URL.
// Throws if R2 isn't configured — callers should catch and surface a clear
// 503-style error rather than silently pretending the upload succeeded.
export async function uploadDeliveryPhoto({ buffer, mimeType, orderId }) {
    const s3 = getClient();
    if (!s3) {
        throw new Error('Delivery photo storage is not configured on this server.');
    }

    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const key = `delivery-confirmations/${orderId}/${randomUUID()}.${extension}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: appConfig.r2.bucketName,
            Key: key,
            Body: buffer,
            ContentType: mimeType,
        })
    );

    const base = appConfig.r2.publicUrlBase.replace(/\/$/, '');
    return `${base}/${key}`;
}
