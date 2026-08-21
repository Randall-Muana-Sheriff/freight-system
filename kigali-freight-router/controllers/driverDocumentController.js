import { createHash } from 'crypto';
import pool from '../config/db.js';
import { io } from '../server.js';
import { uploadDriverDocument, toSignedUrl, assertRealFileType } from '../config/r2Client.js';
import { appendAuditLog, describeDriver } from '../services/auditLogService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { analyzeDriverDocument } from '../services/documentAnalysisService.js';
import { REQUIRED_DOCUMENT_TYPES, ACCEPTED_DOCUMENT_TYPES, DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES } from '../services/driverVerificationService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

// Three of the five documents describe the truck, not the person, and now
// live in vehicle_documents keyed by vehicle. The upload still comes from
// the driver's phone — they are the one standing next to the vehicle — so
// everything below has to know which table a given type belongs in and, for
// the vehicle ones, which vehicle that driver is currently in.
//
// Table names here are chosen by a closed branch on a validated document
// type, never taken from request input, so interpolating them is safe.
function isVehicleDoc(documentType) {
    return VEHICLE_DOCUMENT_TYPES.includes(documentType);
}

// Resolves where a document goes and what identifies it there. Returns null
// for a vehicle document when the driver has no active vehicle — there is
// no truck for the paperwork to describe, so the upload cannot be filed.
async function resolveTarget(queryable, username, documentType) {
    if (!isVehicleDoc(documentType)) {
        return { table: 'driver_documents', keyColumn: 'username', keyValue: username, ownerColumn: 'username' };
    }
    const result = await queryable.query(
        `SELECT fv.id
           FROM fleet_vehicles fv
           JOIN users u ON u.id = fv.current_driver_id
          WHERE u.username = $1 AND fv.status = 'ACTIVE'
          ORDER BY fv.id
          LIMIT 1;`,
        [username]
    );
    if (!result.rows[0]) return null;
    return { table: 'vehicle_documents', keyColumn: 'vehicle_id', keyValue: result.rows[0].id, ownerColumn: 'uploaded_by' };
}

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

