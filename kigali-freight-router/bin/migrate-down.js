// Rolls back the most-recently-applied migration(s), one at a time, in
// strict reverse order. Usage:
//   node bin/migrate-down.js            (rolls back 1 migration)
//   node bin/migrate-down.js --steps 3  (rolls back the last 3, in order)
//
// Previously there was no rollback mechanism at all — a bad migration
// during a deploy had no scripted way back short of a manual, unscripted
// DB edit. See migrations/down/README.md for which migrations don't have
// (and can't safely have) an automated down file.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseSteps() {
    const flagIndex = process.argv.indexOf('--steps');
    if (flagIndex === -1) return 1;
    const value = parseInt(process.argv[flagIndex + 1], 10);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

async function getLastAppliedMigrations(client, limit) {
    const result = await client.query(
        `SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT $1`,
        [limit]
    );
    return result.rows.map((row) => row.id);
}

async function rollbackOne(client, migrationId) {
    const downPath = path.join(__dirname, '../migrations/down', migrationId);
    if (!fs.existsSync(downPath)) {
        throw new Error(
            `No down migration for "${migrationId}" — see migrations/down/README.md for why, and what to do instead. ` +
            `Stopping here without rolling back anything further.`
        );
    }

    const downSql = fs.readFileSync(downPath, 'utf8');
    await client.query('BEGIN');
    try {
        await client.query(downSql);
        await client.query('DELETE FROM schema_migrations WHERE id = $1', [migrationId]);
        await client.query('COMMIT');
        console.log(`⬇️  Rolled back migration: ${migrationId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

async function runDown() {
    const steps = parseSteps();
    console.log(`🔄 Rolling back the last ${steps} migration(s)...`);

    const client = await pool.connect();
    try {
        const targets = await getLastAppliedMigrations(client, steps);
        if (targets.length === 0) {
            console.log('ℹ️ No applied migrations found — nothing to roll back.');
            return;
        }

        for (const migrationId of targets) {
            await rollbackOne(client, migrationId);
        }

        console.log('✅ Rollback completed.');
    } catch (error) {
        console.error('❌ Rollback failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

runDown();
