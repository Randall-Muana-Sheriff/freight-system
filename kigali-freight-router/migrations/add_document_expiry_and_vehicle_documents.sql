-- Compliance documents expire, and three of the five never belonged to the
-- driver in the first place.
--
-- Two problems with the original driver_documents design, both of which show
-- up as the same failure in the yard: a driver the system swears is verified
-- carrying cargo on paperwork that is no longer valid.
--
-- 1. There was no expiry. isDriverVerified asked only whether a row said
--    'approved', so a driver cleared in January still counted in December on
--    insurance that lapsed in June. In freight the compliance document that
--    causes trouble is almost never the missing one — it is the lapsed one,
--    because insurance runs annually and roadworthiness on six to twelve
--    months. "The system said he was verified" is not a defence after an
--    accident on expired cover.
--
-- 2. Registration, insurance and roadworthiness describe a *vehicle*. Held
--    against the driver, they followed the person: move a driver to a
--    different truck and their old truck's papers came along and kept them
--    verified on a vehicle whose documents nobody had ever seen. Held against
--    the vehicle, the same move re-qualifies the driver automatically —
--    the new truck's documents are the ones that now count, with no separate
--    re-verification step to remember to run.
--
-- National ID and driver's licence stay with the driver, which is where they
-- belong.

-- ── Expiry ────────────────────────────────────────────────────────────────
-- Nullable on purpose. A national ID may genuinely not expire in a way this
-- system needs to track, and back-filling a guessed date on documents already
-- approved would be inventing compliance data. NULL means "no expiry
-- recorded" and is treated as not-expired; the reviewer sets a date when they
-- approve, and the types that always carry one are enforced in the service
-- layer rather than here, so existing rows stay loadable.
ALTER TABLE driver_documents
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── Vehicle-held documents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_documents (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    expires_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Which driver's phone the file came from. Kept because the upload still
    -- happens in the driver app — the driver is standing next to the truck —
    -- even though the document now belongs to the vehicle.
    uploaded_by VARCHAR(255) REFERENCES users(username) ON DELETE SET NULL,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    -- Parity with the columns driver_documents picked up in later
    -- migrations, so upload handling is the same code path for both: the
    -- duplicate-photo check needs file_hash, and the document analysis
    -- writes into ai_analysis.
    file_hash VARCHAR(64),
    ai_analysis JSONB,
    ai_analyzed_at TIMESTAMPTZ,
    -- Same reasoning as driver_documents: a re-upload after rejection is an
    -- upsert, not a growing pile of attempts.
    UNIQUE (vehicle_id, document_type)
);

ALTER TABLE vehicle_documents
    DROP CONSTRAINT IF EXISTS vehicle_documents_type_check;
ALTER TABLE vehicle_documents
    ADD CONSTRAINT vehicle_documents_type_check
    CHECK (document_type IN (
        'vehicle_registration',
        'insurance_certificate',
        'roadworthiness_certificate'
    ));

ALTER TABLE vehicle_documents
    DROP CONSTRAINT IF EXISTS vehicle_documents_status_check;
ALTER TABLE vehicle_documents
    ADD CONSTRAINT vehicle_documents_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_expiry ON vehicle_documents (expires_at) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_driver_documents_expiry ON driver_documents (expires_at) WHERE status = 'approved';

-- ── Carry existing paperwork across ───────────────────────────────────────
-- Every vehicle-type document already approved is attached to the vehicle its
-- uploader currently drives, so nobody who is verified today is un-verified by
-- this migration purely because the data moved.
--
-- A driver with no vehicle assigned has nowhere to put theirs. Those rows stay
-- where they are and that driver reads as unverified until an admin assigns a
-- vehicle and the documents are uploaded against it — which is the correct
-- answer, because a driver with no truck should not be receiving loads either.
--
-- The source rows in driver_documents are deliberately left in place rather
-- than deleted. This migration is then reversible without data loss, and the
-- rows are simply no longer read: the service layer stops asking
-- driver_documents about vehicle types. Clearing them out is a separate
-- decision to take once this has run in production for a while.
INSERT INTO vehicle_documents (
    vehicle_id, document_type, file_url, status, rejection_reason,
    uploaded_at, uploaded_by, reviewed_by, reviewed_at, file_hash
)
SELECT DISTINCT ON (fv.id, dd.document_type)
    fv.id, dd.document_type, dd.file_url, dd.status, dd.rejection_reason,
    dd.uploaded_at, dd.username, dd.reviewed_by, dd.reviewed_at, dd.file_hash
FROM driver_documents dd
JOIN users u ON u.username = dd.username
JOIN fleet_vehicles fv ON fv.current_driver_id = u.id
WHERE dd.document_type IN (
    'vehicle_registration',
    'insurance_certificate',
    'roadworthiness_certificate'
)
-- If two drivers have somehow both been pointed at one vehicle, the most
-- recently uploaded paperwork is the one that describes it now.
ORDER BY fv.id, dd.document_type, dd.uploaded_at DESC
ON CONFLICT (vehicle_id, document_type) DO NOTHING;
