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

    client = new Anthropic({ apiKey: appConfig.anthropicApiKey });
    console.log('🤖 Anthropic client initialized — AI-assisted features enabled.');
    return client;
}
