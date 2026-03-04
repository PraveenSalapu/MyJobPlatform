/**
 * Content generation: cover letters, essay responses, skill standardization.
 *
 * Single Responsibility: this module owns all AI logic related to generating
 * written content for job applications (beyond resume bullets).
 */
import { Type, type Schema } from '@google/genai';
import type { Resume, EssayQuestion, EssayResponse } from '@resumind/shared';
import { formatResumeForToon, SYSTEM_INSTRUCTIONS, PROMPT_TEMPLATES } from '@resumind/shared';
import { genAI, MODEL_NAME, cleanJsonOutput, redactPII } from './base.js';

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

export async function generateCoverLetter(
    resume: Resume,
    jobDescription: string,
    jobTitle: string,
    company: string
): Promise<{ coverLetter: string; companyInsight?: string }> {
    const safeResume = redactPII(resume);
    const resumeToon = formatResumeForToon(safeResume);

    const prompt = `
You are a professional cover letter writer using the TOON technique.

${PROMPT_TEMPLATES.TOON_CONTEXT}

## PHASE 1: INTELLIGENCE GATHERING
Research the company "${company}" using googleSearch to find:
- Recent news, product launches, or funding
- Company mission/values
- Current challenges or initiatives

## PHASE 2: STRATEGIC ALIGNMENT
Find the "Value Bridge" — where the candidate's experience directly addresses a company need.

## PHASE 3: DRAFTING
Write a cover letter with:
- Opening (News Hook): reference a specific, recent company development
- Value Bridge (2-3 paragraphs): connect relevant experience to their needs with metrics
- Cultural Fit Closer: reference company values, end with clear call to action

CANDIDATE RESUME (TOON format):
${resumeToon}

JOB DETAILS:
- Company: ${company}
- Position: ${jobTitle}
- Description: ${jobDescription}

STRICT RULES:
1. Only reference experiences actually in the resume — never invent
2. First person, professional but warm tone
3. 3-4 paragraphs, ~300-400 words
4. No generic phrases like "I believe I would be a great fit"
5. Include specific metrics/accomplishments from the resume

OUTPUT FORMAT (JSON ONLY):
{
  "coverLetter": "string",
  "companyInsight": "string"
}
`;

    const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTIONS.COVER_LETTER_WRITER,
        },
    });

    const text = result.text;
    if (!text) throw new Error('No response from AI');

    let parsed: { coverLetter: string; companyInsight?: string };
    try {
        parsed = JSON.parse(cleanJsonOutput(text));
    } catch {
        throw new Error('Invalid JSON response from AI');
    }

    if (!parsed.coverLetter || typeof parsed.coverLetter !== 'string') {
        throw new Error('AI response missing cover letter content');
    }

    return { coverLetter: parsed.coverLetter, companyInsight: parsed.companyInsight };
}

// ---------------------------------------------------------------------------
// Essay responses
// ---------------------------------------------------------------------------

export async function generateEssayResponses(
    resume: Resume,
    jobDescription: string,
    jobTitle: string,
    company: string,
    questions: EssayQuestion[]
): Promise<EssayResponse[]> {
    const safeResume = redactPII(resume);
    const resumeToon = formatResumeForToon(safeResume);

    const questionsText = questions
        .map(
            (q, i) =>
                `${i + 1}. [ID: ${q.id}] "${q.question}"${q.maxLength ? ` (max ${q.maxLength} characters)` : ''}${q.required ? ' *Required' : ''}`
        )
        .join('\n');

    const schema: Schema = {
        type: Type.OBJECT,
        properties: {
            responses: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questionId: { type: Type.STRING },
                        response: { type: Type.STRING },
                        wordCount: { type: Type.NUMBER },
                        category: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                    },
                    required: ['questionId', 'response', 'wordCount', 'category', 'confidence'],
                },
            },
        },
        required: ['responses'],
    };

    const prompt = `
You are helping a job applicant answer application essay questions.

${PROMPT_TEMPLATES.TOON_CONTEXT}

CANDIDATE RESUME (TOON format):
${resumeToon}

JOB DETAILS:
- Company: ${company}
- Position: ${jobTitle}
- Description: ${jobDescription}

QUESTIONS TO ANSWER:
${questionsText}

INSTRUCTIONS:
1. Answer each question drawing ONLY from the candidate's actual resume experience
2. For behavioral questions use STAR format (Situation, Task, Action, Result)
3. Use "I" not "we"
4. Respect character limits if specified; otherwise 150-250 words per response
5. Classify: behavioral | motivation | technical | culture_fit | career_goals | other
6. Rate confidence (0-100) based on how well the resume supports the answer

OUTPUT FORMAT (JSON ONLY):
{ "responses": [{ "questionId": "string", "response": "string", "wordCount": number, "category": "string", "confidence": number }] }
`;

    const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: schema,
            systemInstruction: SYSTEM_INSTRUCTIONS.ESSAY_WRITER,
        },
    });

    const text = result.text;
    if (!text) throw new Error('No response from AI');

    let parsed: { responses: EssayResponse[] };
    try {
        parsed = JSON.parse(cleanJsonOutput(text));
    } catch {
        throw new Error('Invalid JSON response from AI');
    }

    if (!parsed.responses || !Array.isArray(parsed.responses)) {
        throw new Error('AI response missing responses array');
    }

    return parsed.responses.map(r => ({
        questionId: r.questionId,
        response: r.response,
        wordCount: r.wordCount || r.response.split(/\s+/).length,
        category: r.category || 'other',
        confidence: Math.min(100, Math.max(0, r.confidence || 50)),
    }));
}

// ---------------------------------------------------------------------------
// Skill standardization
// ---------------------------------------------------------------------------

export async function standardizeSkills(
    currentSkills: { category: string; items: string[] }[]
): Promise<{ category: string; items: string[] }[]> {
    const allSkills = currentSkills.flatMap(g => g.items);

    if (allSkills.length === 0) {
        return [
            { category: 'Programming Languages', items: [] },
            { category: 'Cloud & Infrastructure', items: [] },
            { category: 'Frameworks & Architecture', items: [] },
            { category: 'DevOps & AI', items: [] },
            { category: 'Tools & Platforms', items: [] },
        ];
    }

    const prompt = `
You are a Technical Resume Expert.
Organize the following list of technical skills into STRICTLY these 5 categories.

INPUT SKILLS:
${allSkills.join(', ')}

TARGET CATEGORIES (Do not create new ones):
1. Programming Languages
2. Cloud & Infrastructure (AWS, Azure, GCP, Terraform, etc.)
3. Frameworks & Architecture (Spring, React, .NET, Microservices, OOD, etc.)
4. DevOps & AI (Docker, K8s, CI/CD, MLOps, LLMs, etc.)
5. Tools & Platforms (Databases, Testing, IDEs, Jira, etc.)

RULES:
- Assign EVERY input skill to the most relevant category.
- Fix typos and standardize naming (e.g., "Reactjs" -> "React", "aws" -> "AWS").
- Deduplicate items.

OUTPUT FORMAT (JSON ONLY):
{ "standardizedSkills": [{ "category": "string", "items": ["string"] }] }
`;

    const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
    });

    const text = result.text;
    if (!text) throw new Error('No response from AI');

    const parsed = JSON.parse(cleanJsonOutput(text));
    if (!parsed.standardizedSkills || !Array.isArray(parsed.standardizedSkills)) {
        throw new Error('Invalid AI response structure');
    }

    return parsed.standardizedSkills;
}
