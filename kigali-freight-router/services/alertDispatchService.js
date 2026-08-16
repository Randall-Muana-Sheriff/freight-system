import pool from '../config/db.js';
import { appConfig } from '../config/appConfig.js';

// Every alert falls into exactly one of these — including its own
// resolved/all-clear message, so e.g. a GPS-restored notice is tagged the
// same [GPS] as the signal-lost one that preceded it. Without this, three
// completely different alert types (geofence exit, GPS restored, delivery
// confirmed) all rendered as an identical "✅ RESOLVED:" line in Telegram,
// indistinguishable without reading the full body. One bot/chat for
// everything was a deliberate choice (a bot per category was considered
// and rejected as overkill for now) — this is what makes that workable.
export const ALERT_CATEGORY = {
    SAFETY: 'SAFETY',
    GPS: 'GPS',
    DELIVERY: 'DELIVERY',
    INCIDENT: 'INCIDENT',
    SYSTEM: 'SYSTEM',
    // A sales enquiry from the public site's contact form. Not an
    // emergency, but it reaches a human the same way, because otherwise it
    // reaches nobody at all.
    ENQUIRY: 'ENQUIRY',
};

// Critical, time-sensitive alerts (safety incidents, driver-reported
// problems, server crashes) that need to reach someone even if nobody has
// the dashboard open. Tries ALERT_WEBHOOK_URL first (a generic ops
// webhook), falling back to Telegram when only that's configured. A no-op
// (besides the console log) when neither is set, same as every other
// optional integration in this app. Extracted out of server.js so
// controllers (incidentController.js) and the process-level crash handler
// can reach it too, not just the telemetry queue.
// Telegram's legacy Markdown treats these as syntax, and an unbalanced one
// makes the API reject the whole message — which the catch below would
// swallow, losing the alert silently. Everything the app writes itself is
// safe; anything a customer typed is not, so interpolate it through here.
export function escapeAlertText(value) {
    return String(value ?? '').replace(/([_*`\[])/g, '\\$1');
}

export async function dispatchExternalAlert(message, category) {
    // A hashtag, not a `[SAFETY]`-style bracket tag: square brackets collide
    // with Telegram's Markdown link syntax (`[text](url)`) under
    // parse_mode: 'Markdown' — confirmed by testing, the bracketed tag was
    // silently stripped from the delivered message. A hashtag sidesteps
    // that entirely and is a genuine upgrade: Telegram renders #SAFETY as
    // tappable, and tapping it opens in-chat search filtered to every other
    // message carrying that same tag — real filtering, not just a label.
    const taggedMessage = category ? `#${category} ${message}` : message;
    console.log(`[INCIDENT TELEMETRY]: ${taggedMessage}`);
    try {
        if (appConfig.alertWebhookUrl) {
            await fetch(appConfig.alertWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'inzira-router', category: category || null, message }),
            });
            return;
        }

        if (!appConfig.telegramBotToken || !appConfig.telegramChatId) return;

        await fetch(`https://api.telegram.org/bot${appConfig.telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: appConfig.telegramChatId, text: taggedMessage, parse_mode: 'Markdown' }),
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
