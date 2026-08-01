-- A driver whose signup was approved can log in, but that's not the same
-- as being road-cleared to actually carry cargo — this table tracks the 5
-- required compliance documents (national ID, driver's license, vehicle
-- registration, insurance, roadworthiness certificate) a driver must
-- upload and have an admin approve before assignOrderBundle/reassignOrder
-- will ever hand them a job. UNIQUE(username, document_type) means a
-- re-upload after rejection is an upsert, not a growing history of
-- attempts.
CREATE TABLE IF NOT EXISTS driver_documents (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (username, document_type)
);

ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_type_check
    CHECK (document_type IN (
        'national_id',
        'drivers_license',
        'vehicle_registration',
        'insurance_certificate',
        'roadworthiness_certificate'
    ));

ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_driver_documents_username ON driver_documents (username);
