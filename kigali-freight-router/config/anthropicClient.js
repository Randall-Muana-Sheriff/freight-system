import Anthropic from '@anthropic-ai/sdk';
import { appConfig } from './appConfig.js';

// Shared across every AI-assisted feature (document analysis first, more
// to follow) so there's one credential and one init path to reason about,
// not one per feature. Same "optional, never fatal" shape as
// firebaseAdmin.js — callers get `null` back when ANTHROPIC_API_KEY isn't
// set and must treat that as "AI features disabled" rather than crashing
// whatever real action (a document upload, an incident report) they're
// attached to.
let client = null;
let initAttempted = false;

export function getAnthropicClient() {
    if (initAttempted) return client;
    initAttempted = true;

    if (!appConfig.anthropicApiKey) {
        return null;
    }

    // The SDK's own defaults are a 10-minute timeout and 2 retries, which
    // together can hold a request open for half an hour. That is survivable
    // for document review (fire-and-forget, nobody is waiting) but not for
    // incident reporting, where a driver watches the submit button until
    // this returns. Bounded here so no AI feature can ever inherit the
    // unbounded default; the driver-facing path narrows it further still
    // (ANALYSIS_DRIVER_DEADLINE_MS in incidentController).
    client = new Anthropic({
        apiKey: appConfig.anthropicApiKey,
        timeout: 30_000,
        maxRetries: 1,
    });
    console.log('🤖 Anthropic client initialized — AI-assisted features enabled.');
    return client;
}
