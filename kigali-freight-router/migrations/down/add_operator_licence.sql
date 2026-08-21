-- Removes the operator licence from the accepted types. Any already uploaded
-- would violate the restored constraint, so they go first -- which loses the
-- record that a driver produced one, and means every partner driver has to
-- upload it again if this is ever rolled forward.
DELETE FROM driver_documents WHERE document_type = 'operator_licence';

ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_type_check;
ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_type_check
    CHECK (document_type IN ('national_id', 'drivers_license'));
