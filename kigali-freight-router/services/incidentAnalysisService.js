import { getAnthropicClient } from '../config/anthropicClient.js';

// Same model choice reasoning as documentAnalysisService.js — this is a
// triage/drafting aid a dispatcher reviews against the driver's own words
// and photo, not a decision-maker, so a mid-tier vision model is the
// right cost/accuracy tradeoff.
const MODEL = 'claude-sonnet-5';

const ANALYSIS_TOOL = {
    name: 'record_incident_analysis',
    description: 'Records structured triage findings for a driver-submitted incident report, and drafts report text when the driver provided little or none.',
    input_schema: {
        type: 'object',
        properties: {
            severity: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description:
                    'low: minor delay or inconvenience, nothing urgent. medium: vehicle issue or non-emergency incident needing dispatcher attention soon. high: possible injury, an active accident scene, or anything suggesting immediate danger — err toward high if genuinely unsure.',
            },
            suspectedInjury: {
                type: 'boolean',
                description: 'True if the photo or text suggests a person may be hurt, even ambiguously. False only when there is a clear reason to rule it out.',
            },
            vehicleDriveable: {
                type: 'boolean',
                description: 'True if the vehicle appears able to continue driving (or nothing suggests otherwise). False if the photo/text indicates it cannot move under its own power.',
            },
            suggestedTitle: {
                type: 'string',
                description: 'A short (under 8 words) title for this report. If the driver already gave one, lightly clean it up rather than replacing its meaning; if they gave none, draft one from the photo/description.',
            },
            summary: {
                type: 'string',
                description:
                    'Written in first person, AS the driver — not a third-party summary of them ("I hit a pothole and my front tire blew out", never "The driver reports..."). 2-4 natural, conversational sentences, like someone quickly texting dispatch what happened, not a formal incident log: plain everyday words, contractions are fine, no corporate or clinical phrasing. Cover what happened, the vehicle/cargo state, and anything urgent, based only on what the photo/text actually shows — don\'t invent details beyond that. If the driver already wrote their own full description, lightly tidy its grammar/flow while keeping their words and voice, rather than rewriting it into something else.',
            },
        },
        required: ['severity', 'suspectedInjury', 'vehicleDriveable', 'suggestedTitle', 'summary'],
    },
};

// The controller races this against a short deadline rather than awaiting
// it outright: a result that arrives in time reaches the driver's own submit
// response (a 'high' severity changes the toast they see), and a late one is
// written to the incident row afterwards. Callers must therefore keep the
// promise rather than abandoning it on timeout. Returns null on any
// failure (missing API key, API error) so a safety report can never be
// blocked by an AI outage — the report itself always saves regardless.
export async function analyzeIncident({ buffer, mimeType, title, description, orderContext }) {
    const client = getAnthropicClient();
    if (!client) return null;

    const textContext = [title, description].filter(Boolean).join('\n\n') || '(no text provided by the driver)';
    // orderContext is looked up server-side against a verified, owned
    // order (see createIncident) — never trust a client-sent cargo
    // description/stage directly, or a driver could make an unrelated
    // report read as if it happened mid-delivery.
    const assignmentContext = orderContext
        ? `They are currently ${orderContext.stage} an order: "${orderContext.cargoDescription}". Weave this into the summary naturally (e.g. mention what they were doing when it happened) if it's relevant to what they reported — don't force it in if the report is clearly unrelated to this job.`
        : 'They have no active assignment right now — do not invent one.';

    const content = [
        {
            type: 'text',
            text: `A driver submitted a safety/incident report. Their own text: "${textContext}". ${assignmentContext} ${buffer ? 'Review the attached photo together with their text.' : 'No photo was attached — work from the text alone.'} Record your findings with the record_incident_analysis tool.`,
        },
    ];
    if (buffer) {
        content.unshift({ type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } });
    }

    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            tools: [ANALYSIS_TOOL],
            tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
            messages: [{ role: 'user', content }],
        });

        const toolUse = response.content.find((block) => block.type === 'tool_use');
        return toolUse ? toolUse.input : null;
    } catch (err) {
        console.error('❌ Incident AI analysis failed:', err.message);
        return null;
    }
}
