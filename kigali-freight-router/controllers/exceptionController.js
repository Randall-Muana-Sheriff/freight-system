// What needs a human, gathered in one place.
//
// A dispatch board that opens on a queue asks the dispatcher to find the
// problem. This is the other way round: sixteen sources of deviation, already
// computed elsewhere in the system, collected and ranked so the first thing
// on screen is the thing that is wrong.
//
// Two severities on purpose, not eight equal categories. `act` means somebody
// must do something now; `watch` means degrading but not yet blocking. If
// everything is an exception then nothing is, and a board that cries wolf
// gets skimmed past exactly like the compliance panel that grew to 2,400px.
//
// Counts are exact and items are capped. The count is what tells you the size
// of the problem; the items are what let you start on it. Nobody works a wall.
import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';

// Matches the threshold fleetController and orderController already use, so
// "stale" means one thing across the system rather than three.
const STALE_SECONDS = 60;
const EXPIRY_WARNING_DAYS = 21;
const ITEMS_PER_GROUP = 5;

// How long an assigned job may sit with a silent phone before dispatch is
// told about it.
//
// Chosen by the operator, not derived from anything, so here is the
// reasoning for whoever revisits it. Too short and every job handed out
// before a driver has picked up their phone raises an alarm, and a board
// that cries wolf gets skimmed. Too long and a driver who never saw the job
// is discovered when the customer rings. Thirty minutes is the operator's
// judgement of how long a Kigali driver might reasonably not look at their
// phone while still being on the job. It was decided on one day's
// information, before any real driver had ever used the system, so it is a
// starting position rather than a finding — expect to move it once there is
// a week of real behaviour to look at.
const ASSIGNED_DARK_MINUTES = 30;

