// A dispatcher's own named filters over the board.
//
// Every query here is scoped to req.user.username, taken from the verified
// token and never from the request body. These are private to the person who
// saved them: two dispatchers sharing a desk should not see, overwrite or
// delete each other's views.
import pool from '../config/db.js';
import { ok, fail } from '../utils/httpResponse.js';
import { logError } from '../utils/logger.js';

const MAX_NAME_LENGTH = 60;
// The filter is opaque to this service, which means nothing here constrains
// what a client can put in it. These two bounds are what stop an authenticated
// client using the table as free storage: a filter is a handful of facets, not
// a document, and nobody has fifty useful saved views.
const MAX_FILTER_BYTES = 4096;
const MAX_VIEWS_PER_USER = 50;

export const SavedViewController = {
    // GET /api/saved-views
    list: async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, name, filter, updated_at FROM saved_views
                  WHERE username = $1 ORDER BY name ASC`,
                [req.user.username]
            );
            return ok(res, rows);
        } catch (error) {
            logError(req, 'Listing saved views failed', error);
            return fail(res, { status: 500, code: 'SAVED_VIEWS_LIST_FAILED', message: 'Could not load your saved views.' });
        }
    },

    // POST /api/saved-views  { name, filter }
    //
    // Saving over a name replaces it. A dispatcher who saves "overdue" twice
    // means the second one, not two rows both called overdue.
    create: async (req, res) => {
        try {
            const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
            const filter = req.body?.filter;

            if (!name) {
                return fail(res, { status: 400, code: 'SAVED_VIEWS_NAME_REQUIRED', message: 'Give the view a name.' });
            }
            if (name.length > MAX_NAME_LENGTH) {
                return fail(res, { status: 400, code: 'SAVED_VIEWS_NAME_TOO_LONG', message: `Keep the name under ${MAX_NAME_LENGTH} characters.` });
            }
            // An array is an object to typeof, and a filter that is a list has
            // no shape the board can read back.
            if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
                return fail(res, { status: 400, code: 'SAVED_VIEWS_FILTER_INVALID', message: 'The filter must be an object.' });
            }
            if (Buffer.byteLength(JSON.stringify(filter), 'utf8') > MAX_FILTER_BYTES) {
                return fail(res, { status: 400, code: 'SAVED_VIEWS_FILTER_TOO_LARGE', message: 'That filter is too large to save.' });
            }

            // Counted before inserting, and only when the name is new -- saving
            // over an existing view adds nothing and must not be refused for
            // being at the limit.
            const { rows: [existing] } = await pool.query(
                `SELECT id FROM saved_views WHERE username = $1 AND name = $2`,
                [req.user.username, name]
            );
            if (!existing) {
                const { rows: [{ count }] } = await pool.query(
                    `SELECT COUNT(*)::int AS count FROM saved_views WHERE username = $1`,
                    [req.user.username]
                );
                if (count >= MAX_VIEWS_PER_USER) {
                    return fail(res, {
                        status: 400,
                        code: 'SAVED_VIEWS_LIMIT_REACHED',
                        message: `You already have ${MAX_VIEWS_PER_USER} saved views. Delete one first.`,
                    });
                }
            }

            const { rows } = await pool.query(
                `INSERT INTO saved_views (username, name, filter) VALUES ($1, $2, $3::jsonb)
                 ON CONFLICT (username, name)
                 DO UPDATE SET filter = EXCLUDED.filter, updated_at = NOW()
                 RETURNING id, name, filter, updated_at`,
                [req.user.username, name, JSON.stringify(filter)]
            );
            return ok(res, rows[0], { status: existing ? 200 : 201 });
        } catch (error) {
            logError(req, 'Saving a view failed', error);
            return fail(res, { status: 500, code: 'SAVED_VIEWS_SAVE_FAILED', message: 'Could not save that view.' });
        }
    },

    // DELETE /api/saved-views/:id
    remove: async (req, res) => {
        try {
            // The username is part of the WHERE, not a check after the fact:
            // somebody else's view is not found rather than forbidden. A 403
            // would confirm the id exists, which is a thing worth not saying.
            const { rows } = await pool.query(
                `DELETE FROM saved_views WHERE id = $1 AND username = $2 RETURNING id`,
                [req.params.id, req.user.username]
            );
            if (rows.length === 0) {
                return fail(res, { status: 404, code: 'SAVED_VIEWS_NOT_FOUND', message: 'That view no longer exists.' });
            }
            return ok(res, { id: rows[0].id });
        } catch (error) {
            logError(req, 'Deleting a saved view failed', error);
            return fail(res, { status: 500, code: 'SAVED_VIEWS_DELETE_FAILED', message: 'Could not delete that view.' });
        }
    },
};
