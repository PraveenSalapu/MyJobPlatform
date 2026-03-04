/**
 * ATS scoring.
 *
 * Single Responsibility: this module owns all AI logic related to scoring
 * resume-to-job compatibility.
 */
import type { MatchScoreResponse, Resume } from '@resumind/shared';
import { formatResumeForToon, PROMPT_TEMPLATES } from '@resumind/shared';
import { genAI, MODEL_NAME, cleanJsonOutput, redactPII } from './base.js';

export async function calculateATSScore(resume: Resume, jobDescription: string): Promise<MatchScoreResponse> {
    const safeResume = redactPII(resume);
    const resumeToon = formatResumeForToon(safeResume);

    const prompt = `
Compare the following Resume and Job Description.

${PROMPT_TEMPLATES.TOON_CONTEXT}

RESUME (TOON format):
${resumeToon}

JOB DESCRIPTION (Context/URL):
${jobDescription}

Task:
1. **Verify Job**: If the 'Job Description' is a URL or incomplete, use 'googleSearch' to find the full text.
2. **Score**: Provide a compatibility score (0-100).
3. **Analyze**: Identify missing keywords and provide critical feedback.

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure:
{
  "score": number,
  "missingKeywords": ["string"],
  "criticalFeedback": "string"
}
`;

    const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
    });

    const text = result.text;
    if (!text) throw new Error('No response from AI');

    let parsed: MatchScoreResponse;
    try {
        parsed = JSON.parse(cleanJsonOutput(text));
    } catch {
        throw new Error('Invalid JSON response from AI');
    }

    if (
        typeof parsed.score !== 'number' ||
        !Array.isArray(parsed.missingKeywords) ||
        typeof parsed.criticalFeedback !== 'string'
    ) {
        throw new Error('AI response has invalid field types');
    }

    return {
        score: Math.min(100, Math.max(0, parsed.score)),
        missingKeywords: parsed.missingKeywords.filter((k: unknown) => typeof k === 'string'),
        criticalFeedback: parsed.criticalFeedback,
    };
}
