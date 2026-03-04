/**
 * Shared AI utilities — client init, PII redaction, text cleaning.
 *
 * Single Responsibility: this module owns everything that is shared across
 * all AI service modules. Nothing domain-specific lives here.
 */
import { GoogleGenAI } from '@google/genai';
import type { Resume } from '@resumind/shared';

// Gemini client — single instance for the process
const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.warn('[ai/base] GEMINI_API_KEY is not set. AI features will not work.');
}

export const genAI = new GoogleGenAI({ apiKey: API_KEY || '' });
export const MODEL_NAME = 'gemini-2.5-flash';

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

/** Extract the first valid JSON object from a potentially noisy LLM response. */
export function cleanJsonOutput(text: string): string {
    let cleaned = text.trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned;
}

/** Strip markdown formatting from AI-generated plain-text fields. */
export function stripMarkdown(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/^(VERIFY:|Verify:|Suggestion:|Note:)\s*/i, '')
        .replace(/^[\+\-\*•]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Replace PII in a resume before sending to any AI model. */
export function redactPII(resume: Resume): Resume {
    return {
        ...resume,
        personalInfo: {
            fullName: 'Candidate',
            email: 'redacted@example.com',
            phone: '555-555-5555',
            location: 'Redacted Location',
            linkedin: '',
            website: '',
            github: '',
        },
    };
}
