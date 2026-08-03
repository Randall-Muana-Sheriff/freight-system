import { getAnthropicClient } from '../config/anthropicClient.js';

// Not the most powerful/expensive tier on purpose — this is a triage aid
// an admin can double-check against the actual photo, not a compliance
// decision-maker, so a mid-tier vision model is the right cost/accuracy
// tradeoff. Bump this constant (not an env var — there's nothing here a
// deploy-time choice needs to override) if that judgment changes later.
const MODEL = 'claude-sonnet-5';

const ANALYSIS_TOOL = {
    name: 'record_document_analysis',
    description: 'Records structured findings from reviewing a driver compliance document photo.',
    input_schema: {
        type: 'object',
        properties: {
            documentTypeMatches: {
                type: 'boolean',
                description: 'True if the image actually shows the claimed document type (not some other document or an unrelated photo).',
            },
            extractedName: {
                type: 'string',
                description: 'The full name printed on the document, exactly as it appears. Empty string if not legible or not present.',
            },
            nameMatchesAccount: {
                type: 'boolean',
                description: 'True if extractedName reasonably matches the driver account name (allow for minor spelling/order differences). False if extractedName is empty.',
            },
            expiryDate: {
                type: 'string',
                description: 'Expiry/valid-until date printed on the document, formatted YYYY-MM-DD. Empty string if the document has no expiry date or it is not legible.',
            },
            isExpired: {
                type: 'boolean',
                description: 'True only if expiryDate is non-empty and is before the "today" date given in the prompt.',
            },
            legible: {
                type: 'boolean',
                description: 'True if the document text is clearly readable overall (not blurry, cropped, glare-obscured, or too dark).',
            },
            summary: {
                type: 'string',
                description:
                    'A short note (2-4 complete sentences, proper grammar and punctuation, no bullet points, no sentence fragments) written as if a human reviewer were leaving a comment for a colleague to read. Cover anything notable: wrong document type, name mismatch, expiry, legibility. If nothing is wrong, write a brief positive confirmation instead, e.g. "This document appears valid, legible, and matches the account name."',
            },
            confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Overall confidence in this analysis given image quality.',
            },
        },
        required: ['documentTypeMatches', 'extractedName', 'nameMatchesAccount', 'expiryDate', 'isExpired', 'legible', 'summary', 'confidence'],
    },
};

// Fire-and-forget from the controller — returns null on any failure
// (missing API key, API error, malformed response) rather than throwing,
// since this is a review-queue annotation, never something a document
// upload should be blocked by or retried over.
export async function analyzeDriverDocument({ buffer, mimeType, documentLabel, driverFullName }) {
    const client = getAnthropicClient();
    if (!client) return null;

    const today = new Date().toISOString().slice(0, 10);
    const isPdf = mimeType === 'application/pdf';

    try {
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: 1024,
            tools: [ANALYSIS_TOOL],
            tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
            messages: [
                {
                    role: 'user',
                    content: [
                        isPdf
                            ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } }
                            : { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
                        {
                            type: 'text',
                            text: `This file was submitted as a "${documentLabel}" by a driver whose account name is "${driverFullName}". Today's date is ${today}. Review it and record your findings with the record_document_analysis tool.`,
                        },
                    ],
                },
            ],
        });

        const toolUse = response.content.find((block) => block.type === 'tool_use');
        return toolUse ? toolUse.input : null;
    } catch (err) {
        console.error('❌ Document AI analysis failed:', err.message);
        return null;
    }
}
