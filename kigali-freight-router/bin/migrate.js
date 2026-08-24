import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOW_DESTRUCTIVE_BASELINE = process.env.ALLOW_DESTRUCTIVE_BASELINE === '1';
// Kept as a direct env read (not importing config/appConfig.js) so this
// standalone script doesn't pull in appConfig's required-env-var checks
// (JWT_SECRET etc.) that have nothing to do with running a migration.
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST, 10) || 10;

const MIGRATIONS = [
    { id: 'init_spatial_baseline.sql', destructive: false },
    { id: 'create_users.sql', destructive: false },
    { id: 'add_full_schema.sql', destructive: false },
    { id: 'create_geofences.sql', destructive: false },
    { id: 'add_geofence_speed_limit.sql', destructive: false },
    { id: 'consolidate_roles.sql', destructive: false },
    { id: 'add_push_tokens.sql', destructive: false },
    { id: 'fix_refresh_tokens_schema.sql', destructive: false },
    { id: 'fix_refresh_tokens_drop_user_id.sql', destructive: false },
    { id: 'add_delivery_confirmations.sql', destructive: false },
    { id: 'fix_order_status_constraint.sql', destructive: false },
    { id: 'add_capacity_and_integrity.sql', destructive: false },
    { id: 'add_delivery_flag_and_consignee.sql', destructive: false },
    { id: 'add_incident_status.sql', destructive: false },
    { id: 'create_vehicle_types.sql', destructive: false },
    { id: 'add_user_status.sql', destructive: false },
    { id: 'create_driver_documents.sql', destructive: false },
    { id: 'add_driver_phone_auth.sql', destructive: false },
    { id: 'add_driver_invites.sql', destructive: false },
    { id: 'add_otp_codes.sql', destructive: false },
    { id: 'add_driver_document_hash.sql', destructive: false },
    { id: 'add_driver_document_ai_analysis.sql', destructive: false },
    { id: 'add_incident_photo_and_ai_triage.sql', destructive: false },
    { id: 'add_kiosk_devices.sql', destructive: false },
    { id: 'add_kiosk_devices_last_seen.sql', destructive: false },
    { id: 'add_totp_mfa.sql', destructive: false },
    { id: 'add_dispatch_settings.sql', destructive: false },
    { id: 'add_order_priority.sql', destructive: false },
    { id: 'add_driver_safety_checklists.sql', destructive: false },
    { id: 'add_public_orders.sql', destructive: false },
    { id: 'add_user_suspension.sql', destructive: false },
    { id: 'add_order_needed_by.sql', destructive: false },
    { id: 'add_trips_and_stops.sql', destructive: false },
    { id: 'retire_delivery_stops.sql', destructive: false },
    // Must run after add_full_schema (fleet_vehicles) and
    // create_driver_documents: it reads both to move vehicle paperwork onto
    // the vehicle it describes.
    { id: 'add_document_expiry_and_vehicle_documents.sql', destructive: false },
    { id: 'add_telemetry_speed.sql', destructive: false },
    { id: 'add_vehicle_defects.sql', destructive: false },
    { id: 'add_pricing.sql', destructive: false },
    { id: 'add_pricing_calibration.sql', destructive: false },
    { id: 'add_pricing_route_factors.sql', destructive: false },
    { id: 'add_route_corridors.sql', destructive: false },
    { id: 'add_order_detention.sql', destructive: false },
    { id: 'add_pickup_detention.sql', destructive: false },
    { id: 'add_backfill_credit.sql', destructive: false },
    { id: 'add_operator_licence.sql', destructive: false },
    { id: 'add_job_offers.sql', destructive: false },
    { id: 'add_currency_and_market.sql', destructive: false },
    { id: 'add_delivery_code.sql', destructive: false },
    { id: 'add_place_hints.sql', destructive: false },
    { id: 'add_otp_delivery_status.sql', destructive: false },
    { id: 'add_saved_views.sql', destructive: false },
    { id: 'add_location_check_unknown.sql', destructive: false },
    { id: 'add_momo_payments.sql', destructive: false },
    { id: 'add_one_pending_payment_per_order.sql', destructive: false },
    { id: 'add_settlement_adjustment.sql', destructive: false },
    { id: 'add_cash_collection.sql', destructive: false },
    { id: 'add_return_leg_taper.sql', destructive: false },
];

