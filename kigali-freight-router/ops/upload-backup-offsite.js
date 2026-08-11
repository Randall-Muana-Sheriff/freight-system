// Copies a verified database dump to object storage, off the machine it
// was taken on.
//
// Why this exists: the nightly backup job is genuinely thorough — it
// restores each dump into a scratch database and content-checks it before
// pruning — but every copy lived on the same VM it protects. Losing that
// VM (deletion, disk failure, region incident) lost the database and all
// of its backups in one move. This is the off-host leg.
//
// Deliberately requires its own BACKUP_OFFSITE_BUCKET rather than reusing
// R2_BUCKET_NAME: delivery photos and driver documents live in that
// bucket and are served through presigned URLs, and full database dumps
// have no business sharing a namespace with them.
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const sourcePath = process.argv[2];

if (!sourcePath) {
    console.error('Usage: node ops/upload-backup-offsite.js <path-to-dump>');
    process.exit(1);
}
if (!fs.existsSync(sourcePath)) {
    console.error(`Backup file not found: ${sourcePath}`);
    process.exit(1);
}

const bucket = process.env.BACKUP_OFFSITE_BUCKET;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
// Optional: lets this run against MinIO locally, or a non-R2 S3 endpoint.
const endpoint = process.env.BACKUP_OFFSITE_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    // Exit non-zero on purpose: a backup that silently fails to leave the
    // host is the exact failure this script exists to prevent, so the
    // systemd unit should go red rather than report success.
    console.error(
        'Off-site backup upload is not configured — need BACKUP_OFFSITE_BUCKET, R2_ACCESS_KEY_ID, ' +
            'R2_SECRET_ACCESS_KEY and (R2_ACCOUNT_ID or BACKUP_OFFSITE_ENDPOINT).'
    );
    process.exit(1);
}

const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
});

// Date-prefixed so the bucket stays browsable as it grows, and the object
// key alone tells you which night a dump came from.
const fileName = path.basename(sourcePath);
const datePrefix = new Date().toISOString().slice(0, 10);
const key = `database-backups/${datePrefix}/${fileName}`;

const { size } = fs.statSync(sourcePath);

try {
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            // Streamed rather than read into memory — dumps only grow.
            Body: fs.createReadStream(sourcePath),
            ContentLength: size,
            ContentType: 'application/octet-stream',
        })
    );
    console.log(`✅ Off-site copy uploaded: s3://${bucket}/${key} (${(size / 1024).toFixed(1)} KB)`);
} catch (err) {
    console.error(`❌ Off-site backup upload failed: ${err.message}`);
    process.exit(1);
}
