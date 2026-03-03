import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';
import { tailorResume, calculateATSScore, optimizeBulletPoint, generateEssayResponses, generateCoverLetter, standardizeSkills } from '../services/gemini.js';
import { deductCredits } from './credits.js';
import type { Resume, EssayQuestion } from '@resumind/shared';

const router: Router = Router();

// Rate limiting for AI operations (free tier protection)
// These limits help protect Gemini API quota on free tier
const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // 5 AI requests per minute per user
  keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
  message: { error: 'Too many AI requests. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limit for expensive operations (tailoring, cover letters)
const expensiveAiRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minute window
  max: 10, // 10 expensive operations per 5 minutes
  keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
  message: { error: 'Rate limit exceeded for AI generation. Please wait a few minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Lazy-initialized Supabase client
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
  }
  return _supabase;
}

// Apply authentication to all routes
router.use(authenticateToken);

// Validation schemas
const tailorSchema = z.object({
  profileId: z.string().uuid().optional(),
  jobDescription: z.string().min(10, 'Job description too short'),
  resumeData: z.any().optional(),
});

const atsScoreSchema = z.object({
  profileId: z.string().uuid().optional(),
  jobDescription: z.string().min(10, 'Job description too short'),
  resumeData: z.any().optional(), // Allow passing raw resume data
});

// ...

// POST /api/tailor/generate - Main Resume Tailoring
router.post('/generate', expensiveAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    // Deduct 30 credits for Full Tailoring
    if (!userId || !(await deductCredits(userId, 30))) {
      res.status(403).json({ error: 'Insufficient credits (Cost: 30)' });
      return;
    }

    const validation = tailorSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { profileId, jobDescription, resumeData } = validation.data;
    let resume: Resume;

    if (resumeData) {
      resume = resumeData;
    } else if (profileId) {
      // Fetch profile from DB
      const { data: profile, error } = await getSupabase()
        .from('profiles')
        .select('data')
        .eq('id', profileId)
        .eq('user_id', userId)
        .single();

      if (error || !profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      resume = profile.data as Resume;
    } else {
      res.status(400).json({ error: 'Must provide either profileId or resumeData' });
      return;
    }

    // Call AI service
    const tailorResponse = await tailorResume(resume, jobDescription);

    res.json(tailorResponse);

  } catch (error) {
    console.error('Tailoring error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to tailor resume'
    });
  }
});

// POST /api/tailor/score - Calculate ATS score
router.post('/score', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    // Deduct 10 credits for Analysis
    if (!userId || !(await deductCredits(userId, 10))) {
      res.status(403).json({ error: 'Insufficient credits (Cost: 10)' });
      return;
    }

    const validation = atsScoreSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { profileId, jobDescription, resumeData } = validation.data;
    let resume: Resume;

    if (resumeData) {
      // Use provided resume data (for real-time tailoring)
      resume = resumeData;
    } else if (profileId) {
      // Fetch profile from DB
      const { data: profile, error } = await getSupabase()
        .from('profiles')
        .select('data')
        .eq('id', profileId)
        .eq('user_id', userId)
        .single();

      if (error || !profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      resume = profile.data as Resume;
    } else {
      res.status(400).json({ error: 'Must provide either profileId or resumeData' });
      return;
    }

    // Call AI service
    const scoreResponse = await calculateATSScore(resume, jobDescription);

    res.json({
      success: true,
      data: scoreResponse,
    });
  } catch (error) {
    console.error('ATS score error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to calculate ATS score'
    });
  }
});

// POST /api/tailor/optimize-bullet - Optimize a single bullet point
router.post('/optimize-bullet', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const optimizeSchema = z.object({
      bullet: z.string().min(5, 'Bullet too short'),
    });

    const validation = optimizeSchema.safeParse(req.body);

    // Deduct 5 credits for Bullet Optimization
    const userId = req.userId;
    if (!userId || !(await deductCredits(userId, 5))) {
      res.status(403).json({ error: 'Insufficient credits (Cost: 5)' });
      return;
    }

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { bullet } = validation.data;

    // Call AI service
    const suggestions = await optimizeBulletPoint(bullet);

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    console.error('Optimize bullet error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to optimize bullet point'
    });
  }
});

import { generateEmbedding, cosineSimilarity, similarityToScore } from '../services/embedding.js';

