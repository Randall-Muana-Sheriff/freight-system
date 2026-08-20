// Sentry initialisation. Loaded via `node --import ./instrument.js` so it
// runs before server.js imports Express, pg or http — Sentry v8+ patches
// those libraries at import time, and anything already imported when init()
// runs is simply never instrumented.
//
// A no-op when SENTRY_DSN is unset, which is the default everywhere except
// production: local development, CI and anyone who clones this public repo
// get no reporting destination and no behaviour change.
//
// This complements the Telegram alerts in alertDispatchService.js rather
// than replacing them. Telegram is for the loud, act-now events a person
// should see on their phone; it carries one line and no stack, keeps no
// history, and cannot group twenty occurrences of the same fault into one
// thing. Sentry is the record: full stack, request context, which release,
// how often, since when.
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { scrubTree } from './utils/redaction.js';
import { buildInfo } from './config/buildInfo.js';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
    Sentry.init({
        dsn,

        // From build-info.json, the same source /health reports, so an
        // error and a health check can never disagree about which commit is
        // running. Not process.env.GIT_COMMIT: that is a *build* argument
        // baked into the image, absent from the runtime environment — the
        // first version read it and every production event was tagged
        // "unknown", which is exactly the attribution this is for.
        release: buildInfo.commit !== 'unknown' ? buildInfo.commit : undefined,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',

        // Off by default in the SDK, set explicitly because the default is
        // the kind of thing that changes in a major version. This service
        // handles phone numbers, delivery addresses, driver PINs and OTP
        // codes; none of it belongs in an error tracker, and Rwanda's Law
        // No. 058/2021 makes that a legal position rather than a taste.
        sendDefaultPii: false,

        // Errors are captured regardless of this; it governs only
        // performance tracing. 10% is enough to see a slow endpoint without
        // paying to trace every telemetry ping.
        tracesSampleRate: 0.1,

        beforeSend(event) {
            return scrubTree(event);
        },
    });
    console.log(`[sentry] initialised for release ${buildInfo.commit.slice(0, 7)}.`);
} else {
    console.log('[sentry] SENTRY_DSN not set — error reporting disabled.');
}

// The redaction rules live in utils/redaction.js with their own tests. They
// were a loose regex inline here until it was caught redacting `error_code`
// — the most useful tag on a server-fault report — for containing "code".
export { isSensitiveKey } from './utils/redaction.js';
export { Sentry };
