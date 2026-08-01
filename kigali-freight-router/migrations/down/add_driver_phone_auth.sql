DROP SEQUENCE IF EXISTS staff_id_seq;
ALTER TABLE users DROP COLUMN IF EXISTS full_name;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed_at;
ALTER TABLE users DROP COLUMN IF EXISTS pin_set_at;
ALTER TABLE users DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE users DROP COLUMN IF EXISTS staff_id;
ALTER TABLE users DROP COLUMN IF EXISTS phone_number;
-- Deliberately last, and deliberately NOT wrapped in a NULL-backfill: if
-- any driver row created via the phone-invite flow (password_hash IS
-- NULL) still exists, this fails loudly rather than silently leaving the
-- column nullable or fabricating a fake password hash. Rolling back this
-- migration while such rows exist is a genuine data-model conflict that
-- needs a human decision (delete those rows? assign them a password?),
-- not something a rollback script should paper over.
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
