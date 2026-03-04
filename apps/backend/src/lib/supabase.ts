/**
 * Supabase service-role client — single shared instance for the backend.
 *
 * All routes MUST import { supabase } from here instead of calling
 * createClient() themselves. This ensures one connection pool, consistent
 * config, and a single point of change.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '../../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    // validateEnvironment() in index.ts surfaces a clearer error at startup.
    // This guards against lib being imported before env is loaded.
    console.error('[supabase] VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.');
}

export const supabase: SupabaseClient = createClient(
    supabaseUrl ?? '',
    supabaseServiceKey ?? '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);
