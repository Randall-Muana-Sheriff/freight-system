import pool from '../config/db.js';
import { uploadDriverDocument, toSignedUrl } from '../config/r2Client.js';
import { appendAuditLog, describeDriver } from '../services/auditLogService.js';
import { sendPushToUser } from '../services/pushNotificationService.js';
import { REQUIRED_DOCUMENT_TYPES } from '../services/driverVerificationService.js';
import { ok, fail, errorMessage } from '../utils/httpResponse.js';

const DOCUMENT_LABELS = {
    national_id: 'National ID',
    drivers_license: "Driver's license",
    vehicle_registration: 'Vehicle registration (logbook)',
    insurance_certificate: 'Insurance certificate',
    roadworthiness_certificate: 'Roadworthiness certificate',
};

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

            const fileKey = await uploadDriverDocument({
                buffer: req.file.buffer,
                mimeType: req.file.mimetype,
                username,
                documentType,
            });

            const result = await pool.query(
                `INSERT INTO driver_documents (username, document_type, file_url, status)
                 VALUES ($1, $2, $3, 'pending')
                 ON CONFLICT (username, document_type)
                 DO UPDATE SET file_url = $3, status = 'pending', rejection_reason = NULL,
                               reviewed_by = NULL, reviewed_at = NULL, uploaded_at = NOW()
                 RETURNING id, document_type AS "documentType", file_url AS "fileUrl", status;`,
                [username, documentType, fileKey]
            );

            await appendAuditLog({
                actionType: 'DRIVER_DOCUMENT_SUBMITTED',
                description: `${await describeDriver(username)} submitted ${DOCUMENT_LABELS[documentType]}`,
                username,
            });

            const doc = result.rows[0];
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
                        reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt"
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
