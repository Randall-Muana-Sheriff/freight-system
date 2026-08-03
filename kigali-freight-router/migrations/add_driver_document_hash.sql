-- Backs the "same photo submitted for two different document types"
-- pre-check in driverDocumentController.js — a SHA-256 of the uploaded
-- file's bytes, compared against a driver's other submissions before an
-- admin ever sees it. Nullable/no backfill: existing rows just won't
-- participate in the duplicate check until they're next re-uploaded,
-- which is fine since the check only ever compares against *other*
-- documents from the same driver going forward.
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_driver_documents_username_hash ON driver_documents (username, file_hash);
