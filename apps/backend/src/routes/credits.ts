import { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { authenticateToken } from '../middleware/auth.js';

const router: Router = Router();

// Lazy-initialized Supabase client
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
    if (!_supabase) {
        console.log('[Credits] Initializing Supabase client...');
        const url = process.env.VITE_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        console.log('[Credits] URL:', url);
        console.log('[Credits] Key exists:', !!key);

        _supabase = createClient(
            url || '',
            key || ''
        );
    }
    return _supabase;
}

// 5 Days in milliseconds
const REFILL_INTERVAL = 5 * 24 * 60 * 60 * 1000;
const REFILL_AMOUNT = 500;

// Helper: Ensure user has a credit record and refill if needed
export async function refillCreditsIfDue(userId: string): Promise<number> {
    const supabase = getSupabase();

    // Get current usage
    let { data: usage, error } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error || !usage) {
        // Create default if not exists
        const { data: newUsage, error: createError } = await supabase
            .from('user_usage')
            .insert({ user_id: userId, credits: REFILL_AMOUNT, last_refill_at: new Date().toISOString() })
            .select()
            .single();

        if (createError) {
            console.error('Error creating user usage:', createError);
            throw new Error('Failed to initialize user credits');
        }
        return newUsage.credits;
    }

    // Check refill
    const lastRefill = new Date(usage.last_refill_at).getTime();
    const now = new Date().getTime();

    if (now - lastRefill > REFILL_INTERVAL) {
        // Refill logic: Reset to 500? Or Add 500? Plan said "refresh in 5 days", implies reset or top-up.
        // Let's assume Reset to 500 to prevent hoarding, or simply Top-up.
        // Common pattern is "Reset to monthly limit". Let's Reset to 500 if below.
        // Or just "Refill". Let's set to 500.
        const { data: updated, error: updateError } = await supabase
            .from('user_usage')
            .update({ credits: REFILL_AMOUNT, last_refill_at: new Date().toISOString() })
            .eq('user_id', userId)
            .select()
            .single();

        if (updateError) throw updateError;
        return updated.credits;
    }

    return usage.credits;
}

// Helper: Deduct credits
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
    const supabase = getSupabase();

    // Ensure we are refilled first
    await refillCreditsIfDue(userId);

    const { data: usage } = await supabase
        .from('user_usage')
        .select('credits')
        .eq('user_id', userId)
        .single();

    if (!usage || usage.credits < amount) {
        return false;
    }

    const { error } = await supabase
        .from('user_usage')
        .update({ credits: usage.credits - amount })
        .eq('user_id', userId);

    if (error) {
        console.error('Error deducting credits:', error);
        return false;
    }

    return true;
}

// GET /api/credits/balance
router.get('/balance', authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = req.userId;
        console.log('[Credits] GET /balance for User:', userId);

        if (!userId) {
            console.error('[Credits] No User ID in request');
            res.status(401).json({ error: 'User ID not found' });
            return;
        }
        const { credits, nextRefillAt } = await getCreditsWithRefillDate(userId);
        console.log('[Credits] Returning balance:', credits, 'next refill:', nextRefillAt);
        res.setHeader('Cache-Control', 'no-store');
        res.json({ credits, nextRefillAt });
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: 'Failed to fetch credit balance' });
    }
});

// Helper: Get credits and next refill date
async function getCreditsWithRefillDate(userId: string): Promise<{ credits: number; nextRefillAt: string }> {
    const supabase = getSupabase();

    // First ensure refill happens if due
    const credits = await refillCreditsIfDue(userId);

    // Get the last refill timestamp
    const { data: usage } = await supabase
        .from('user_usage')
        .select('last_refill_at')
        .eq('user_id', userId)
        .single();

    // Calculate next refill date
    const lastRefill = usage?.last_refill_at ? new Date(usage.last_refill_at) : new Date();
    const nextRefill = new Date(lastRefill.getTime() + REFILL_INTERVAL);

    return {
        credits,
        nextRefillAt: nextRefill.toISOString()
    };
}

export default router;
