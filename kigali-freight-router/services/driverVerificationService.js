// Shared between driverDocumentController (upload/review) and
// orderController (assignment gating) so the "what counts as verified"
// definition can never drift between the two.
//
// Verification is now three questions, not one:
//   1. Are the driver's own documents approved and unexpired?
//   2. Do they actually have a vehicle?
//   3. Are that vehicle's documents approved and unexpired?
//
// Splitting (1) from (3) is what makes changing vehicle re-qualify a driver
// on its own. The vehicle's papers are attached to the vehicle, so moving
// someone to a different truck immediately means a different set of
// documents is being asked about — there is no separate re-verification
// step that somebody has to remember to trigger.

// Held by the person.
export const DRIVER_DOCUMENT_TYPES = [
    'national_id',
    'drivers_license',
];

// Held by the truck. These used to sit against the driver, which meant they
// travelled with the person when they changed vehicle and kept them cleared
// on paperwork describing a vehicle they were no longer in.
export const VEHICLE_DOCUMENT_TYPES = [
    'vehicle_registration',
    'insurance_certificate',
    'roadworthiness_certificate',
];

// Kept as the union for callers that just want to know what the full set is
// — the driver app's checklist, for instance.
export const REQUIRED_DOCUMENT_TYPES = [...DRIVER_DOCUMENT_TYPES, ...VEHICLE_DOCUMENT_TYPES];

// How long before a document lapses a dispatcher should be told about it.
// Three weeks is enough to get an insurance renewal or an inspection booked
// in Kigali without the driver dropping out of the assignable list first,
// which is the failure this whole warning exists to avoid.
export const EXPIRY_WARNING_DAYS = 21;

// NULL expiry counts as not-expired: it means "no date recorded" rather than
// "expired", and rows approved before expiry tracking existed all look like
// that. Requiring a date on the types that always carry one is a review-time
// rule (see driverDocumentController), not a reason to un-verify drivers
// retroactively on the day this ships.
// Takes the table alias because the vehicle half of the query joins three
// tables and an unqualified expires_at is ambiguous there.
const unexpired = (alias = '') => {
    const col = alias ? `${alias}.expires_at` : 'expires_at';
    return `(${col} IS NULL OR ${col} > NOW())`;
};

// Accepts a pool or an in-transaction client — assignment checks run inside
// a transaction (FOR UPDATE locks already held), so this must be able to
// query through that same client rather than opening a separate connection.
export async function isDriverVerified(queryable, username) {
    const result = await queryable.query(
        `SELECT
             (SELECT COUNT(*)::int
                FROM driver_documents
               WHERE username = $1
                 AND document_type = ANY($2::text[])
                 AND status = 'approved'
                 AND ${unexpired()}) AS driver_ok,
             (SELECT COUNT(*)::int
                FROM vehicle_documents vd
                JOIN fleet_vehicles fv ON fv.id = vd.vehicle_id
                JOIN users u ON u.id = fv.current_driver_id
               WHERE u.username = $1
                 AND fv.status = 'ACTIVE'
                 AND vd.document_type = ANY($3::text[])
                 AND vd.status = 'approved'
                 AND ${unexpired('vd')}) AS vehicle_ok;`,
        [username, DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES]
    );
    const { driver_ok: driverOk, vehicle_ok: vehicleOk } = result.rows[0];
    return driverOk === DRIVER_DOCUMENT_TYPES.length
        && vehicleOk === VEHICLE_DOCUMENT_TYPES.length;
}

// Everything a dispatcher needs to act *before* a driver silently drops out
// of the assignable list.
//
// Without this the expiry rule is worse than no rule from the office's point
// of view: a driver who was available on Tuesday is simply gone on Wednesday
// with nothing on screen saying why. Returns already-lapsed documents and
// those inside the warning window, for drivers and for vehicles, newest
// problem first.
export async function getComplianceIssues(queryable, warningDays = EXPIRY_WARNING_DAYS) {
    const result = await queryable.query(
        `SELECT * FROM (
             SELECT 'driver'          AS holder_kind,
                    dd.username       AS holder,
                    NULL::text        AS plate_number,
                    dd.document_type,
                    dd.expires_at,
                    dd.status
               FROM driver_documents dd
              WHERE dd.status = 'approved'
                AND dd.document_type = ANY($1::text[])
                AND dd.expires_at IS NOT NULL
                AND dd.expires_at < NOW() + ($3 || ' days')::interval
             UNION ALL
             SELECT 'vehicle'         AS holder_kind,
                    u.username        AS holder,
                    fv.plate_number,
                    vd.document_type,
                    vd.expires_at,
                    vd.status
               FROM vehicle_documents vd
               JOIN fleet_vehicles fv ON fv.id = vd.vehicle_id
               LEFT JOIN users u ON u.id = fv.current_driver_id
              WHERE vd.status = 'approved'
                AND vd.document_type = ANY($2::text[])
                AND vd.expires_at IS NOT NULL
                AND vd.expires_at < NOW() + ($3 || ' days')::interval
                AND fv.status = 'ACTIVE'
         ) issues
         ORDER BY expires_at ASC;`,
        [DRIVER_DOCUMENT_TYPES, VEHICLE_DOCUMENT_TYPES, String(warningDays)]
    );
    return result.rows.map((row) => ({
        holderKind: row.holder_kind,
        holder: row.holder,
        plateNumber: row.plate_number,
        documentType: row.document_type,
        expiresAt: row.expires_at,
        expired: new Date(row.expires_at) <= new Date(),
    }));
}
