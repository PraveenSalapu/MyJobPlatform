-- Migration: 003_rls_and_schema_fixes
-- Purpose: Patch gaps in the initial schema that cause runtime errors.
--
-- Issues fixed:
--   1. user_usage had no INSERT RLS policy — the backend (service_role) bypasses
--      RLS so writes still work, but any direct client insert would be blocked.
--      Added explicit INSERT policy for completeness.
--   2. profiles table may be missing has_completed_onboarding if created before
--      the schema was finalised. Added IF NOT EXISTS guard.
--   3. Grant RPC functions to `authenticated` role so Supabase Edge Functions
--      or direct SDK calls can also invoke them if needed.
--
-- Safe to re-run: all statements use IF NOT EXISTS / DO $$ guards.
-- Apply in: Supabase Dashboard → SQL Editor

-- ---------------------------------------------------------------------------
-- 1. Add INSERT policy for user_usage (service_role bypasses this anyway)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_usage'
          AND policyname = 'Users can insert own usage'
    ) THEN
        CREATE POLICY "Users can insert own usage"
            ON user_usage FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ensure has_completed_onboarding column exists on profiles
--    (supabase-schema.sql includes it, but older manual setups may not have it)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 3. Grant RPC functions to authenticated role
--    (already granted to service_role in migration 002)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION deduct_credits_atomic(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_user_usage(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification queries (run manually to confirm)
-- ---------------------------------------------------------------------------
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_usage';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'has_completed_onboarding';
-- SELECT proname FROM pg_proc WHERE proname IN ('deduct_credits_atomic','increment_credits','upsert_user_usage');
