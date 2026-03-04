import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import {
    tailorResume,
    calculateATSScore,
    optimizeBulletPoint,
    generateEssayResponses,
    generateCoverLetter,
    standardizeSkills,
} from '../services/gemini.js';
import { generateEmbedding, cosineSimilarity, similarityToScore } from '../services/embedding.js';
import { deductCredits, ensureAndRefillCredits } from './credits.js';
import type { Resume, EssayQuestion } from '@resumind/shared';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
    message: { error: 'Too many AI requests. Please wait a moment and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const expensiveAiRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
    message: { error: 'Rate limit exceeded for AI generation. Please wait a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const profileOrDataSchema = z.object({
    profileId: z.string().uuid().optional(),
    jobDescription: z.string().min(10, 'Job description too short'),
    resumeData: z.any().optional(),
});

const coverLetterSchema = profileOrDataSchema.extend({
    jobTitle: z.string().min(2, 'Job title required'),
    company: z.string().min(1, 'Company name required'),
});

const essaySchema = z.object({
    profileId: z.string().uuid('Invalid profile ID'),
    jobDescription: z.string().min(50, 'Job description too short'),
    jobTitle: z.string().min(2, 'Job title required'),
    company: z.string().min(1, 'Company name required'),
    questions: z
        .array(
            z.object({
                id: z.string(),
                question: z.string().min(5, 'Question too short'),
                fieldSelector: z.string(),
                maxLength: z.number().optional(),
                required: z.boolean().optional(),
            })
        )
        .min(1, 'At least one question required')
        .max(10, 'Maximum 10 questions per request'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve resume data from either inline payload or profile DB lookup. */
async function resolveResume(
    profileId: string | undefined,
    resumeData: unknown,
    userId: string
): Promise<Resume | null> {
    if (resumeData) return resumeData as Resume;

    if (profileId) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('data')
            .eq('id', profileId)
            .eq('user_id', userId)
            .single();

        if (error || !profile) return null;
        return profile.data as Resume;
    }

    return null;
}

/**
 * Check credit balance BEFORE making the AI call.
 * Returns true if the user has enough credits; sends 403 and returns false otherwise.
 *
 * Credits are deducted via deductCredits() only AFTER the AI call succeeds
 * (charge-on-success). This ensures users are never charged for API failures.
 */
async function hasEnoughCredits(userId: string, cost: number, res: Response): Promise<boolean> {
    const current = await ensureAndRefillCredits(userId);
    if (current < cost) {
        res.status(403).json({
            error: `Insufficient credits (Cost: ${cost}, Balance: ${current})`,
        });
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// POST /api/tailor/generate — Main resume tailoring
// ---------------------------------------------------------------------------

router.post('/generate', expensiveAiRateLimit, async (req: Request, res: Response) => {
    const COST = 30;
    const userId = req.userId!;

    const validation = profileOrDataSchema.safeParse(req.body);
    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    const resume = await resolveResume(
        validation.data.profileId,
        validation.data.resumeData,
        userId
    );
    if (!resume) {
        res.status(400).json({ error: 'Must provide either profileId or resumeData' });
        return;
    }

    // Check balance before calling AI — no deduction yet
    if (!(await hasEnoughCredits(userId, COST, res))) return;

    try {
        const tailorResponse = await tailorResume(resume, validation.data.jobDescription);
        // Deduct only after success
        await deductCredits(userId, COST);
        res.json(tailorResponse);
    } catch (error) {
        // AI failed — no charge
        console.error('[tailor] Tailoring error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to tailor resume',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/score — ATS score
// ---------------------------------------------------------------------------

router.post('/score', aiRateLimit, async (req: Request, res: Response) => {
    const COST = 10;
    const userId = req.userId!;

    const validation = profileOrDataSchema.safeParse(req.body);
    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    const resume = await resolveResume(
        validation.data.profileId,
        validation.data.resumeData,
        userId
    );
    if (!resume) {
        res.status(400).json({ error: 'Must provide either profileId or resumeData' });
        return;
    }

    if (!(await hasEnoughCredits(userId, COST, res))) return;

    try {
        const scoreResponse = await calculateATSScore(resume, validation.data.jobDescription);
        await deductCredits(userId, COST);
        res.json({ success: true, data: scoreResponse });
    } catch (error) {
        console.error('[tailor] ATS score error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to calculate ATS score',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/optimize-bullet — Bullet point optimization
// ---------------------------------------------------------------------------

router.post('/optimize-bullet', aiRateLimit, async (req: Request, res: Response) => {
    const COST = 5;
    const userId = req.userId!;

    const validation = z
        .object({ bullet: z.string().min(5, 'Bullet too short') })
        .safeParse(req.body);
    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    if (!(await hasEnoughCredits(userId, COST, res))) return;

    try {
        const suggestions = await optimizeBulletPoint(validation.data.bullet);
        await deductCredits(userId, COST);
        res.json({ success: true, data: suggestions });
    } catch (error) {
        console.error('[tailor] Optimize bullet error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to optimize bullet point',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/cover-letter — Cover letter generation
// ---------------------------------------------------------------------------

router.post('/cover-letter', expensiveAiRateLimit, async (req: Request, res: Response) => {
    const COST = 15;
    const userId = req.userId!;

    const validation = coverLetterSchema.safeParse(req.body);
    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    const resume = await resolveResume(
        validation.data.profileId,
        validation.data.resumeData,
        userId
    );
    if (!resume) {
        res.status(400).json({ error: 'Must provide either profileId or resumeData' });
        return;
    }

    if (!(await hasEnoughCredits(userId, COST, res))) return;

    try {
        const result = await generateCoverLetter(
            resume,
            validation.data.jobDescription,
            validation.data.jobTitle,
            validation.data.company
        );
        await deductCredits(userId, COST);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[tailor] Cover letter error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate cover letter',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/essays — Essay response generation
// ---------------------------------------------------------------------------

router.post('/essays', expensiveAiRateLimit, async (req: Request, res: Response) => {
    const userId = req.userId!;

    const validation = essaySchema.safeParse(req.body);
    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    const { profileId, jobDescription, jobTitle, company, questions } = validation.data;
    const COST = questions.length * 5;

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('data')
        .eq('id', profileId)
        .eq('user_id', userId)
        .single();

    if (error || !profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
    }

    if (!(await hasEnoughCredits(userId, COST, res))) return;

    try {
        const responses = await generateEssayResponses(
            profile.data as Resume,
            jobDescription,
            jobTitle,
            company,
            questions as EssayQuestion[]
        );
        await deductCredits(userId, COST);
        res.json({ success: true, responses });
    } catch (error) {
        console.error('[tailor] Essay generation error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate essay responses',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/vector-match — Semantic match via embeddings (no credit cost)
// ---------------------------------------------------------------------------

router.post('/vector-match', aiRateLimit, async (req: Request, res: Response) => {
    const validation = z
        .object({
            resumeText: z.string().min(50, 'Resume text too short'),
            jobDescription: z.string().min(50, 'Job description too short'),
        })
        .safeParse(req.body);

    if (!validation.success) {
        res.status(400).json({ error: validation.error.errors[0].message });
        return;
    }

    try {
        const [resumeVector, jobVector] = await Promise.all([
            generateEmbedding(validation.data.resumeText),
            generateEmbedding(validation.data.jobDescription),
        ]);

        const similarity = cosineSimilarity(resumeVector, jobVector);
        const score = similarityToScore(similarity);

        res.json({ success: true, score, similarity });
    } catch (error) {
        console.error('[tailor] Vector match error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to calculate vector match',
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/tailor/standardize-skills — AI skill reorganization (no credit cost)
// ---------------------------------------------------------------------------

router.post('/standardize-skills', aiRateLimit, async (req: Request, res: Response) => {
    const { skills } = req.body;

    if (!skills || !Array.isArray(skills)) {
        res.status(400).json({ error: 'Invalid skills data provided' });
        return;
    }

    try {
        const standardized = await standardizeSkills(skills);
        res.json({ skills: standardized });
    } catch (error) {
        console.error('[tailor] Standardize skills error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to standardize skills',
        });
    }
});

export default router;
