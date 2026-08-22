// Sends SMS via Africa's Talking when AT_API_KEY/AT_USERNAME are configured.
// Until then (no account set up yet), this logs the message to the server
// console instead of failing — the entire OTP/invite flow stays fully
// testable end-to-end via `docker compose logs router` before real SMS
// credentials exist, and swapping in real credentials later requires no
// other code changes.
let smsClient = null;

function getSmsClient() {
    const apiKey = process.env.AT_API_KEY;
    const username = process.env.AT_USERNAME;
    if (!apiKey || !username) return null;

    if (!smsClient) {
        // Lazy import: avoids requiring the dependency to even resolve
        // correctly in environments that never configure it.
        smsClient = import('africastalking').then(({ default: AfricasTalking }) =>
            AfricasTalking({ apiKey, username }).SMS
        );
    }
    return smsClient;
}

// Africa's Talking's sandbox reports "Success" at the API level for
// basically any destination, but only ever *actually* delivers to Kenyan
// Airtel test numbers — for anything else (including real Rwandan numbers)
// it accepts and simulates the send without a real carrier ever seeing it.
// A "successful" sandbox response is therefore not proof the driver's
// phone will ever see the text, so while on sandbox this always logs the
// code too, regardless of what the API reported. A live/production AT
// account (a non-"sandbox" username) really does deliver on success, so
// there the code is only logged as a fallback when sending actually fails.
const isSandbox = () => (process.env.AT_USERNAME || '').toLowerCase() === 'sandbox';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Africa's Talking has been observed rejecting a call with 401 and then
// succeeding on an identical retry a minute later against the same key —
// that's not an invalid-credential problem (those fail every time), it
// looks like a transient issue on their end. One quick retry costs nothing
// on the happy path and recovers the flaky case instead of immediately
// giving up and falling back to the log-only path.
async function sendWithRetry(sms, payload, attempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await sms.send(payload);
        } catch (error) {
            lastError = error;
            if (attempt < attempts) {
                await sleep(500);
            }
        }
    }
    throw lastError;
}

export async function sendSms(phoneNumber, message) {
    const clientPromise = getSmsClient();
    if (!clientPromise) {
        console.log(`[smsService] AT_API_KEY/AT_USERNAME not set — logging instead of sending. To ${phoneNumber}: ${message}`);
        return { sent: false, logged: true };
    }

    try {
        const sms = await clientPromise;
        const senderId = process.env.AT_SENDER_ID || undefined;
        const response = await sendWithRetry(sms, { to: [phoneNumber], message, ...(senderId ? { from: senderId } : {}) });

        // The API call not throwing only means Africa's Talking accepted
        // the HTTP request — actual per-recipient outcome (accepted for
        // delivery vs. rejected for insufficient balance, an unregistered
        // sender ID, a blacklisted number, etc.) is a separate field
        // inside a 200 response. Treating "didn't throw" as "delivered"
        // meant a real rejection here would have looked identical to
        // success in every log we had.
        const recipient = response?.SMSMessageData?.Recipients?.[0];
        if (recipient && recipient.status !== 'Success') {
            console.error(`❌ SMS rejected for ${phoneNumber}: ${recipient.status} (code ${recipient.statusCode})`);
            console.log(`[smsService] Falling back to log. To ${phoneNumber}: ${message}`);
            return { sent: false, logged: true, reason: recipient.status };
        }

        console.log(`[smsService] Sent to ${phoneNumber} — messageId ${recipient?.messageId ?? 'unknown'}, cost ${recipient?.cost ?? 'unknown'}.`);

        // The sandbox charges a cost and reports Success, but only Kenyan
        // Airtel numbers ever receive anything — no Rwandan handset will.
        // So this reports sent: false. `sent` has one meaning to its two
        // callers, both of which put it on a screen: a handset will get
        // this. Returning true here would make the driver app tell a
        // tester to check their messages for a text that cannot arrive,
        // which is the precise failure the flag exists to prevent.
        if (isSandbox()) {
            console.log(`[smsService] Sandbox reported success, but only Kenyan Airtel numbers actually receive it — logging too. To ${phoneNumber}: ${message}`);
            return { sent: false, logged: true, reason: 'sandbox' };
        }
        return { sent: true, logged: false };
    } catch (error) {
        console.error(`❌ SMS send failed for ${phoneNumber}:`, error.message);
        console.log(`[smsService] Falling back to log. To ${phoneNumber}: ${message}`);
        return { sent: false, logged: true };
    }
}
