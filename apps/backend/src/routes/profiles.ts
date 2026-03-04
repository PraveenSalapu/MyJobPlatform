import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { authenticateToken } from '../middleware/auth.js';
import { generateResumePDF } from '../services/pdf.js';
import { updateProfileEmbedding, computeMatchScoresForProfile } from '../services/matchScore.js';
import { analyzeResume, analyzeResumeWithAI } from '../services/resumeAnalysis.js';

const router: Router = Router();

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createProfileSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    data: z.object({}).passthrough(),
});

const updateProfileSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    data: z.object({}).passthrough().optional(),
    isActive: z.boolean().optional(),
    hasCompletedOnboarding: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a DB row to the camelCase API shape. */
function toApiProfile(p: Record<string, any>) {
    return {
        id: p.id,
        userId: p.user_id,
        name: p.name,
        data: p.data,
        isActive: p.is_active,
        hasCompletedOnboarding: p.has_completed_onboarding ?? false,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
    };
}

// ---------------------------------------------------------------------------
// GET /api/profiles
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[profiles] GET / error:', error);
            res.status(500).json({ error: 'Failed to fetch profiles' });
            return;
        }

        res.json({ success: true, profiles: profiles.map(toApiProfile) });
    } catch (error) {
        console.error('[profiles] GET / error:', error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/profiles/:id
// ---------------------------------------------------------------------------

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        res.json({ success: true, profile: toApiProfile(profile) });
    } catch (error) {
        console.error('[profiles] GET /:id error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/profiles
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
    try {
        const validation = createProfileSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors[0].message });
            return;
        }

        const { name, data } = validation.data;
        const userId = req.userId!;

        // Enforce profile limit
        const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (count !== null && count >= 4) {
            res.status(400).json({ error: 'Maximum of 4 profiles allowed' });
            return;
        }

        const profileId = uuidv4();
        const now = new Date().toISOString();
        const isFirstProfile = count === 0;

        const { error } = await supabase.from('profiles').insert({
            id: profileId,
            user_id: userId,
            name,
            data,
            is_active: isFirstProfile,
        });

        if (error) {
            console.error('[profiles] POST / insert error:', error);
            res.status(500).json({ error: 'Failed to create profile' });
            return;
        }

        // Fire-and-forget embedding; errors are logged but don't fail the request
        if (data) {
            updateProfileEmbedding(profileId, data as any).catch(err =>
                console.error('[profiles] Background embedding failed:', err)
            );
        }

        res.status(201).json({
            success: true,
            profile: { id: profileId, userId, name, data, isActive: isFirstProfile, hasCompletedOnboarding: false, createdAt: now, updatedAt: now },
        });
    } catch (error) {
        console.error('[profiles] POST / error:', error);
        res.status(500).json({ error: 'Failed to create profile' });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/profiles/:id
// ---------------------------------------------------------------------------

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId!;

        const validation = updateProfileSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors[0].message });
            return;
        }

        // Verify ownership first
        const { data: existing } = await supabase
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
            updated_at: new Date().toISOString(),
        };

        if (validation.data.name !== undefined) updates.name = validation.data.name;
        if (validation.data.data !== undefined) updates.data = validation.data.data;
        if (validation.data.isActive !== undefined) {
            updates.is_active = validation.data.isActive;

            // Deactivate all other profiles before setting this one active
            if (validation.data.isActive) {
                await supabase
                    .from('profiles')
                    .update({ is_active: false })
                    .eq('user_id', userId)
                    .neq('id', id);
            }
        }
        if (validation.data.hasCompletedOnboarding !== undefined) {
            updates.has_completed_onboarding = validation.data.hasCompletedOnboarding;
        }

        const { data: updated, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[profiles] PUT /:id update error:', error);
            res.status(500).json({ error: 'Failed to update profile' });
            return;
        }

        // Regenerate embedding when resume data changes
        if (validation.data.data && updated.data) {
            updateProfileEmbedding(id, updated.data as any)
                .then(() => computeMatchScoresForProfile(id))
                .catch(err => console.error('[profiles] Background embedding regen failed:', err));
        }

        res.json({ success: true, profile: toApiProfile(updated) });
    } catch (error) {
        console.error('[profiles] PUT /:id error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/profiles/:id
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId!;

        const { data: existing } = await supabase
            .from('profiles')
            .select('id, is_active')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!existing) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (count !== null && count <= 1) {
            res.status(400).json({ error: 'Cannot delete the last profile' });
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id)
            .eq('user_id', userId); // Ownership guard on the delete itself

        if (error) {
            console.error('[profiles] DELETE /:id error:', error);
            res.status(500).json({ error: 'Failed to delete profile' });
            return;
        }

        // Auto-activate another profile if the deleted one was active
        if (existing.is_active) {
            const { data: nextProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', userId)
                .limit(1)
                .single();

            if (nextProfile) {
                await supabase
                    .from('profiles')
                    .update({ is_active: true })
                    .eq('id', nextProfile.id);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[profiles] DELETE /:id error:', error);
        res.status(500).json({ error: 'Failed to delete profile' });
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/profiles/:id/activate
// ---------------------------------------------------------------------------

router.patch('/:id/activate', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId!;

        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!existing) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        // Sequential: deactivate all, then activate the requested one
        await supabase
            .from('profiles')
            .update({ is_active: false })
            .eq('user_id', userId);

        const { error } = await supabase
            .from('profiles')
            .update({ is_active: true })
            .eq('id', id);

        if (error) {
            console.error('[profiles] PATCH /:id/activate error:', error);
            res.status(500).json({ error: 'Failed to activate profile' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[profiles] PATCH /:id/activate error:', error);
        res.status(500).json({ error: 'Failed to activate profile' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/profiles/:id/pdf
// ---------------------------------------------------------------------------

router.get('/:id/pdf', async (req: Request, res: Response) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        const pdfBuffer = await generateResumePDF(profile.data);
        const fullName = profile.data?.personalInfo?.fullName || 'Resume';
        const filename = `${fullName.replace(/[^a-zA-Z0-9]/g, '_')}_Resume.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('[profiles] GET /:id/pdf error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

// ---------------------------------------------------------------------------
// Analysis endpoints
// ---------------------------------------------------------------------------

const analysisRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req: Request) => req.userId || req.ip || 'anonymous',
    message: { error: 'Too many analysis requests. Please wait a moment.' },
});

// POST /api/profiles/analyze — analyze without saving (onboarding)
router.post('/analyze', analysisRateLimit, async (req: Request, res: Response) => {
    try {
        const { resumeData, useAI = false } = req.body;

        if (!resumeData) {
            res.status(400).json({ error: 'Resume data is required' });
            return;
        }

        const analysis = useAI ? await analyzeResumeWithAI(resumeData) : await analyzeResume(resumeData);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('[profiles] POST /analyze error:', error);
        res.status(500).json({ error: 'Failed to analyze resume' });
    }
});

// GET /api/profiles/:id/analyze — analyze an existing profile
router.get('/:id/analyze', analysisRateLimit, async (req: Request, res: Response) => {
    try {
        const useAI = req.query.ai === 'true';

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('data')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        const analysis = useAI ? await analyzeResumeWithAI(profile.data) : await analyzeResume(profile.data);
        res.json({ success: true, analysis });
    } catch (error) {
        console.error('[profiles] GET /:id/analyze error:', error);
        res.status(500).json({ error: 'Failed to analyze profile' });
    }
});

export default router;
