-- Safe to run: the up-migration copied vehicle paperwork onto vehicles
-- without deleting it from driver_documents, so dropping this table loses
-- only the expiry dates recorded since, not the documents themselves.
DROP TABLE IF EXISTS vehicle_documents CASCADE;

ALTER TABLE driver_documents
    DROP COLUMN IF EXISTS expires_at;
