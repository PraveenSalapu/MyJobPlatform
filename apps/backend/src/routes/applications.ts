import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { authenticateToken } from '../middleware/auth.js';

const router: Router = Router();

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const STATUS = z.enum(['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected', 'accepted', 'withdrawn']);

const createApplicationSchema = z.object({
    company: z.string().min(1, 'Company is required'),
    jobTitle: z.string().min(1, 'Job Title is required'),
    jobUrl: z.string().optional(),
    location: z.string().optional(),
    status: STATUS.optional(),
    appliedDate: z.string().optional(),
    source: z.string().optional(),
    notes: z.string().optional(),
    salaryText: z.string().optional(),
    resumeVersion: z.string().uuid().optional(),
});

// Use nullable() so callers can explicitly clear optional text fields
const updateApplicationSchema = z.object({
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    jobUrl: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    status: STATUS.optional(),
    appliedDate: z.string().optional(),
    source: z.string().optional(),
    notes: z.string().nullable().optional(),      // null = clear the field
    salaryText: z.string().nullable().optional(),
    resumeVersion: z.string().uuid().optional(),
    timeline: z
        .array(z.object({ date: z.string(), status: z.string(), notes: z.string().optional() }))
        .optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toApiApplication(app: Record<string, any>) {
    return {
        id: app.id,
        userId: app.user_id,
        company: app.company,
        jobTitle: app.job_title,
        jobUrl: app.job_url,
        location: app.location,
        status: app.status,
        appliedDate: app.applied_date,
        source: app.source,
        notes: app.notes,
        salaryText: app.salary_text,
        timeline: app.timeline,
        resumeVersion: app.resume_version,
        resumeSnapshot: (app.resume_snapshot as any)?.data,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
    };
}

// ---------------------------------------------------------------------------
// GET /api/applications
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
    try {
        const { data: applications, error } = await supabase
            .from('applications')
            .select('*, resume_snapshot:profiles!resume_version(data)')
            .eq('user_id', req.userId)
            .order('applied_date', { ascending: false });

        if (error) {
            console.error('[applications] GET / error:', error);
            res.status(500).json({ error: 'Failed to fetch applications' });
            return;
        }

        res.json({ success: true, applications: applications.map(toApiApplication) });
    } catch (error) {
        console.error('[applications] GET / error:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/applications/:id
// ---------------------------------------------------------------------------

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { data: app, error } = await supabase
            .from('applications')
            .select('*, resume_snapshot:profiles!resume_version(data)')
            .eq('id', req.params.id)
            .eq('user_id', req.userId)
            .single();

        if (error || !app) {
            res.status(404).json({ error: 'Application not found' });
            return;
        }

        res.json({ success: true, application: toApiApplication(app) });
    } catch (error) {
        console.error('[applications] GET /:id error:', error);
        res.status(500).json({ error: 'Failed to fetch application' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/applications
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response) => {
    try {
        const validation = createApplicationSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors[0].message });
            return;
        }

        const {
            company, jobTitle, jobUrl, location, status,
            appliedDate, source, notes, salaryText, resumeVersion,
        } = validation.data;

        const appId = uuidv4();
        const now = new Date().toISOString();
        const initialStatus = status || 'saved';

        const { error } = await supabase.from('applications').insert({
            id: appId,
            user_id: req.userId,
            company,
            job_title: jobTitle,
            job_url: jobUrl,
            location,
            status: initialStatus,
            applied_date: appliedDate || now,
            source: source || 'Manual Entry',
            notes,
            salary_text: salaryText,
            resume_version: resumeVersion,
            timeline: [{ date: now, status: initialStatus, notes: 'Application created' }],
            created_at: now,
            updated_at: now,
        });

        if (error) {
            console.error('[applications] POST / insert error:', error);
            res.status(500).json({ error: 'Failed to create application' });
            return;
        }

        res.status(201).json({ success: true, application: { id: appId, userId: req.userId } });
    } catch (error) {
        console.error('[applications] POST / error:', error);
        res.status(500).json({ error: 'Failed to create application' });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/applications/:id
// ---------------------------------------------------------------------------

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.userId!;

        const validation = updateApplicationSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({ error: validation.error.errors[0].message });
            return;
        }

        // Verify ownership
        const { data: existing } = await supabase
            .from('applications')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!existing) {
            res.status(404).json({ error: 'Application not found' });
            return;
        }

        const v = validation.data;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        // Use !== undefined so null is allowed to explicitly clear nullable fields
        if (v.company !== undefined) updates.company = v.company;
        if (v.jobTitle !== undefined) updates.job_title = v.jobTitle;
        if (v.jobUrl !== undefined) updates.job_url = v.jobUrl;
        if (v.location !== undefined) updates.location = v.location;
        if (v.status !== undefined) updates.status = v.status;
        if (v.appliedDate !== undefined) updates.applied_date = v.appliedDate;
        if (v.source !== undefined) updates.source = v.source;
        if (v.notes !== undefined) updates.notes = v.notes;
        if (v.salaryText !== undefined) updates.salary_text = v.salaryText;
        if (v.timeline !== undefined) updates.timeline = v.timeline;

        const { error } = await supabase.from('applications').update(updates).eq('id', id);

        if (error) {
            console.error('[applications] PUT /:id error:', error);
            res.status(500).json({ error: 'Failed to update application' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[applications] PUT /:id error:', error);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

// ---------------------------------------------------------------------------
// DELETE /api/applications/:id
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { error } = await supabase
            .from('applications')
            .delete()
            .eq('id', req.params.id)
            .eq('user_id', req.userId); // Ownership guard directly on delete

        if (error) {
            console.error('[applications] DELETE /:id error:', error);
            res.status(500).json({ error: 'Failed to delete application' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[applications] DELETE /:id error:', error);
        res.status(500).json({ error: 'Failed to delete application' });
    }
});

export default router;
