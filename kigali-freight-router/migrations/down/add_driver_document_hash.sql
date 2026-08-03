DROP INDEX IF EXISTS idx_driver_documents_username_hash;
ALTER TABLE driver_documents DROP COLUMN IF EXISTS file_hash;
