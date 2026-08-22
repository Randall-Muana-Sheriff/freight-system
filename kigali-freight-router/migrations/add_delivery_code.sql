-- Proof that the handover reached the right person.
--
-- Delivery is proved today by a photograph, and a photograph shows a parcel
-- somewhere. It does not show who took it, or that anyone did. A code the
-- recipient reads off their own phone does: they had to be present, and they
-- had to be the person the order was addressed to.
--
-- It also unblocks a driver without a smartphone. Every driver surface here
-- assumes a camera, and only about a third of Rwandans own a smartphone at
-- all -- so proof-of-delivery is one of the two things standing between this
-- system and a driver working it from a feature phone.
--
-- Photo-or-code, not code-instead-of-photo. An app driver keeps taking the
-- picture and nothing about their day changes; a driver with no camera can
-- close a job on the code alone. Which was used is recorded, because a
-- customer disputing a delivery deserves to be told what the evidence
-- actually is rather than being handed the word "confirmed".
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_code_hash TEXT,
    ADD COLUMN IF NOT EXISTS delivery_code_sent_at TIMESTAMPTZ,
    -- Four digits is 10,000 combinations, which is only safe because guessing
    -- is capped. Four rather than six because this gets read aloud at a gate,
    -- often over a running engine, and every extra digit is another chance to
    -- mishear and another retry burnt.
    ADD COLUMN IF NOT EXISTS delivery_code_attempts SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE delivery_confirmations
    ADD COLUMN IF NOT EXISTS proof_method TEXT;

-- photo_url has been NOT NULL since this table existed, which is exactly the
-- rule that makes a camera compulsory. A code-only confirmation has no photo
-- to store, so the column has to allow its absence -- with a CHECK making sure
-- that absence is deliberate rather than a confirmation with no evidence at
-- all behind it.
ALTER TABLE delivery_confirmations ALTER COLUMN photo_url DROP NOT NULL;

ALTER TABLE delivery_confirmations
    DROP CONSTRAINT IF EXISTS delivery_confirmations_has_proof;
ALTER TABLE delivery_confirmations
    ADD CONSTRAINT delivery_confirmations_has_proof
    CHECK (photo_url IS NOT NULL OR proof_method IN ('code', 'photo+code'));

COMMENT ON COLUMN orders.delivery_code_hash IS
    'SHA-256 of the recipient''s handover code, never the code itself -- the same treatment otp_codes gives a sign-in code, and for the same reason.';
COMMENT ON COLUMN orders.delivery_code_attempts IS
    'Wrong guesses. Capped, because four digits is only safe if it cannot be brute-forced; past the cap a photo is the only way left to close the job.';
COMMENT ON COLUMN delivery_confirmations.proof_method IS
    'photo, code, or photo+code. What a dispute is actually resting on.';
