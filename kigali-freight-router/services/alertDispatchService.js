import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';

// Critical, time-sensitive alerts (safety incidents, driver-reported
// problems, server crashes) that need to reach someone even if nobody has
// the dashboard open. Tries ALERT_WEBHOOK_URL first (a generic ops
// webhook), falling back to Telegram when only that's configured. A no-op
// (besides the console log) when neither is set, same as every other
// optional integration in this app. Extracted out of server.js so
// controllers (incidentController.js) and the process-level crash handler
// can reach it too, not just the telemetry queue.
export async function dispatchExternalAlert(message) {
    console.log(`[INCIDENT TELEMETRY]: ${message}`);
    try {
        if (appConfig.alertWebhookUrl) {
            await fetch(appConfig.alertWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'inzira-router', message }),
            });
            return;
        }

        if (!appConfig.telegramBotToken || !appConfig.telegramChatId) return;

        await fetch(`https://api.telegram.org/bot${appConfig.telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: appConfig.telegramChatId, text: message, parse_mode: 'Markdown' }),
        });
    } catch (err) {
        console.error('❌ Notification dispatch failed:', err.message);
    }
}

// For external alert text only — everywhere else in the app already
// identifies drivers by name, not phone number (driverName/username is
// the phone number for drivers). No caching: this only runs on actual
// alert-worthy transitions (zone entry/exit, incident reports, stale
// signal), never on the telemetry hot path.
export async function getAssetLabelForDriver(driverName) {
    const result = await pool.query(
        `SELECT u.full_name AS "fullName", fv.plate_number AS "plateNumber"
         FROM users u
         LEFT JOIN fleet_vehicles fv ON fv.current_driver_id = u.id
         WHERE u.username = $1
         LIMIT 1;`,
        [driverName]
    );
    const { fullName, plateNumber } = result.rows[0] || {};
    const nameAndPhone = fullName ? `${fullName} (${driverName})` : driverName;
    return plateNumber ? `${nameAndPhone} — Vehicle ${plateNumber}` : nameAndPhone;
}
