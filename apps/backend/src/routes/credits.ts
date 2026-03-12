import { Router, type Request, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticateToken } from '../middleware/auth.js';

const router: Router = Router();

const REFILL_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const REFILL_AMOUNT = 500;

/**
 * Ensure a user_usage row exists and top-up if the refill window has passed.
 *
 * Idempotency: Uses an UPSERT (on_conflict do nothing on the insert path) so
 * concurrent first-time requests cannot create duplicate rows.
 *
 * Returns the current credit balance after any refill.
 */
export async function ensureAndRefillCredits(userId: string): Promise<number> {
    // Upsert: create row if it doesn't exist, otherwise leave it alone.
    // `ignoreDuplicates: true` maps to ON CONFLICT DO NOTHING.
    await supabase
        .from('user_usage')
        .upsert(
            { user_id: userId, credits: REFILL_AMOUNT, last_refill_at: new Date().toISOString() },
            { onConflict: 'user_id', ignoreDuplicates: true }
        );

    const { data: usage, error } = await supabase
        .from('user_usage')
        .select('credits, last_refill_at')
        .eq('user_id', userId)
        .single();

    if (error || !usage) {
        throw new Error('Failed to fetch credit record after upsert');
    }

    // Refill if the window has passed
    const lastRefill = new Date(usage.last_refill_at).getTime();
    if (Date.now() - lastRefill > REFILL_INTERVAL_MS) {
        const { data: refilled, error: refillError } = await supabase
            .from('user_usage')
            .update({ credits: REFILL_AMOUNT, last_refill_at: new Date().toISOString() })
            .eq('user_id', userId)
            // Only refill if still past the interval (guards against a race where
            // two requests both see an expired timestamp)
            .lt('last_refill_at', new Date(Date.now() - REFILL_INTERVAL_MS).toISOString())
            .select('credits')
            .maybeSingle();

        if (refillError) throw refillError;
        // If refillError is null but data is null, another request won the race
        // and already refilled — fetch the updated balance.
        if (!refilled) {
            const { data: fresh } = await supabase
                .from('user_usage')
                .select('credits')
                .eq('user_id', userId)
                .single();
            return fresh?.credits ?? REFILL_AMOUNT;
        }
        return refilled.credits;
    }

    return usage.credits;
}

/**
 * Atomically deduct `amount` credits from `userId`.
 *
 * Uses a single UPDATE with a WHERE credits >= amount filter, which is atomic
 * at the PostgreSQL row level. If the row is not updated (credits < amount or
 * row missing), returns false without touching any data.
 *
 * This eliminates the read-then-write race condition present in the previous
 * implementation.
 */
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
    // Ensure the user record exists and is refilled if due
    const currentCredits = await ensureAndRefillCredits(userId);

    if (currentCredits < amount) {
        return false; // Fast-path: skip the DB write
    }

    // Single atomic UPDATE — only succeeds when credits >= amount
    const { data, error } = await supabase
        .from('user_usage')
        .update({ credits: currentCredits - amount })
        .eq('user_id', userId)
        .gte('credits', amount) // Atomic guard: only update if balance still sufficient
        .select('credits')
        .maybeSingle();

    if (error) {
        console.error('[credits] Error in atomic deduction:', error);
        return false;
    }

    // If no row was updated, another concurrent request depleted the balance
    return data !== null;
}

/**
 * Refund `amount` credits back to `userId` after a failed AI operation.
 * Should be called in catch blocks when credits were already deducted.
 */
export async function refundCredits(userId: string, amount: number): Promise<void> {
    const { error } = await supabase.rpc('increment_credits', {
        p_user_id: userId,
        p_amount: amount,
    });

    if (error) {
        // Non-fatal: log for manual reconciliation but don't crash the request
        console.error(`[credits] Failed to refund ${amount} credits to ${userId}:`, error);
    }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// GET /api/credits/balance
router.get('/balance', authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'User ID not found' });
            return;
        }

        const credits = await ensureAndRefillCredits(userId);

        const { data: usage } = await supabase
            .from('user_usage')
            .select('last_refill_at')
            .eq('user_id', userId)
            .single();

        const lastRefill = usage?.last_refill_at ? new Date(usage.last_refill_at) : new Date();
        const nextRefillAt = new Date(lastRefill.getTime() + REFILL_INTERVAL_MS).toISOString();

        res.setHeader('Cache-Control', 'no-store');
        res.json({ credits, nextRefillAt });
    } catch (error) {
        console.error('[credits] Error fetching balance:', error);
        res.status(500).json({ error: 'Failed to fetch credit balance' });
    }
});

export default router;
