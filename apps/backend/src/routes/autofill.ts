import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';
import { generateResumePDF } from '../services/pdf.js';

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
const createPendingAutofillSchema = z.object({
  profileId: z.string().uuid(),
  jobUrl: z.string().url(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  jobDescription: z.string().optional(),
  tailoredResume: z.object({}).passthrough(), // Resume data
  coverLetter: z.string().optional(), // Generated cover letter text
});

const saveJobSchema = z.object({
  jobUrl: z.string().url(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  jobDescription: z.string().optional(),
  platform: z.string().optional(),
});

// POST /api/autofill/pending - Create a pending autofill (from app after tailoring)
router.post('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const validation = createPendingAutofillSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { profileId, jobUrl, jobTitle, company, jobDescription, tailoredResume, coverLetter } = validation.data;

    // Verify profile ownership
    const { data: profile } = await getSupabase()
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .eq('user_id', userId)
      .single();

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Delete any existing pending autofills for this URL (replace)
    await getSupabase()
      .from('pending_autofills')
      .delete()
      .eq('user_id', userId)
      .eq('job_url', jobUrl);

    // Create new pending autofill
    const autofillId = uuidv4();
    const { error } = await getSupabase().from('pending_autofills').insert({
      id: autofillId,
      user_id: userId,
      profile_id: profileId,
      job_url: jobUrl,
      job_title: jobTitle,
      company: company,
      job_description: jobDescription,
      tailored_resume: tailoredResume,
      cover_letter: coverLetter || null,
      status: 'pending',
    });

    if (error) {
      console.error('Error creating pending autofill:', error);
      res.status(500).json({ error: 'Failed to create pending autofill' });
      return;
    }

    res.status(201).json({
      success: true,
      autofillId,
      message: 'Autofill ready. Navigate to the job page to apply.',
    });
  } catch (error) {
    console.error('Create pending autofill error:', error);
    res.status(500).json({ error: 'Failed to create pending autofill' });
  }
});

// GET /api/autofill/pending - Get pending autofill for a URL (extension checks this)
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const jobUrl = req.query.url as string;

    if (!jobUrl) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Find pending autofill for this URL
    const { data: autofill, error } = await getSupabase()
      .from('pending_autofills')
      .select('*, profiles(data)')
      .eq('user_id', userId)
      .eq('job_url', jobUrl)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !autofill) {
      res.json({ found: false });
      return;
    }

    res.json({
      found: true,
      autofill: {
        id: autofill.id,
        profileId: autofill.profile_id,
        jobUrl: autofill.job_url,
        jobTitle: autofill.job_title,
        company: autofill.company,
        tailoredResume: autofill.tailored_resume,
        coverLetter: autofill.cover_letter || null,
      },
    });
  } catch (error) {
    console.error('Get pending autofill error:', error);
    res.status(500).json({ error: 'Failed to get pending autofill' });
  }
});

// PATCH /api/autofill/pending/:id/complete - Mark autofill as completed & create application
router.patch('/pending/:id/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // 1. Fetch to get job details to insert into applications
    const { data: autofill, error: fetchErr } = await getSupabase()
      .from('pending_autofills')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !autofill) {
      res.status(404).json({ error: 'Autofill not found' });
      return;
    }

    // 2. Mark as completed
    const { error: updateErr } = await getSupabase()
      .from('pending_autofills')
      .update({ status: 'completed' })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('Error completing autofill:', updateErr);
      res.status(500).json({ error: 'Failed to update autofill status' });
      return;
    }

    // 3. Persist to User's Application Tracker automatically
    const { error: insertAppErr } = await getSupabase()
      .from('applications')
      .insert({
        user_id: userId,
        company: autofill.company || 'Unknown Company',
        job_title: autofill.job_title || 'Unknown Title',
        job_url: autofill.job_url,
        status: 'applied',
        applied_date: new Date().toISOString(),
        resume_version: autofill.profile_id,
        timeline: [{ status: 'applied', date: new Date().toISOString(), note: 'Auto-filled via CareerFlow Extension' }]
      });

    if (insertAppErr) {
      console.error('Error creating application record:', insertAppErr);
      // Non-fatal error, but we log it
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Complete autofill error:', error);
    res.status(500).json({ error: 'Failed to complete autofill' });
  }
});

