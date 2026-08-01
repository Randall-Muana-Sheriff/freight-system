// Shared between driverDocumentController (upload/review) and
// orderController (assignment gating) so the "what counts as verified"
// definition can never drift between the two.
export const REQUIRED_DOCUMENT_TYPES = [
    'national_id',
    'drivers_license',
    'vehicle_registration',
    'insurance_certificate',
    'roadworthiness_certificate',
];

// Accepts a pool or an in-transaction client — assignment checks run inside
// a transaction (FOR UPDATE locks already held), so this must be able to
// query through that same client rather than opening a separate connection.
export async function isDriverVerified(queryable, username) {
    const result = await queryable.query(
        `SELECT COUNT(*)::int AS approved_count
         FROM driver_documents
         WHERE username = $1 AND document_type = ANY($2::text[]) AND status = 'approved';`,
        [username, REQUIRED_DOCUMENT_TYPES]
    );
    return result.rows[0].approved_count === REQUIRED_DOCUMENT_TYPES.length;
}
