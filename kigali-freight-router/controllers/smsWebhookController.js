import { appConfig } from '../config/appConfig.js';
import { ok } from '../utils/httpResponse.js';

// Africa's Talking's SMS send API only confirms a message was accepted
// into their sending queue — the real, final outcome (delivered vs.
// rejected by the carrier) is reported later, separately, via this
// callback. Before this existed, a message that got queued successfully
// and later silently rejected looked identical in our own logs to one
// that actually reached the driver's phone (confirmed the hard way: two
// of three real test sends showed "Success" in our logs but "Rejected" on
// Africa's Talking's own dashboard once delivery actually finished).
export const SmsWebhookController = {
    // POST /api/sms/delivery-report — configured as a callback URL in
    // Africa's Talking's dashboard (Settings -> Callback URLs). Always
    // responds 200 regardless of what it finds; a webhook provider like
    // this typically retries on non-2xx, and there's nothing here worth
    // triggering a retry storm over (worst case is one missed log line).
    deliveryReport: async (req, res) => {
        const expectedSecret = appConfig.atDeliveryReportSecret;
        if (expectedSecret && req.query.token !== expectedSecret) {
            console.warn('⚠️ SMS delivery report received with missing/incorrect token — ignoring.');
            return ok(res, { received: true });
        }
        if (!expectedSecret) {
            console.warn('⚠️ AT_DELIVERY_REPORT_SECRET is not set — accepting this delivery report unverified.');
        }

        const { id, status, phoneNumber, failureReason, networkCode } = req.body || {};
        if (String(status).toLowerCase() === 'success') {
            console.log(`[smsService] Delivery confirmed for ${phoneNumber || 'unknown number'} (messageId ${id || 'unknown'}).`);
        } else {
            console.error(
                `❌ SMS delivery failed for ${phoneNumber || 'unknown number'} (messageId ${id || 'unknown'}): ` +
                    `status=${status || 'unknown'}${failureReason ? `, reason=${failureReason}` : ''}${networkCode ? `, network=${networkCode}` : ''}`
            );
        }

        return ok(res, { received: true });
    },
};