// POST /api/autofill/jobs - Save a job from extension for tailoring
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const validation = saveJobSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: validation.error.errors[0].message });
      return;
    }

    const { jobUrl, jobTitle, company, jobDescription, platform } = validation.data;

    // Check if job already exists
    const { data: existingJob } = await getSupabase()
      .from('saved_jobs')
      .select('id')
      .eq('user_id', userId)
      .eq('job_url', jobUrl)
      .single();

    if (existingJob) {
      // Update existing job
      const { error } = await getSupabase()
        .from('saved_jobs')
        .update({
          job_title: jobTitle,
          company: company,
          job_description: jobDescription,
          platform: platform,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingJob.id);

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        jobId: existingJob.id,
        isNew: false,
      });
      return;
    }

    // Create new job
    const jobId = uuidv4();
    const { error } = await getSupabase().from('saved_jobs').insert({
      id: jobId,
      user_id: userId,
      job_url: jobUrl,
      job_title: jobTitle,
      company: company,
      job_description: jobDescription,
      platform: platform,
      status: 'saved',
    });

    if (error) {
      console.error('Error saving job:', error);
      res.status(500).json({ error: 'Failed to save job' });
      return;
    }

    res.status(201).json({
      success: true,
      jobId,
      isNew: true,
    });
  } catch (error) {
    console.error('Save job error:', error);
    res.status(500).json({ error: 'Failed to save job' });
  }
});

// GET /api/autofill/jobs - Get saved jobs for the user
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const { data: jobs, error } = await getSupabase()
      .from('saved_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
      return;
    }

    res.json({
      success: true,
      jobs: jobs.map(j => ({
        id: j.id,
        jobUrl: j.job_url,
        jobTitle: j.job_title,
        company: j.company,
        jobDescription: j.job_description,
        platform: j.platform,
        status: j.status,
        createdAt: j.created_at,
      })),
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/autofill/jobs/:id - Get a specific saved job
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const { data: job, error } = await getSupabase()
      .from('saved_jobs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        jobUrl: job.job_url,
        jobTitle: job.job_title,
        company: job.company,
        jobDescription: job.job_description,
        platform: job.platform,
        status: job.status,
        createdAt: job.created_at,
      },
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// DELETE /api/autofill/jobs/:id - Delete a saved job
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const { error } = await getSupabase()
      .from('saved_jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting job:', error);
      res.status(500).json({ error: 'Failed to delete job' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// GET /api/autofill/pending/:id/pdf - Generate PDF from tailored resume in pending autofill
router.get('/pending/:id/pdf', async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // Get the pending autofill record
    const { data: autofill, error } = await getSupabase()
      .from('pending_autofills')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !autofill) {
      res.status(404).json({ error: 'Autofill record not found' });
      return;
    }

    const tailoredResume = autofill.tailored_resume;
    if (!tailoredResume) {
      res.status(400).json({ error: 'No resume data found in autofill record' });
      return;
    }

    // Generate PDF from the tailored resume data
    const pdfBuffer = await generateResumePDF(tailoredResume);

    // Generate filename
    const fullName = tailoredResume?.personalInfo?.fullName || 'Resume';
    const company = autofill.company || '';
    const safeName = fullName.replace(/[^a-zA-Z0-9]/g, '_');
    const safeCompany = company.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = safeCompany
      ? `${safeName}_${safeCompany}_Tailored.pdf`
      : `${safeName}_Tailored.pdf`;

    // Send PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate tailored PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
