import { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getMatchedJobsForUser,
  computeMatchScoresForProfile,
  updateProfileEmbedding,
} from '../services/matchScore.js';

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

/**
 * GET /api/jobs/matched
 * Get jobs sorted by match score for the current user's active profile
 * Auto-generates embedding if profile has content but no embedding yet
 * Supports pagination with ?page=1&limit=20
 */
router.get('/matched', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Check if user's active profile needs embedding generation
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('id, data, embedding')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    // If profile exists, has data, but no embedding - try to generate one
    if (profile && profile.data && !profile.embedding) {
      console.log('[Jobs] Profile has no embedding, attempting to generate...');
      try {
        const generated = await updateProfileEmbedding(profile.id, profile.data);
        if (generated) {
          console.log('[Jobs] Successfully generated embedding for profile', profile.id);
        } else {
          console.log('[Jobs] Profile does not have enough content for embedding yet');
        }
      } catch (embError) {
        console.error('[Jobs] Failed to generate embedding:', embError);
        // Continue anyway - will return jobs without scores
      }
    }

    const result = await getMatchedJobsForUser(userId, { page, limit });

    res.json({
      success: true,
      jobs: result.data,
      count: result.data.length,
      pagination: result.pagination,
      hasEmbedding: !!profile?.embedding,
    });
  } catch (error) {
    console.error('Error fetching matched jobs:', error);
    res.status(500).json({ error: 'Failed to fetch matched jobs' });
  }
});

/**
 * POST /api/jobs/refresh-scores
 * Force recalculate match scores for the current user's active profile
 */
router.post('/refresh-scores', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user's active profile
    const { data: profile, error: profileError } = await getSupabase()
      .from('profiles')
      .select('id, data, embedding')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (profileError || !profile) {
      res.status(404).json({ error: 'No active profile found' });
      return;
    }

    // If profile has no embedding yet, generate it first
    if (!profile.embedding && profile.data) {
      console.log('Generating embedding for profile', profile.id);
      await updateProfileEmbedding(profile.id, profile.data);
    }

    // Compute match scores
    const scoreCount = await computeMatchScoresForProfile(profile.id);

    res.json({
      success: true,
      message: `Computed ${scoreCount} match scores`,
      scoresComputed: scoreCount,
    });
  } catch (error) {
    console.error('Error refreshing scores:', error);
    res.status(500).json({ error: 'Failed to refresh match scores' });
  }
});

/**
 * GET /api/jobs
 * Get all jobs (public endpoint, no auth required)
 * Falls back to basic job list without scores
 * Supports pagination with ?page=1&limit=20
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    // Get total count
    const { count: totalCount } = await getSupabase()
      .from('jobs')
      .select('*', { count: 'exact', head: true });

    const total = totalCount || 0;

    const { data: jobs, error } = await getSupabase()
      .from('jobs')
      .select('id, title, company, link, description, location, created_at, experience_level, job_type, category')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
      return;
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      jobs: (jobs || []).map(job => ({
        ...job,
        match_score: 0, // No user context, so no scores
      })),
      count: jobs?.length || 0,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/jobs/:id/score
 * Get match score for a specific job for the current user
 */
router.get('/:id/score', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const jobId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user's active profile
    const { data: profile, error: profileError } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (profileError || !profile) {
      res.json({ success: true, match_score: 0, message: 'No active profile' });
      return;
    }

    // Get match score
    const { data: match, error: matchError } = await getSupabase()
      .from('profile_job_matches')
      .select('match_score')
      .eq('profile_id', profile.id)
      .eq('job_id', jobId)
      .single();

    if (matchError || !match) {
      res.json({ success: true, match_score: 0, message: 'Score not computed yet' });
      return;
    }

    res.json({
      success: true,
      match_score: match.match_score,
    });
  } catch (error) {
    console.error('Error fetching job score:', error);
    res.status(500).json({ error: 'Failed to fetch job score' });
  }
});

export default router;