// `table` is passed in rather than assumed: since vehicle paperwork moved to
// vehicle_documents, the two tables have independent id sequences, and this
// wrote every result back to driver_documents regardless. For a vehicle
// document that matched nothing, so the analysis was discarded and the only
// trace was the "re-uploaded before this call finished" warning below —
// which would have been actively misleading, because nobody had re-uploaded
// anything. Caller resolves the table; the value is never request input.
async function analyzeAndStoreDocumentInsights({ table, documentId, buffer, mimeType, documentLabel, username, uploadedAt }) {
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
            `UPDATE ${table} SET ai_analysis = $1, ai_analyzed_at = NOW()
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
            // Both halves: the driver's own papers, and those of whichever
            // active vehicle they are currently in. A driver with no vehicle
            // simply gets no rows from the second half, so the three vehicle
            // documents show as not submitted — which is accurate, since
            // there is no truck for them to describe yet.
            //
            // The driver half is restricted to the types that actually
            // belong to a person. When vehicle paperwork moved to
            // vehicle_documents the migration deliberately left the old rows
            // in driver_documents, on the understanding that the service
            // layer would stop reading them — this query did not, and since
            // the two halves are keyed by document type below, the stale
            // driver-held copy silently shadowed the vehicle's real one.
            const result = await pool.query(
                `SELECT id, document_type AS "documentType", file_url AS "fileUrl", status,
                        rejection_reason AS "rejectionReason", uploaded_at AS "uploadedAt",
                        reviewed_at AS "reviewedAt", expires_at AS "expiresAt"
                   FROM driver_documents
                  WHERE username = $1 AND document_type = ANY($2::text[])
                  UNION ALL
                 SELECT vd.id, vd.document_type, vd.file_url, vd.status,
                        vd.rejection_reason, vd.uploaded_at,
                        vd.reviewed_at, vd.expires_at
                   FROM vehicle_documents vd
                   JOIN fleet_vehicles fv ON fv.id = vd.vehicle_id
                   JOIN users u ON u.id = fv.current_driver_id
                  WHERE u.username = $1 AND fv.status = 'ACTIVE';`,
                [username, DRIVER_DOCUMENT_TYPES]
            );
            const byType = Object.fromEntries(result.rows.map((row) => [row.documentType, row]));

            // file_url stores the object's storage KEY, not a public URL
            // (the bucket is private) — sign a short-lived download link
            // per document at response time instead.
            const now = Date.now();
            const checklist = await Promise.all(REQUIRED_DOCUMENT_TYPES.map(async (type) => {
                const row = byType[type];
                const expiresAt = row?.expiresAt || null;
                return {
                    documentType: type,
                    label: DOCUMENT_LABELS[type],
                    status: row?.status || 'not_submitted',
                    fileUrl: await toSignedUrl(row?.fileUrl),
                    rejectionReason: row?.rejectionReason || null,
                    uploadedAt: row?.uploadedAt || null,
                    reviewedAt: row?.reviewedAt || null,
                    // Surfaced to the driver so a renewal is their own to
                    // chase rather than a surprise when work stops arriving.
                    expiresAt,
                    expired: Boolean(expiresAt && new Date(expiresAt).getTime() <= now),
                    belongsTo: isVehicleDoc(type) ? 'vehicle' : 'driver',
                };
            }));

            const verified = checklist.every((doc) => doc.status === 'approved' && !doc.expired);
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

            // Accepted rather than required: an operator licence can be
            // uploaded and reviewed without being one of the documents that
            // gates assignment. See driverVerificationService for why those
            // are different lists.
            if (!ACCEPTED_DOCUMENT_TYPES.includes(documentType)) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_INVALID_TYPE',
                    message: `documentType must be one of: ${ACCEPTED_DOCUMENT_TYPES.join(', ')}.`,
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

            const target = await resolveTarget(pool, username, documentType);
            if (!target) {
                return fail(res, {
                    status: 409,
                    code: 'DRIVER_DOCUMENT_NO_VEHICLE',
                    message: 'This document belongs to a vehicle, and you do not have one assigned yet. Ask dispatch to assign your vehicle first.',
                });
            }

            const existing = await pool.query(
                `SELECT status FROM ${target.table} WHERE ${target.keyColumn} = $1 AND document_type = $2`,
                [target.keyValue, documentType]
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
            // Scoped to the same holder the upload is being filed against —
            // for a vehicle document that is the truck, so re-using one
            // photo across two of a vehicle's certificates is still caught,
            // while two drivers of the same truck no longer collide.
            const duplicate = await pool.query(
                `SELECT document_type AS "documentType" FROM ${target.table}
                 WHERE ${target.keyColumn} = $1 AND document_type != $2 AND file_hash = $3
                       AND status IN ('pending', 'approved')`,
                [target.keyValue, documentType, fileHash]
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

            // A re-upload clears the previous expiry along with the previous
            // review — the new certificate has its own date, which the
            // reviewer records when they approve it.
            // For a driver document the key and the owner are the same column
            // (username), so it is named once; for a vehicle document the key
            // is the vehicle and the owner is whoever sent the photo in.
            const ownsSeparately = target.ownerColumn !== target.keyColumn;
            const result = await pool.query(
                `INSERT INTO ${target.table} (${target.keyColumn}, ${ownsSeparately ? `${target.ownerColumn}, ` : ''}document_type, file_url, status, file_hash)
                 VALUES ($1, ${ownsSeparately ? '$5, ' : ''}$2, $3, 'pending', $4)
                 ON CONFLICT (${target.keyColumn}, document_type)
                 DO UPDATE SET file_url = $3, status = 'pending', rejection_reason = NULL,
                               reviewed_by = NULL, reviewed_at = NULL, uploaded_at = NOW(), file_hash = $4,
                               expires_at = NULL,
                               ${ownsSeparately ? `${target.ownerColumn} = $5,` : ''}
                               ai_analysis = NULL, ai_analyzed_at = NULL
                 RETURNING id, document_type AS "documentType", file_url AS "fileUrl", status, uploaded_at::text AS "uploadedAt";`,
                ownsSeparately
                    ? [target.keyValue, documentType, fileKey, fileHash, username]
                    : [target.keyValue, documentType, fileKey, fileHash]
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
                    table: target.table,
                    documentId: doc.id,
                    buffer: req.file.buffer,
                    mimeType: realType,
                    documentLabel: DOCUMENT_LABELS[documentType],
                    username,
                    uploadedAt: doc.uploadedAt,
                })
            );
            delete doc.uploadedAt;

            // The reviewer has to send this back on the PATCH: the two
            // document tables have independent id sequences, so an id alone
            // does not say which one a row is in.
            doc.holderKind = isVehicleDoc(documentType) ? 'vehicle' : 'driver';

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
            // holderKind tells the reviewer — and the PATCH that follows —
            // which table a row came from, since the two have separate id
            // sequences and an id alone is ambiguous across them.
            // The UNION is wrapped so the ordering can be applied to the
            // combined result. Postgres allows only bare output-column names
            // directly after a UNION — not an expression, and not a column
            // name the union does not actually expose. Ordering the two
            // halves in place instead would not work either: it sorts each
            // branch separately and the reviewer gets driver documents
            // interleaved by nothing in particular.
            //
            // The driver half is restricted to person-held types for the
            // same reason getMyDocuments is, but the consequence here was
            // worse than a duplicate row: the queue listed every vehicle
            // document twice, once as the superseded driver_documents copy
            // the migration left behind, and approving that copy cleared
            // nothing. Verification reads vehicle_documents for those types,
            // so a reviewer could work the queue to empty and the driver
            // would still be blocked from dispatch with no visible reason.
            const result = await pool.query(
                `SELECT * FROM (
                    SELECT id, username, 'driver' AS "holderKind", NULL::text AS "plateNumber",
                           document_type AS "documentType", file_url AS "fileUrl", status,
                           rejection_reason AS "rejectionReason", uploaded_at AS "uploadedAt",
                           reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt", expires_at AS "expiresAt",
                           ai_analysis AS "aiAnalysis", ai_analyzed_at AS "aiAnalyzedAt"
                      FROM driver_documents
                     WHERE document_type = ANY($1::text[])
                     UNION ALL
                    SELECT vd.id, COALESCE(u.username, vd.uploaded_by), 'vehicle', fv.plate_number,
                           vd.document_type, vd.file_url, vd.status,
                           vd.rejection_reason, vd.uploaded_at,
                           vd.reviewed_by, vd.reviewed_at, vd.expires_at,
                           vd.ai_analysis, vd.ai_analyzed_at
                      FROM vehicle_documents vd
                      JOIN fleet_vehicles fv ON fv.id = vd.vehicle_id
                      LEFT JOIN users u ON u.id = fv.current_driver_id
                 ) documents
                 ORDER BY (status = 'pending') DESC, "uploadedAt" DESC;`,
                [DRIVER_DOCUMENT_TYPES]
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
        const { status, rejectionReason, expiresAt, holderKind } = req.body || {};
        const ALLOWED_STATUSES = ['approved', 'rejected'];

        if (!ALLOWED_STATUSES.includes(status)) {
            return fail(res, {
                status: 400,
                code: 'DRIVER_DOCUMENT_STATUS_INVALID',
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
            });
        }

        // Defaults to the driver table so an older client that does not send
        // holderKind keeps working exactly as it did.
        const table = holderKind === 'vehicle' ? 'vehicle_documents' : 'driver_documents';

        // The expiry is read off the document in the reviewer's hand — it is
        // the one moment somebody is actually looking at the certificate, so
        // it is the only honest place to capture the date. Rejecting clears
        // any previous one along with the approval.
        let expiry = null;
        if (status === 'approved' && expiresAt) {
            const parsed = new Date(expiresAt);
            if (Number.isNaN(parsed.getTime())) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_EXPIRY_INVALID',
                    message: 'Expiry date is not a valid date.',
                });
            }
            if (parsed.getTime() <= Date.now()) {
                return fail(res, {
                    status: 400,
                    code: 'DRIVER_DOCUMENT_EXPIRY_PAST',
                    message: 'That expiry date has already passed — approving it would clear the driver on a lapsed document.',
                });
            }
            expiry = parsed.toISOString();
        }

        try {
            const result = await pool.query(
                `UPDATE ${table}
                 SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(),
                     expires_at = $5
                 WHERE id = $4
                 RETURNING id, ${table === 'vehicle_documents' ? 'uploaded_by AS username' : 'username'},
                           document_type AS "documentType", status;`,
                [status, status === 'rejected' ? (rejectionReason || null) : null, req.user?.username || 'System', id, expiry]
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
