import { createHash } from 'crypto';
import pool from '../config/db.js';
import { io } from '../server.js';
import { uploadDriverDocument, toSignedUrl, assertRealFileType } from '../config/r2Client.js';
import { appendAuditLog, describeDriver } from '../services/auditLogService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { analyzeDriverDocument } from '../services/documentAnalysisService.js';
import { REQUIRED_DOCUMENT_TYPES } from '../services/driverVerificationService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

// Below this, a file is essentially certain to not be a legible ID/license/
// certificate photo — real phone-camera captures of a physical document
// are virtually always well into the hundreds of KB even compressed. This
// exists to catch an accidental near-empty capture (a blank frame, a
// 1x1 test image) before it ever reaches an admin's review queue, not to
// second-guess a genuinely small-but-legible scan.
const MIN_DOCUMENT_FILE_SIZE_BYTES = 10 * 1024;

const DOCUMENT_LABELS = {
    national_id: 'National ID',
    drivers_license: "Driver's license",
    vehicle_registration: 'Vehicle registration (logbook)',
    insurance_certificate: 'Insurance certificate',
    roadworthiness_certificate: 'Roadworthiness certificate',
};

// Fire-and-forget from uploadDocument below — deliberately not awaited
// there, so a slow or failed AI call never delays the driver's upload
// response. analyzeDriverDocument already swallows its own errors and
// returns null when AI features aren't configured at all; this just adds
// "don't let a late/duplicate result clobber a newer upload" on top,
// since a driver can re-upload (rejected -> resubmit) while a previous
// analysis call for the same row is still in flight.
// Analysis is deliberately not awaited at the call site — a driver's
// upload must return as soon as the file is stored, not sit waiting on a
// model call. But "not awaited" was being taken to mean "untracked", so a
// SIGTERM (every `docker compose up -d --build` deploy sends one) closed
// the pool out from under any call still in flight. The analysis was then
// lost with nothing to show for it but a "Cannot use a pool after calling
// end on the pool" line, and the document sat silently un-analysed.
//
// Holding the promises here lets shutdown wait for them the same way it
// already waits for the telemetry queue to flush.
const pendingAnalyses = new Set();

function trackPendingAnalysis(promise) {
    pendingAnalyses.add(promise);
    promise.catch(() => {}).finally(() => pendingAnalyses.delete(promise));
}

// Bounded, because orchestrators SIGKILL once their own grace period runs
// out and a slow model call must not be the reason a container dies hard.
// Anything still unfinished at the deadline is abandoned on purpose: the
// document just stays un-analysed, and re-uploading runs it again.
export async function drainPendingDocumentAnalyses(timeoutMs = 5000) {
    if (pendingAnalyses.size === 0) return;
    console.log(`⏳ Waiting up to ${timeoutMs}ms for ${pendingAnalyses.size} document analysis call(s) to finish...`);
    // unref() so this timer can't itself keep the event loop alive — the
    // exact failure mode that made the integration suite hang.
    const deadline = new Promise((resolve) => setTimeout(resolve, timeoutMs).unref());
    await Promise.race([Promise.allSettled([...pendingAnalyses]), deadline]);
    if (pendingAnalyses.size > 0) {
        console.warn(`⚠️ Shutting down with ${pendingAnalyses.size} document analysis call(s) unfinished — those documents stay un-analysed until re-uploaded.`);
    }
}

async function analyzeAndStoreDocumentInsights({ documentId, buffer, mimeType, documentLabel, username, uploadedAt }) {
    try {
        const userResult = await pool.query(`SELECT full_name AS "fullName" FROM users WHERE username = $1`, [username]);
        const driverFullName = userResult.rows[0]?.fullName || username;

        const analysis = await analyzeDriverDocument({ buffer, mimeType, documentLabel, driverFullName });
        if (!analysis) return;

        // uploaded_at::text on both sides, not a bare `= $3` against the
        // JS Date pg already parsed it into — TIMESTAMPTZ keeps
        // microsecond precision, a JS Date only has millisecond
        // precision, so round-tripping the RETURNING value through JS and
        // back lost precision and made this equality silently never
        // match (0 rows updated, no error, no logged sign anything was
        // wrong). Comparing text representations sidesteps that entirely.
        const updateResult = await pool.query(
            `UPDATE driver_documents SET ai_analysis = $1, ai_analyzed_at = NOW()
             WHERE id = $2 AND uploaded_at::text = $3::text`,
            [JSON.stringify(analysis), documentId, uploadedAt]
        );
        if (updateResult.rowCount === 0) {
            console.warn(`⚠️ Document AI analysis computed but not stored — document ${documentId} was re-uploaded before this call finished.`);
        }
    } catch (err) {
        console.error('❌ Failed to store document AI analysis:', err.message);
    }
}

