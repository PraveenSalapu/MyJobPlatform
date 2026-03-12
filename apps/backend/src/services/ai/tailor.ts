/**
 * Resume tailoring and bullet-point optimization.
 *
 * Single Responsibility: this module owns all AI logic related to rewriting
 * resume content to match a specific job description.
 */
import type { TailorResponse, Resume } from '@resumind/shared';
import { formatResumeForToon, SYSTEM_INSTRUCTIONS, PROMPT_TEMPLATES } from '@resumind/shared';
import { genAI, MODEL_NAME, cleanJsonOutput, stripMarkdown, redactPII } from './base.js';
import { Type, type Schema } from '@google/genai';

// ---------------------------------------------------------------------------
// Bullet-point optimization
// ---------------------------------------------------------------------------

export async function optimizeBulletPoint(bullet: string): Promise<string[]> {
    try {
        const schema: Schema = {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'List of 3 improved bullet point variations.',
        };

        const prompt = `
You are an expert Resume Writer.
Rewrite the following resume bullet point to be impact-oriented and ATS-friendly.

Original Bullet: "${bullet}"

STRICT RULES:
1. Use the "Action + Context + Result" framework.
2. Start with a STRONG action verb (e.g., Spearheaded, Engineered, Orchestrated).
3. QUANTIFY results wherever possible (use numbers, %, $).
4. Remove vague language. Be specific and concise.
5. Provide 3 distinct variations:
   - Option 1: Quantified / Metrics Focus
   - Option 2: Strategic / Impact Focus
   - Option 3: Concise / Technical Focus
`;

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: schema },
        });

        const text = result.text;
        if (!text) return [bullet];
        return JSON.parse(text) as string[];
    } catch (error) {
        console.error('[ai/tailor] optimizeBulletPoint error:', error);
        return [bullet];
    }
}

// ---------------------------------------------------------------------------
// Full resume tailoring
// ---------------------------------------------------------------------------

export async function tailorResume(resume: Resume, jobDescription: string): Promise<TailorResponse> {
    const safeResume = redactPII(resume);
    const resumeToon = formatResumeForToon(safeResume);

    const prompt = `
You are an expert Resume Strategist and Career Coach.
You are analyzing a resume (in TOON format) against a target Job Description (JD).

${PROMPT_TEMPLATES.TOON_CONTEXT}

RESUME (TOON format):
${resumeToon}

JOB DESCRIPTION (Context/URL):
${jobDescription}

TASK:
1. **Analyze the JD**: Extract the top 10 critical hard skills, "lingo" (keywords), and key technologies.
2. **Auto-Inject Keywords (Semantic Weaving)**: Rewrite existing bullets that describe matching tasks to use exact JD keywords.
3. **Suggest "Gap-Bridging" Bullets**: Write 3 NEW bullet points the candidate likely did but forgot to list.
4. **Prune Irrelevance**: Identify 2-3 bullet points that are weak, generic, or irrelevant to this JD.
5. **Suggest Portfolio Projects**: Suggest 2-3 IMPRESSIVE projects the candidate could add.

CRITICAL FORMATTING RULES:
- NEVER use markdown formatting (no **bold**, no *italic*, no \`code\`)
- Write all text in plain format
- Use plain quotes (" ") not smart quotes

OUTPUT FORMAT (JSON ONLY):
{
  "company": "string",
  "jobTitle": "string",
  "tailoredSummary": "string",
  "missingHardSkills": [{ "name": "string", "category": "string" }],
  "reasoning": "string",
  "improvedExperience": [
    {
      "experienceId": "string",
      "revisedBullets": [{ "original": "string", "new": "string", "reason": "string" }],
      "suggestedAdditions": [{ "bullet": "string", "reason": "string" }],
      "bulletsToDrop": [{ "original": "string", "reason": "string" }]
    }
  ],
  "projectSuggestions": [
    { "title": "string", "description": "string", "technologies": ["string"], "reason": "string" }
  ]
}
`;

    const result = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: SYSTEM_INSTRUCTIONS.RESUME_EXPERT,
        },
    });

    const text = result.text;
    if (!text) throw new Error('No response from AI');

    let parsed: TailorResponse;
    try {
        parsed = JSON.parse(cleanJsonOutput(text));
    } catch {
        throw new Error('Invalid JSON response from AI');
    }

    if (!parsed.tailoredSummary || !Array.isArray(parsed.missingHardSkills) || !parsed.reasoning) {
        throw new Error('AI response missing required fields');
    }

    return {
        company: stripMarkdown(parsed.company || 'Unknown Company'),
        jobTitle: stripMarkdown(parsed.jobTitle || 'Target Role'),
        tailoredSummary: stripMarkdown(parsed.tailoredSummary),
        missingHardSkills: (parsed.missingHardSkills || []).map(s => ({
            name: stripMarkdown(s.name),
            category: stripMarkdown(s.category),
        })),
        reasoning: stripMarkdown(parsed.reasoning),
        improvedExperience: (parsed.improvedExperience || []).map(exp => ({
            experienceId: exp.experienceId,
            revisedBullets: (exp.revisedBullets || []).map(b => ({
                original: stripMarkdown(b.original),
                new: stripMarkdown(b.new),
                reason: stripMarkdown(b.reason),
            })),
            suggestedAdditions: (exp.suggestedAdditions || []).map(b => ({
                bullet: stripMarkdown(b.bullet),
                reason: stripMarkdown(b.reason),
            })),
            bulletsToDrop: (exp.bulletsToDrop || []).map(b => ({
                original: stripMarkdown(b.original),
                reason: stripMarkdown(b.reason),
            })),
        })),
        projectSuggestions: (parsed.projectSuggestions || []).map(p => ({
            title: stripMarkdown(p.title),
            description: stripMarkdown(p.description),
            technologies: (p.technologies || []).map(stripMarkdown),
            reason: stripMarkdown(p.reason),
        })),
    };
}
