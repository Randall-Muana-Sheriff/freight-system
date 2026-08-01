-- Leaves the postgis extension installed (other migrations/tables may
-- depend on it) — only drops what this migration actually created.
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;
