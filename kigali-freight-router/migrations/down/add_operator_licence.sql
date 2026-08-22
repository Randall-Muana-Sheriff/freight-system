-- Removes the operator licence from the accepted types. Any already uploaded
-- would violate the restored constraint, so they go first -- which loses the
-- record that a driver produced one.
--
-- The three vehicle types stay listed. They are historical rows that predate
-- vehicle_documents, and dropping them from the constraint is what took
-- production down when this migration first tried it.
DELETE FROM driver_documents WHERE document_type = 'operator_licence';

ALTER TABLE driver_documents DROP CONSTRAINT IF EXISTS driver_documents_type_check;
ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_type_check
    CHECK (document_type IN (
        'national_id',
        'drivers_license',
        'vehicle_registration',
        'insurance_certificate',
        'roadworthiness_certificate'
    ));