// Order is the ranking. Server-side deliberately: the UI inventing its own
// would drift from what the rest of the system actually enforces, which is
// the same drift that already bit us between adminController and
// isDriverVerified.
const GROUPS = [
    {
        key: 'unplaced_orders',
        label: 'Bookings with nowhere to go',
        severity: 'act',
        // Not merely urgent -- stuck. A public booking arrives as two lines of
        // free text, so until a dispatcher pins it on the map it cannot be
        // assigned, routed, or priced against a real distance.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Booking') AS title,
                     COALESCE(o.pickup_address_text, 'no pickup given') || ' to ' ||
                       COALESCE(o.delivery_address_text, 'no destination given') AS subtitle,
                     o.created_at AS since, NULL::text AS driver
                FROM orders o
               WHERE o.status = 'PENDING' AND (o.pickup_lat IS NULL OR o.delivery_lat IS NULL)
               ORDER BY o.created_at ASC`,
    },
    {
        key: 'unanswered_offers',
        label: 'Offers nobody answered',
        severity: 'act',
        // A customer's freight parked on a phone that went home.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Job') AS title,
                     'Offered to ' || COALESCE(o.assigned_to, 'a driver') || ', never answered' AS subtitle,
                     o.offer_expires_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.status = 'OFFERED' AND o.offer_expires_at IS NOT NULL AND o.offer_expires_at <= NOW()
               ORDER BY o.offer_expires_at ASC`,
    },
    {
        key: 'sign_in_code_undelivered',
        label: 'Drivers who never got their sign-in code',
        severity: 'act',
        // A driver inviting themselves back in is invisible to dispatch: they
        // do it alone, from their own handset, and if the text fails they see
        // a code that never comes while nobody here knows. That is a driver
        // who cannot start their shift, which is why this is `act`.
        //
        // Scoped to codes still unused and still worth reading out: once one
        // is consumed the driver is in, and once it expires reading it out
        // would not help. The window matches the code's own life.
        sql: `SELECT o.id::text AS id, NULL::int AS order_id,
                     COALESCE(u.full_name, o.phone_number) AS title,
                     'Could not text their code — ' || CASE o.sms_status
                         WHEN 'InsufficientBalance'   THEN 'the SMS account is out of credit'
                         WHEN 'InvalidSenderId'       THEN 'the sender ID is being refused'
                         WHEN 'NotConfigured'         THEN 'no SMS provider is set up'
                         WHEN 'Sandbox'               THEN 'sandbox account, texts do not reach Rwanda'
                         WHEN 'SendFailed'            THEN 'the provider could not be reached'
                         WHEN 'UserInBlacklist'       THEN 'they have opted out of our messages'
                         WHEN 'InvalidPhoneNumber'    THEN 'the provider rejected their number'
                         WHEN 'UnsupportedNumberType' THEN 'that number cannot receive texts'
                         ELSE o.sms_status
                     END AS subtitle,
                     o.created_at AS since, o.phone_number AS driver
                FROM otp_codes o
                LEFT JOIN users u ON u.phone_number = o.phone_number AND u.role = 'driver'
               WHERE o.sms_status IS NOT NULL AND o.sms_status <> 'Sent'
                 AND o.consumed_at IS NULL AND o.expires_at > NOW()
               ORDER BY o.created_at ASC`,
    },
    {
        key: 'assigned_driver_dark',
        label: 'Given a job, but their phone has never checked in',
        severity: 'act',
        // Not "this driver is late". The dispatcher cannot tell from here
        // whether the driver is stuck in traffic or has never opened the app
        // and does not know the job exists — and those need the same first
        // move, which is to ring them rather than to wait.
        //
        // The gap this fills: stale_signal only looks at PICKED_UP and
        // IN_TRANSIT. A driver who never opens the app cannot move a job to
        // PICKED_UP, because that takes the app — so the one case where the
        // driver may not know they have work was the one case no board could
        // see.
        //
        // LEFT JOIN with a NULL check, not `updated_at < NOW() - interval`:
        // a driver who has never reported has no driver_locations row at all,
        // and an inner join or a plain age comparison silently excludes
        // exactly the dark phones this exists to catch.
        //
        // The second half of the OR goes slightly beyond "never reported":
        // a driver whose last fix predates the assignment is equally in the
        // dark about this job, and the order not having moved for half an
        // hour means a live phone would have reported since. Catching both
        // is the same question asked properly.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Job') AS title,
                     'Assigned to ' || COALESCE(o.assigned_to, 'a driver') ||
                       ', who may not know they have it — ring them' AS subtitle,
                     o.updated_at AS since, o.assigned_to AS driver
                FROM orders o
                LEFT JOIN driver_locations dl ON dl.driver_name = o.assigned_to
               WHERE o.status = 'ASSIGNED'
                 AND o.assigned_to IS NOT NULL
                 AND o.updated_at < NOW() - make_interval(mins => $1)
                 AND (dl.updated_at IS NULL OR dl.updated_at < o.updated_at)
               ORDER BY o.updated_at ASC`,
        params: [ASSIGNED_DARK_MINUTES],
    },
    {
        key: 'payment_outstanding',
        label: 'Delivered, and nobody has paid',
        severity: 'act',
        // The job is done and the money is not in. With collection at the
        // door this should be rare and immediate — a driver handed the goods
        // over without taking payment, and every hour that passes makes it
        // harder to recover.
        //
        // Deliberately includes jobs that were never priced. An order
        // delivered with price_total NULL is not merely unpaid, it is
        // unbillable — nobody can be asked for a number that was never
        // settled — and price_still_estimate excludes delivered orders, so
        // until now those appeared on no board at all. The subtitle says
        // which of the two it is, because they need different actions: one
        // is a phone call, the other is a price somebody has to work out.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Delivery') AS title,
                     CASE WHEN o.price_total IS NULL
                          THEN 'Delivered and never priced — nothing to bill'
                          ELSE 'Delivered unpaid — ' || o.price_total || ' ' || COALESCE(o.currency, '') END
                       AS subtitle,
                     o.updated_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.status = 'DELIVERED' AND o.payment_status = 'UNPAID'
               ORDER BY o.updated_at ASC`,
    },
    {
        key: 'payment_stuck',
        label: 'Payment prompts nobody answered',
        severity: 'act',
        // A prompt sent to a customer's phone that has neither succeeded nor
        // failed. The sweep resolves these against MTN, so anything still
        // here after half an hour means the sweep is not running or MTN is
        // not answering — and a driver is standing at a gate either way.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Delivery') AS title,
                     'Waiting on the customer''s PIN' AS subtitle,
                     pr.created_at AS since, o.assigned_to AS driver
                FROM payment_requests pr JOIN orders o ON o.id = pr.order_id
               WHERE pr.status = 'PENDING' AND pr.created_at < NOW() - INTERVAL '30 minutes'
               ORDER BY pr.created_at ASC`,
    },
    {
        key: 'cash_not_handed_in',
        label: 'Cash taken and not yet handed in',
        severity: 'act',
        // Cash runs the opposite way to mobile money. On a MoMo job the
        // platform holds the fare and owes the driver their share; on a cash
        // job the driver is holding the whole fare and owes the platform its
        // commission. Nothing chases that on its own, and a debt nobody is
        // tracking is one nobody collects.
        //
        // This is also the record that protects an honest driver. Without it
        // a driver who collected and handed over and one who did not look
        // identical, and the honest one has no way to prove which they were.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.assigned_to, 'a driver') AS title,
                     'Holding ' || COALESCE(o.platform_fee::text, '?') ||
                       COALESCE(' ' || o.currency, '') || ' commission on ' ||
                       COALESCE(o.cargo_description, 'a delivery') AS subtitle,
                     o.cash_collected_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.payment_method = 'CASH' AND o.cash_settled_at IS NULL
               ORDER BY o.cash_collected_at ASC`,
    },
    {
        key: 'settlement_outstanding',
        label: 'Money owed either way after payment',
        severity: 'watch',
        // Detention and the return-leg credit are only known after the charge
        // at the door, so a paid job can end up owing in either direction.
        // The figure is recorded rather than folded into a price already
        // collected; this is where somebody acts on it.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Delivery') AS title,
                     CASE WHEN o.settlement_adjustment > 0
                          THEN 'Customer owes a further ' || o.settlement_adjustment
                          ELSE 'Customer is owed a refund of ' || abs(o.settlement_adjustment) END
                       || ' ' || COALESCE(o.currency, '') AS subtitle,
                     o.updated_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.settlement_adjustment <> 0
               ORDER BY abs(o.settlement_adjustment) DESC`,
    },
    {
        key: 'stalled_at_pickup',
        label: 'At the pickup and not moving',
        severity: 'watch',
        // The gap between the two groups either side of it: stale_signal
        // watches PICKED_UP and IN_TRANSIT, assigned_driver_dark watches
        // ASSIGNED. A driver who reached the collection point and stopped
        // appeared on neither.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Job') AS title,
                     'At the pickup since' AS subtitle,
                     o.updated_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.status = 'AT_PICKUP' AND o.updated_at < NOW() - INTERVAL '2 hours'
               ORDER BY o.updated_at ASC`,
    },
    {
        key: 'assigned_to_nobody',
        label: 'Assigned, with no driver on it',
        severity: 'act',
        // A state that should not exist: the order says it is somebody's and
        // names nobody. Deliberately excluded from assigned_driver_dark,
        // because "ring them" needs somebody to ring — but it still has to be
        // seen, or the job simply sits there being nobody's problem.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Job') AS title,
                     'Marked assigned but no driver is named' AS subtitle,
                     o.updated_at AS since, NULL::text AS driver
                FROM orders o
               WHERE o.status = 'ASSIGNED' AND o.assigned_to IS NULL
               ORDER BY o.updated_at ASC`,
    },
    {
        key: 'delivery_not_confirmed',
        label: 'Arrived but never closed',
        severity: 'act',
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Delivery') AS title,
                     'Driver marked arrived, no confirmation since' AS subtitle,
                     o.updated_at AS since, o.assigned_to AS driver
                FROM orders o
               WHERE o.status = 'ARRIVED' AND o.updated_at < NOW() - INTERVAL '2 hours'
               ORDER BY o.updated_at ASC`,
    },
    {
        key: 'lapsed_documents',
        label: 'Paperwork that has run out',
        severity: 'act',
        // Already expired, not merely expiring. A driver in this group cannot
        // legally be given work and assignment will refuse them.
        sql: `SELECT d.username AS driver, d.id::text AS id, NULL::int AS order_id,
                     d.username AS title,
                     replace(d.document_type, '_', ' ') || ' expired' AS subtitle,
                     d.expires_at AS since
                FROM driver_documents d
               WHERE d.expires_at IS NOT NULL AND d.expires_at < NOW() AND d.status = 'approved'
               UNION ALL
              SELECT NULL, v.id::text, NULL::int,
                     COALESCE(fv.plate_number, 'Vehicle'),
                     replace(v.document_type, '_', ' ') || ' expired',
                     v.expires_at
                FROM vehicle_documents v
                LEFT JOIN fleet_vehicles fv ON fv.id = v.vehicle_id
               WHERE v.expires_at IS NOT NULL AND v.expires_at < NOW() AND v.status = 'approved'
               ORDER BY 6 ASC`,
    },
    {
        key: 'stale_signal',
        label: 'Deliveries with no live position',
        severity: 'watch',
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Delivery') AS title,
                     'No GPS from ' || COALESCE(o.assigned_to, 'the driver') AS subtitle,
                     COALESCE(dl.updated_at, o.updated_at) AS since, o.assigned_to AS driver
                FROM orders o
                LEFT JOIN driver_locations dl ON dl.driver_name = o.assigned_to
               WHERE o.status IN ('PICKED_UP', 'IN_TRANSIT')
                 AND (dl.updated_at IS NULL OR dl.updated_at < NOW() - make_interval(secs => $1))
               ORDER BY 5 ASC NULLS FIRST`,
        params: [STALE_SECONDS],
    },
    {
        key: 'open_defects',
        label: 'Faults reported and still open',
        severity: 'watch',
        sql: `SELECT g.id::text AS id, NULL::int AS order_id,
                     COALESCE(fv.plate_number, g.driver_name, 'Vehicle') AS title,
                     left(g.description, 90) AS subtitle,
                     g.created_at AS since, g.driver_name AS driver
                FROM geofence_alerts g
                LEFT JOIN fleet_vehicles fv ON fv.id = g.vehicle_id
               WHERE g.event_type = 'VEHICLE_DEFECT' AND g.status = 'OPEN'
               ORDER BY g.created_at ASC`,
    },
    {
        key: 'expiring_documents',
        label: 'Paperwork running out soon',
        severity: 'watch',
        sql: `SELECT d.username AS driver, d.id::text AS id, NULL::int AS order_id,
                     d.username AS title,
                     replace(d.document_type, '_', ' ') || ' expires soon' AS subtitle,
                     d.expires_at AS since
                FROM driver_documents d
               WHERE d.expires_at IS NOT NULL AND d.expires_at >= NOW()
                 AND d.expires_at < NOW() + make_interval(days => $1) AND d.status = 'approved'
               UNION ALL
              SELECT NULL, v.id::text, NULL::int,
                     COALESCE(fv.plate_number, 'Vehicle'),
                     replace(v.document_type, '_', ' ') || ' expires soon',
                     v.expires_at
                FROM vehicle_documents v
                LEFT JOIN fleet_vehicles fv ON fv.id = v.vehicle_id
               WHERE v.expires_at IS NOT NULL AND v.expires_at >= NOW()
                 AND v.expires_at < NOW() + make_interval(days => $1) AND v.status = 'approved'
               ORDER BY 6 ASC`,
        params: [EXPIRY_WARNING_DAYS],
    },
    {
        key: 'price_still_estimate',
        label: 'Prices that are not real yet',
        severity: 'watch',
        // The customer was quoted a number worked out from weight alone. It
        // moves the moment the job is placed on the map, so every one of
        // these is a conversation waiting to happen.
        sql: `SELECT o.id AS order_id, o.id::text AS id,
                     COALESCE(o.cargo_description, 'Booking') AS title,
                     'Quoted ' || COALESCE(o.quoted_total::text, '?') || ' ' ||
                       COALESCE(o.currency, 'RWF') || ' before a distance was known' AS subtitle,
                     o.created_at AS since, NULL::text AS driver
                FROM orders o
               WHERE o.price_is_estimate = TRUE
                 AND o.status NOT IN ('DELIVERED', 'CANCELLED')
                 AND o.price_total IS NOT NULL
               ORDER BY o.created_at ASC`,
    },
];

export const ExceptionController = {
    // GET /api/exceptions
    getExceptions: async (req, res) => {
        try {
            const groups = await Promise.all(GROUPS.map(async (group) => {
                const params = group.params || [];
                // Counted and listed in one pass rather than two queries: the
                // count must be exact even though the list is capped, and two
                // round trips could disagree with each other under load.
                const { rows } = await pool.query(
                    `WITH found AS (${group.sql})
                     SELECT (SELECT count(*) FROM found) AS total,
                            f.* FROM found f LIMIT ${ITEMS_PER_GROUP}`,
                    params
                );

                return {
                    key: group.key,
                    label: group.label,
                    severity: group.severity,
                    count: rows.length > 0 ? Number(rows[0].total) : 0,
                    items: rows.map((r) => ({
                        id: r.id,
                        title: r.title,
                        subtitle: r.subtitle,
                        since: r.since,
                        orderId: r.order_id ?? undefined,
                        driver: r.driver ?? undefined,
                    })),
                };
            }));

            // Empty groups are dropped rather than sent as zeroes. A home that
            // lists eight headings with nothing under them reads as a form,
            // not as a warning.
            return ok(res, {
                generatedAt: new Date().toISOString(),
                groups: groups.filter((g) => g.count > 0),
            });
        } catch (error) {
            logError(req, 'Exception roll-up failed', error);
            return fail(res, { status: 500, code: 'EXCEPTIONS_FAILED', message: 'Could not gather what needs attention.' });
        }
    },
};
