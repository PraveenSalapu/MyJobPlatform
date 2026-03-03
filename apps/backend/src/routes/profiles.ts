import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';
import { generateResumePDF } from '../services/pdf.js';
import { updateProfileEmbedding, computeMatchScoresForProfile } from '../services/matchScore.js';
import { analyzeResume, analyzeResumeWithAI } from '../services/resumeAnalysis.js';

const router: Router = Router();

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
const createProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  data: z.object({}).passthrough(), // Resume data - flexible object
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.object({}).passthrough().optional(),
  isActive: z.boolean().optional(),
  hasCompletedOnboarding: z.boolean().optional(),
});

// GET /api/profiles - Get all profiles for current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const { data: profiles, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      res.status(500).json({ error: 'Failed to fetch profiles' });
      return;
    }

    res.json({
      success: true,
      profiles: profiles.map(p => ({
        id: p.id,
        userId: p.user_id,
        name: p.name,
        data: p.data,
        isActive: p.is_active,
        hasCompletedOnboarding: p.has_completed_onboarding ?? false,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// GET /api/profiles/:id - Get specific profile
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        userId: profile.user_id,
        name: profile.name,
        data: profile.data,
        isActive: profile.is_active,
        hasCompletedOnboarding: profile.has_completed_onboarding ?? false,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// POST /api/profiles - Create new profile
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const validation = createProfileSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { name, data } = validation.data;

    // Check profile limit (max 4)
    const { count } = await getSupabase()
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count >= 4) {
      res.status(400).json({ error: 'Maximum of 4 profiles allowed' });
      return;
    }

    const profileId = uuidv4();
    const now = new Date().toISOString();

    // If this is the first profile, make it active
    const isFirstProfile = count === 0;

    const { error } = await getSupabase().from('profiles').insert({
      id: profileId,
      user_id: userId,
      name,
      data,
      is_active: isFirstProfile,
    });

    if (error) {
      console.error('Error creating profile:', error);
      res.status(500).json({ error: 'Failed to create profile', details: error });
      return;
    }

    // Generate embedding for the profile in the background
    // Don't await - let it happen asynchronously
    if (data) {
      updateProfileEmbedding(profileId, data as any)
        .catch(err => console.error('Background embedding generation failed:', err));
    }

    res.status(201).json({
      success: true,
      profile: {
        id: profileId,
        userId,
        name,
        data,
        isActive: isFirstProfile,
        hasCompletedOnboarding: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error('Create profile error:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

// PUT /api/profiles/:id - Update profile
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const validation = updateProfileSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    // Verify ownership
    const { data: existing } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const updates: Record<string, unknown> = {
      // updated_at: new Date().toISOString(),
    };

    if (validation.data.name !== undefined) {
      updates.name = validation.data.name;
    }
    if (validation.data.data !== undefined) {
      updates.data = validation.data.data;
    }
    if (validation.data.isActive !== undefined) {
      updates.is_active = validation.data.isActive;

      // If setting this profile as active, deactivate others
      if (validation.data.isActive) {
        await getSupabase()
          .from('profiles')
          .update({ is_active: false })
          .eq('user_id', userId)
          .neq('id', id);
      }
    }
    if (validation.data.hasCompletedOnboarding !== undefined) {
      updates.has_completed_onboarding = validation.data.hasCompletedOnboarding;
    }

    const { data: updated, error } = await getSupabase()
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    // Regenerate embedding if resume data changed
    if (validation.data.data && updated.data) {
      updateProfileEmbedding(id, updated.data as any)
        .then(() => computeMatchScoresForProfile(id))
        .catch(err => console.error('Background embedding regeneration failed:', err));
    }

    res.json({
      success: true,
      profile: {
        id: updated.id,
        userId: updated.user_id,
        name: updated.name,
        data: updated.data,
        isActive: updated.is_active,
        hasCompletedOnboarding: updated.has_completed_onboarding ?? false,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// DELETE /api/profiles/:id - Delete profile
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await getSupabase()
      .from('profiles')
      .select('id, is_active')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Check if this is the last profile
    const { count } = await getSupabase()
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count <= 1) {
      res.status(400).json({ error: 'Cannot delete the last profile' });
      return;
    }

    const { error } = await getSupabase().from('profiles').delete().eq('id', id);

    if (error) {
      console.error('Error deleting profile:', error);
      res.status(500).json({ error: 'Failed to delete profile' });
      return;
    }

    // If deleted profile was active, activate another one
    if (existing.is_active) {
      const { data: firstProfile } = await getSupabase()
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (firstProfile) {
        await getSupabase()
          .from('profiles')
          .update({ is_active: true })
          .eq('id', firstProfile.id);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// PATCH /api/profiles/:id/activate - Set profile as active
router.patch('/:id/activate', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // Verify ownership
    const { data: existing } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Deactivate all other profiles
    await getSupabase()
      .from('profiles')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Activate this profile
    const { error } = await getSupabase()
      .from('profiles')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      console.error('Error activating profile:', error);
      res.status(500).json({ error: 'Failed to activate profile' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Activate profile error:', error);
    res.status(500).json({ error: 'Failed to activate profile' });
  }
});

// GET /api/profiles/:id/pdf - Generate and download resume PDF
router.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // Get profile data
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Generate PDF
    const pdfBuffer = await generateResumePDF(profile.data);

    // Generate filename from user's name
    const fullName = profile.data?.personalInfo?.fullName || 'Resume';
    const safeName = fullName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_Resume.pdf`;

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Rate limit for analysis (uses AI, should be protected)
const analysisRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 analysis requests per minute
  keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
  message: { error: 'Too many analysis requests. Please wait a moment.' },
});

// POST /api/profiles/analyze - Analyze resume data (without saving)
// This is used during onboarding before a profile is created
router.post('/analyze', analysisRateLimit, async (req: Request, res: Response) => {
  try {
    const { resumeData, useAI = false } = req.body;

    if (!resumeData) {
      res.status(400).json({ error: 'Resume data is required' });
      return;
    }

    // Perform analysis
    const analysis = useAI
      ? await analyzeResumeWithAI(resumeData)
      : await analyzeResume(resumeData);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Resume analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze resume' });
  }
});

// GET /api/profiles/:id/analyze - Analyze an existing profile
router.get('/:id/analyze', analysisRateLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const useAI = req.query.ai === 'true';

    // Get profile data
    const { data: profile, error } = await getSupabase()
      .from('profiles')
      .select('data')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Perform analysis
    const analysis = useAI
      ? await analyzeResumeWithAI(profile.data)
      : await analyzeResume(profile.data);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Profile analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze profile' });
  }
});

export default router;