// Validation schema for cover letter generation
const coverLetterSchema = z.object({
  profileId: z.string().uuid().optional(),
  jobDescription: z.string().min(10, 'Job description too short'),
  jobTitle: z.string().min(2, 'Job title required'),
  company: z.string().min(1, 'Company name required'),
  resumeData: z.any().optional(),
});

// POST /api/tailor/cover-letter - Generate AI cover letter
router.post('/cover-letter', expensiveAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    // Deduct 15 credits for Cover Letter generation
    if (!userId || !(await deductCredits(userId, 15))) {
      res.status(403).json({ error: 'Insufficient credits (Cost: 15)' });
      return;
    }

    const validation = coverLetterSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { profileId, jobDescription, jobTitle, company, resumeData } = validation.data;
    let resume: Resume;

    if (resumeData) {
      resume = resumeData;
    } else if (profileId) {
      // Fetch profile from DB
      const { data: profile, error } = await getSupabase()
        .from('profiles')
        .select('data')
        .eq('id', profileId)
        .eq('user_id', userId)
        .single();

      if (error || !profile) {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
      resume = profile.data as Resume;
    } else {
      res.status(400).json({ error: 'Must provide either profileId or resumeData' });
      return;
    }

    // Call AI service
    const result = await generateCoverLetter(resume, jobDescription, jobTitle, company);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Cover letter generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate cover letter'
    });
  }
});

// Validation schema for essay generation
const essayGenerateSchema = z.object({
  profileId: z.string().uuid('Invalid profile ID'),
  jobDescription: z.string().min(50, 'Job description too short'),
  jobTitle: z.string().min(2, 'Job title required'),
  company: z.string().min(1, 'Company name required'),
  questions: z.array(z.object({
    id: z.string(),
    question: z.string().min(5, 'Question too short'),
    fieldSelector: z.string(),
    maxLength: z.number().optional(),
    required: z.boolean().optional(),
  })).min(1, 'At least one question required').max(10, 'Maximum 10 questions per request'),
});

// POST /api/tailor/essays - Generate AI essay responses for job application questions
router.post('/essays', expensiveAiRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const validation = essayGenerateSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { profileId, jobDescription, jobTitle, company, questions } = validation.data;

    // Deduct credits: 5 credits per question
    const creditCost = questions.length * 5;
    if (!userId || !(await deductCredits(userId, creditCost))) {
      res.status(403).json({ error: `Insufficient credits (Cost: ${creditCost})` });
      return;
    }

    // Fetch profile from DB
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('data')
      .eq('id', profileId)
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const resume = profile.data as Resume;

    // Call AI service
    const responses = await generateEssayResponses(
      resume,
      jobDescription,
      jobTitle,
      company,
      questions as EssayQuestion[]
    );

    res.json({
      success: true,
      responses,
    });
  } catch (error) {
    console.error('Essay generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate essay responses'
    });
  }
});

// POST /api/tailor/vector-match - Calculate semantic match score using Vectors
router.post('/vector-match', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const vectorMatchSchema = z.object({
      resumeText: z.string().min(50, 'Resume text too short'),
      jobDescription: z.string().min(50, 'Job Description too short'),
    });

    const validation = vectorMatchSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { resumeText, jobDescription } = validation.data;

    // Generate Embeddings Parallelly
    const [resumeVector, jobVector] = await Promise.all([
      generateEmbedding(resumeText),
      generateEmbedding(jobDescription)
    ]);

    const similarity = cosineSimilarity(resumeVector, jobVector);
    const score = similarityToScore(similarity);

    // console.log('Vector Match:', { similarity, score });

    res.json({
      success: true,
      score,
      similarity
    });

  } catch (error) {
    console.error('Vector match error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to calculate vector match'
    });
  }
});

// POST /api/tailor/standardize-skills - Reorganize skills using AI
router.post('/standardize-skills', aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { skills } = req.body;

    if (!skills || !Array.isArray(skills)) {
      res.status(400).json({ error: 'Invalid skills data provided' });
      return;
    }

    // Call AI service
    const standardized = await standardizeSkills(skills);

    res.json({ skills: standardized });

  } catch (error) {
    console.error('Standardize skills error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to standardize skills'
    });
  }
});

export default router;
