-- Any suspended account has to be resolved deliberately before the
-- narrower constraint can go back on, rather than being silently
-- reactivated by a rollback.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));