const LEGACY_DESTRUCTIVE_MIGRATION = 'init_spatial.sql';

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function tableExists(client, tableName) {
    const result = await client.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [tableName]
    );
    return result.rows[0]?.exists === true;
}

async function bootstrapIfNeeded(client) {
    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
    const appliedCount = countResult.rows[0]?.count || 0;
    if (appliedCount > 0) return;

    // Existing deployments predate migration tracking. If baseline tables exist,
    // mark only the destructive baseline migration as applied and keep additive
    // migrations runnable.
    const hasOrders = await tableExists(client, 'orders');
    const hasHubs = await tableExists(client, 'hubs');
    if (hasOrders && hasHubs) {
        await client.query(
            `INSERT INTO schema_migrations (id)
             VALUES ($1), ($2)
             ON CONFLICT (id) DO NOTHING`,
            ['init_spatial_baseline.sql', 'init_spatial.sql']
        );
        console.log('ℹ️ Existing schema detected; baseline migration marked as applied.');
    }
}

async function getAppliedMigrations(client) {
    const result = await client.query('SELECT id FROM schema_migrations');
    return new Set(result.rows.map((row) => row.id));
}

async function applyMigration(client, migrationId) {
    const migrationPath = path.join(__dirname, '../migrations', migrationId);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    try {
        await client.query(migrationSql);
        await client.query(
            `INSERT INTO schema_migrations (id)
             VALUES ($1)
             ON CONFLICT (id) DO NOTHING`,
            [migrationId]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied migration: ${migrationId}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
}

async function seedHubs(client) {
    const hasHubs = await tableExists(client, 'hubs');
    if (!hasHubs) return;

    console.log('🌱 Seeding Kigali distribution hubs...');
    await client.query(`
        INSERT INTO hubs (name, code, coordinates)
        VALUES
        (
            'Nyabugogo Central Bus & Logistics Hub',
            'KGL-NYB',
            ST_SetSRID(ST_MakePoint(30.0435, -1.9398), 4326)
        ),
        (
            'Kimironko Commercial Market Hub',
            'KGL-KMR',
            ST_SetSRID(ST_MakePoint(30.1256, -1.9448), 4326)
        ),
        (
            'Gikondo Industrial Warehousing Hub',
            'KGL-GKD',
            ST_SetSRID(ST_MakePoint(30.0840, -1.9788), 4326)
        )
        ON CONFLICT (name) DO NOTHING;
    `);
    console.log('🚀 Hub seeding successful: Nyabugogo, Kimironko, and Gikondo online.');
}

// Self-signup only ever creates 'driver' accounts (role elevation is
// admin-only), so a fresh deployment has no way to reach the admin API at
// all without this. Set ADMIN_USERNAME/ADMIN_PASSWORD to have one ensured
// on every migration run; leave them unset to skip this entirely. Safe to
// re-run: no-ops once any admin account exists.
async function seedAdmin(client) {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminUsername || !adminPassword) return;

    const existingAdmin = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (existingAdmin.rows.length > 0) return;

    console.log(`🔑 No admin account exists yet; bootstrapping "${adminUsername}"...`);
    const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_COST);
    await client.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (username) DO NOTHING`,
        [adminUsername, passwordHash]
    );
    console.log(`✅ Bootstrap admin account ready: ${adminUsername}`);
}

async function runMigration() {
    console.log('🔄 Running database migrations...');
    
    const client = await pool.connect();
    try {
        await ensureMigrationTable(client);
        await bootstrapIfNeeded(client);
        const appliedMigrations = await getAppliedMigrations(client);

        for (const migration of MIGRATIONS) {
            if (appliedMigrations.has(migration.id)) continue;
            await applyMigration(client, migration.id);
        }

        if (ALLOW_DESTRUCTIVE_BASELINE && !appliedMigrations.has(LEGACY_DESTRUCTIVE_MIGRATION)) {
            await applyMigration(client, LEGACY_DESTRUCTIVE_MIGRATION);
            console.log('⚠️ Applied legacy destructive baseline migration by explicit opt-in.');
        }

        await seedHubs(client);
        await seedAdmin(client);
        console.log('✅ Migration run completed.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();