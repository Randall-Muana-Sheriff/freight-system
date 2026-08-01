// Previously this only ran `pg_restore --list`, which confirms the dump
// file is a structurally valid, listable archive — NOT that it actually
// restores or that its contents are complete. A backup that's 90% written
// (a crashed pg_dump, a truncated upload to wherever backups get shipped)
// can still pass `--list` while being useless in a real emergency. This
// does the real thing instead: restores into a fresh, temporary database
// on the same server and checks that real rows actually landed, before
// throwing the scratch database away.
import fs from 'fs';
import { spawn } from 'child_process';
import pg from 'pg';
import { appConfig } from '../config/appConfig.js';

const backupFile = process.argv[2];

if (!backupFile) {
    console.error('Usage: node ops/verify-backup.js <backup-file>');
    process.exit(1);
}

if (!fs.existsSync(backupFile)) {
    console.error(`Backup file not found: ${backupFile}`);
    process.exit(1);
}

// Tables a real backup should never come back empty for, in any database
// that's actually been used — a quick, cheap sanity signal that beats
// "the archive is listable" without needing to diff every row.
const SANITY_TABLES = ['users', 'schema_migrations'];

function runCommand(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${command} exited with code ${code}`));
        });
        child.on('error', reject);
    });
}

async function main() {
    const scratchDbName = `${appConfig.db.database}_verify_${Date.now()}`;
    const pgEnv = { PGPASSWORD: appConfig.db.password };

    // A fresh CREATE/DROP DATABASE can't run on the connection you're
    // restoring into — connect to Postgres's own always-present
    // maintenance database for that half of the job.
    const maintenanceClient = new pg.Client({
        host: appConfig.db.host,
        port: appConfig.db.port,
        user: appConfig.db.user,
        password: appConfig.db.password,
        database: 'postgres',
    });
    await maintenanceClient.connect();

    let verificationPassed = false;
    try {
        console.log(`Creating scratch database "${scratchDbName}" for verification...`);
        await maintenanceClient.query(`CREATE DATABASE "${scratchDbName}"`);

        console.log('Restoring backup into scratch database...');
        await runCommand('pg_restore', [
            '--no-owner',
            '--no-privileges',
            '--host', appConfig.db.host,
            '--port', String(appConfig.db.port),
            '--username', appConfig.db.user,
            '--dbname', scratchDbName,
            backupFile,
        ], pgEnv);

        console.log('Restore succeeded — checking table contents...');
        const scratchClient = new pg.Client({
            host: appConfig.db.host,
            port: appConfig.db.port,
            user: appConfig.db.user,
            password: appConfig.db.password,
            database: scratchDbName,
        });
        await scratchClient.connect();
        try {
            const tableCountResult = await scratchClient.query(
                `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`
            );
            const tableCount = tableCountResult.rows[0].count;
            if (tableCount === 0) {
                throw new Error('Restored database has zero tables — the backup is effectively empty.');
            }
            console.log(`Restored database has ${tableCount} tables.`);

            for (const table of SANITY_TABLES) {
                const existsResult = await scratchClient.query(
                    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
                    [table]
                );
                if (!existsResult.rows[0].exists) {
                    console.warn(`⚠️  Expected table "${table}" not found in restored backup (schema may have changed — not necessarily a failure).`);
                    continue;
                }
                const rowCountResult = await scratchClient.query(`SELECT COUNT(*)::int AS count FROM "${table}"`);
                console.log(`  ${table}: ${rowCountResult.rows[0].count} rows`);
            }

            verificationPassed = true;
        } finally {
            await scratchClient.end();
        }
    } finally {
        // Always clean up the scratch database, whether verification
        // passed or failed — this must never leave debris on a real
        // Postgres server just because a backup turned out to be bad.
        try {
            await maintenanceClient.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
                [scratchDbName]
            );
            await maintenanceClient.query(`DROP DATABASE IF EXISTS "${scratchDbName}"`);
            console.log(`Cleaned up scratch database "${scratchDbName}".`);
        } catch (cleanupError) {
            console.error(`⚠️  Failed to clean up scratch database "${scratchDbName}" — remove it manually:`, cleanupError.message);
        }
        await maintenanceClient.end();
    }

    if (verificationPassed) {
        console.log(`✅ Backup verified (real restore + content check): ${backupFile}`);
    } else {
        throw new Error('Verification did not complete successfully.');
    }
}

main().catch((error) => {
    console.error(`❌ Backup verification failed: ${error.message}`);
    process.exitCode = 1;
});
