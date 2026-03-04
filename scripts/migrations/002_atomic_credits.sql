-- Migration: 002_atomic_credits
-- Purpose: Add atomic credit management functions to eliminate race conditions
--          in the credit deduction flow.
--
-- Background:
--   The previous implementation used a read-then-write pattern (SELECT → UPDATE)
--   which allowed two concurrent requests to both read the same balance and both
--   succeed, resulting in negative credits. These PostgreSQL functions fix this
--   by performing atomic operations at the database level.
--
-- Apply this migration in the Supabase SQL editor or via the Supabase CLI.

-- ---------------------------------------------------------------------------
-- Function: deduct_credits_atomic
--
-- Atomically deducts `p_amount` credits from the `user_usage` row for
-- `p_user_id`. Only succeeds if the current credit balance >= p_amount.
-- Returns the new balance, or NULL if insufficient credits.
--
-- The WHERE credits >= p_amount clause is evaluated atomically with the UPDATE,
-- preventing the read-then-write race condition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_credits_atomic(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_credits INTEGER;
BEGIN
    UPDATE user_usage
    SET credits = credits - p_amount
    WHERE user_id = p_user_id
      AND credits >= p_amount
    RETURNING credits INTO v_new_credits;

    -- v_new_credits is NULL if no row was updated (insufficient credits or missing row)
    RETURN v_new_credits;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: increment_credits
--
-- Adds `p_amount` credits back to `p_user_id` (used for refunds on AI failure).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_credits(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE user_usage
    SET credits = credits + p_amount
    WHERE user_id = p_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: upsert_user_usage
--
-- Creates a user_usage row if it doesn't exist (idempotent initialization).
-- Uses ON CONFLICT DO NOTHING so concurrent first-time requests are safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_user_usage(p_user_id UUID, p_initial_credits INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO user_usage (user_id, credits, last_refill_at)
    VALUES (p_user_id, p_initial_credits, NOW())
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Ensure user_id has a unique constraint (required for ON CONFLICT)
-- (Skip if already exists — Supabase will no-op if constraint name already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_usage_user_id_key'
    ) THEN
        ALTER TABLE user_usage ADD CONSTRAINT user_usage_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- Grant execute permissions to the service role
GRANT EXECUTE ON FUNCTION deduct_credits_atomic(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_credits(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_user_usage(UUID, INTEGER) TO service_role;