export const DriverDocumentController = {
    // GET /api/driver-documents/mine - the driver's own checklist. Always
    // returns all 5 required types, even ones never submitted, so the app
    // can render a complete checklist rather than only what happens to
    // have a row.
    getMyDocuments: async (req, res) => {
        try {
            const username = req.user?.username;
            const result = await pool.query(
                `SELECT id, document_type AS "documentType", file_url AS "fileUrl", status,
                        rejection_reason AS "rejectionReason", uploaded_at AS "uploadedAt", reviewed_at AS "reviewedAt"
                 FROM driver_documents
                 WHERE username = $1;`,
                [username]
            );
            const byType = Object.fromEntries(result.rows.map((row) => [row.documentType, row]));

            // file_url stores the object's storage KEY, not a public URL
            // (the bucket is private) — sign a short-lived download link
            // per document at response time instead.
            const checklist = await Promise.all(REQUIRED_DOCUMENT_TYPES.map(async (type) => ({
                documentType: type,
                label: DOCUMENT_LABELS[type],
                status: byType[type]?.status || 'not_submitted',
                fileUrl: await toSignedUrl(byType[type]?.fileUrl),
                rejectionReason: byType[type]?.rejectionReason || null,
                uploadedAt: byType[type]?.uploadedAt || null,
                reviewedAt: byType[type]?.reviewedAt || null,
            })));

            const verified = checklist.every((doc) => doc.status === 'approved');
            return ok(res, { checklist, verified });
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'DRIVER_DOCUMENTS_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch your documents.'),
            });
        }
    },

    // POST /api/driver-documents - upload a required document for the
    // first time, or re-upload one an admin has rejected. A driver can't
    // freely resubmit something that's already approved or still awaiting
    // review — once a document is approved, only an admin rejecting it
    // again (see updateDocumentStatus) reopens the ability to re-upload.
    // Enforced here, not just hidden in the app UI, so this can't be
    // bypassed by calling the API directly.
    uploadDocument: async (req, res) => {
        try {
            const username = req.user?.username;
            const { documentType } = req.body || {};

            if (!REQUIRED_DOCUMENT_TYPES.includes(documentType)) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_INVALID_TYPE',
                    message: `documentType must be one of: ${REQUIRED_DOCUMENT_TYPES.join(', ')}.`,
                });
            }

            if (!req.file) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_FILE_REQUIRED',
                    message: 'A document file (photo or PDF) is required.',
                });
            }

            if (req.file.buffer.length < MIN_DOCUMENT_FILE_SIZE_BYTES) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_FILE_TOO_SMALL',
                    message: 'That file looks empty or unreadable — please retake the photo and try again.',
                });
            }

            const existing = await pool.query(
                `SELECT status FROM driver_documents WHERE username = $1 AND document_type = $2`,
                [username, documentType]
            );
            const currentStatus = existing.rows[0]?.status;
            if (currentStatus === 'approved' || currentStatus === 'pending') {
                return fail(res, {
                    status: 409,
                    code: 'DRIVER_DOCUMENT_NOT_REOPENED',
                    message: currentStatus === 'approved'
                        ? 'This document is already approved.'
                        : 'This document is already submitted and awaiting review.',
                });
            }

            const fileHash = createHash('sha256').update(req.file.buffer).digest('hex');

            // Same bytes already sitting under a different document type for
            // this driver — most often an accidental double-submit of the
            // same photo, occasionally someone trying to pass one document
            // off as another. Either way it's not worth an admin's time to
            // catch by eye; block it here with a message that assumes good
            // faith (retake/re-select) rather than accusing anyone.
            const duplicate = await pool.query(
                `SELECT document_type AS "documentType" FROM driver_documents
                 WHERE username = $1 AND document_type != $2 AND file_hash = $3
                       AND status IN ('pending', 'approved')`,
                [username, documentType, fileHash]
            );
            if (duplicate.rows.length > 0) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_DUPLICATE_FILE',
                    message: `That file is identical to what you submitted for ${DOCUMENT_LABELS[duplicate.rows[0].documentType] || duplicate.rows[0].documentType} — each document needs its own separate photo.`,
                });
            }

            const fileKey = await uploadDriverDocument({
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                username,
                documentType,
            });

            const result = await pool.query(
                `INSERT INTO driver_documents (username, document_type, file_url, status, file_hash)
                 VALUES ($1, $2, $3, 'pending', $4)
                 ON CONFLICT (username, document_type)
                 DO UPDATE SET file_url = $3, status = 'pending', rejection_reason = NULL,
                               reviewed_by = NULL, reviewed_at = NULL, uploaded_at = NOW(), file_hash = $4,
                               ai_analysis = NULL, ai_analyzed_at = NULL
                 RETURNING id, document_type AS "documentType", file_url AS "fileUrl", status, uploaded_at::text AS "uploadedAt";`,
                [username, documentType, fileKey, fileHash]
            );

            await appendAuditLog({
                actionType: 'DRIVER_DOCUMENT_SUBMITTED',
                description: `${await describeDriver(username)} submitted ${DOCUMENT_LABELS[documentType]}`,
                username,
            });

            const doc = result.rows[0];
            const realType = assertRealFileType(req.file.buffer, ['image/jpeg', 'image/png', 'application/pdf']);
            trackPendingAnalysis(
                analyzeAndStoreDocumentInsights({
                    documentId: doc.id,
                    buffer: req.file.buffer,
                    mimeType: realType,
                    documentLabel: DOCUMENT_LABELS[documentType],
                    username,
                    uploadedAt: doc.uploadedAt,
                })
            );
            delete doc.uploadedAt;

            doc.fileUrl = await toSignedUrl(doc.fileUrl);
            return ok(res, doc, { status: 201 });
        } catch (error) {
            const isFileTypeError = error.message?.includes('does not match an allowed');
            if (!isFileTypeError) {
                console.error(`❌ uploadDocument failed [${req.requestId || 'no-request-id'}]:`, error.stack || error.message);
            }
            return fail(res, {
                status: isFileTypeError ? 400 : 500,
                code: isFileTypeError ? 'DRIVER_DOCUMENT_INVALID_FILE_TYPE' : 'DRIVER_DOCUMENT_UPLOAD_FAILED',
                message: isFileTypeError ? error.message : errorMessage(error, 'Failed to upload document.'),
            });
        }
    },

    // GET /api/driver-documents - admin/dispatcher review queue. Pending
    // submissions surface first so a reviewer works the backlog in order
    // rather than having to hunt for what still needs a decision.
    getAllDocuments: async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT id, username, document_type AS "documentType", file_url AS "fileUrl", status,
                        rejection_reason AS "rejectionReason", uploaded_at AS "uploadedAt",
                        reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt",
                        ai_analysis AS "aiAnalysis", ai_analyzed_at AS "aiAnalyzedAt"
                 FROM driver_documents
                 ORDER BY (status = 'pending') DESC, uploaded_at DESC;`
            );
            const rows = await Promise.all(result.rows.map(async (row) => ({
                ...row,
                fileUrl: await toSignedUrl(row.fileUrl),
            })));
            return ok(res, rows);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'DRIVER_DOCUMENTS_ADMIN_FETCH_FAILED',
                message: errorMessage(error, 'Failed to fetch driver documents.'),
            });
        }
    },

    // PATCH /api/driver-documents/:id/status - admin approves or rejects a
    // single document. Rejecting without a reason is allowed but
    // discouraged client-side — the driver otherwise has no idea what to
    // fix before resubmitting.
    updateDocumentStatus: async (req, res) => {
        const { id } = req.params;
        const { status, rejectionReason } = req.body || {};
        const ALLOWED_STATUSES = ['approved', 'rejected'];

        if (!ALLOWED_STATUSES.includes(status)) {
            return fail(res, {
                status: 400,
                code: 'DRIVER_DOCUMENT_STATUS_INVALID',
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
            });
        }

        try {
            const result = await pool.query(
                `UPDATE driver_documents
                 SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW()
                 WHERE id = $4
                 RETURNING id, username, document_type AS "documentType", status;`,
                [status, status === 'rejected' ? (rejectionReason || null) : null, req.user?.username || 'System', id]
            );

            if (result.rows.length === 0) {
                return fail(res, { status: 404, code: 'DRIVER_DOCUMENT_NOT_FOUND', message: 'Document not found.' });
            }

            const doc = result.rows[0];
            const label = DOCUMENT_LABELS[doc.documentType] || doc.documentType;

            await appendAuditLog({
                actionType: status === 'approved' ? 'DRIVER_DOCUMENT_APPROVED' : 'DRIVER_DOCUMENT_REJECTED',
                description: `${await describeDriver(doc.username)}'s ${label} marked ${status}`,
                username: req.user?.username || 'System',
            });

            // Push (above) reaches the driver even with the app closed;
            // this also feeds the in-app Alerts live feed for whenever
            // they have it open, same broadcast-then-client-filters
            // pattern order:status-updated and incident:status-updated
            // already use.
            io.emit('document:status-updated', {
                username: doc.username,
                documentType: doc.documentType,
                status: doc.status,
                label,
                rejectionReason: status === 'rejected' ? rejectionReason || null : null,
            });

            sendPushToUser(doc.username, {
                title: status === 'approved' ? 'Document approved' : 'Document needs attention',
                body: status === 'approved'
                    ? `Your ${label} was approved.`
                    : `Your ${label} was rejected${rejectionReason ? `: ${rejectionReason}` : '.'}`,
                data: { type: 'document-status', documentType: doc.documentType },
            });

            return ok(res, doc);
        } catch (error) {
            return fail(res, {
                status: 500,
                code: 'DRIVER_DOCUMENT_STATUS_UPDATE_FAILED',
                message: errorMessage(error, 'Failed to update document status.'),
            });
        }
    },
};
