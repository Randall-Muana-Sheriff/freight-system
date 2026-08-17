-- "This person no longer works here."
--
-- There was no way to say it. An admin could change a role, reset a PIN
-- and revoke live sessions, but nothing stopped the account logging back
-- in a minute later. Deleting the row was never the answer: orders
-- reference assigned_to, order_status_logs records who changed what,
-- incidents and delivery confirmations carry the driver's name. That
-- history has to stay answerable after an accident or a dispute, so the
-- account stays and is disabled instead.
--
-- users.status already existed with pending/approved/rejected and every
-- row sat on 'approved' — the mechanism was half-built and never wired to
-- anything. This adds the missing value.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));
