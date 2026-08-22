-- The licence that makes carrying goods for money legal.
--
-- RURA licenses goods transport, and its own wording covers "companies and
-- cooperatives as well as individual operators" -- so an independent driver
-- brought onto this platform needs one in their own name. RURA also runs
-- campaigns and enforcement against unlicensed operators, which means the
-- risk is not theoretical: an unlicensed vehicle carrying a customer's cargo
-- is a load that can be stopped, and a platform that dispatched it.
--
-- It sits with the person rather than the vehicle. The other five split
-- cleanly -- an ID and a licence belong to the driver, registration and
-- insurance and roadworthiness belong to the truck -- and this one is
-- permission to operate as a carrier, which is granted to the operator. That
-- also means it travels with a driver who changes vehicle, which is right:
-- being licensed to carry goods is not a fact about which truck they are in.
-- Widened, not narrowed. The first version of this dropped the three vehicle
-- types from the list on the grounds that they had moved to vehicle_documents
-- and no code path could write them here any more -- which was true, and which
-- I checked against a local database that had none of them. Production had
-- three, left behind by the migration that did the moving, so the constraint
-- could not be rebuilt and the router crash-looped on boot until this was
-- corrected. Tidying up a list is not worth an outage, and those rows are a
-- separate question from adding a document type.
ALTER TABLE driver_documents
    DROP CONSTRAINT IF EXISTS driver_documents_type_check;

ALTER TABLE driver_documents
    ADD CONSTRAINT driver_documents_type_check
    CHECK (document_type IN (
        'national_id',
        'drivers_license',
        'operator_licence',
        -- Historical. Vehicle paperwork lives in vehicle_documents now and
        -- isVehicleDoc routes every upload there, but rows written before that
        -- split still exist and the constraint has to keep admitting them.
        'vehicle_registration',
        'insurance_certificate',
        'roadworthiness_certificate'
    ));
