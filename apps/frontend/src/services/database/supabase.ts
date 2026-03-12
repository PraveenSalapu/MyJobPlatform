
import { createClient } from '@supabase/supabase-js';
import type { Job } from '../../types';
import { getMatchedJobs } from '../api';
import type { PaginationInfo } from '../api';

// Access environment variables using Vite's syntax
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase URL or Key missing. Database features will be disabled.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

export interface FetchJobsResult {
    jobs: Job[];
    pagination?: PaginationInfo;
}

/**
 * Fetch jobs from backend API with match scores (for authenticated users)
 * Falls back to direct Supabase query for unauthenticated users
 * Supports pagination with page and limit parameters
 */
export const fetchJobsFromDB = async (page = 1, limit = 20): Promise<FetchJobsResult> => {
    if (!supabaseUrl || !supabaseAnonKey) return { jobs: [] };

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
        // Authenticated: use backend API for personalized match scores
        try {
            const result = await getMatchedJobs(page, limit);
            const jobs = result.jobs.map(record => ({
                id: record.id,
                title: record.title,
                company: record.company,
                link: record.link,
                summary: record.description || '',
                description: record.description,
                match_score: Number(record.match_score) || 0,
                missing_skills: record.missing_skills || [],
                location: record.location,
                created_at: record.created_at,
                experienceLevel: record.experience_level,
                jobType: record.job_type,
                category: record.category
            })) as Job[];
            return { jobs, pagination: result.pagination };
        } catch (error) {
            console.error('Error fetching matched jobs from API, falling back to Supabase:', error);
            // Fall through to direct Supabase query
        }
    }

    // Unauthenticated or API failed: direct Supabase query with pagination
    const offset = (page - 1) * limit;

    // Get total count
    const { count: totalCount } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true });

    const total = totalCount || 0;

    const { data, error } = await supabase
        .from('jobs')
        .select('id, title, company, link, description, location, created_at, match_score, missing_skills, experience_level, job_type, category')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching jobs from Supabase:', error);
        throw error;
    }

    const jobs = (data || []).map(record => ({
        id: record.id,
        title: record.title,
        company: record.company,
        link: record.link,
        summary: record.description || '',
        description: record.description,
        match_score: Number(record.match_score) || 0,
        missing_skills: record.missing_skills || [],
        location: record.location,
        created_at: record.created_at,
        experienceLevel: record.experience_level,
        jobType: record.job_type,
        category: record.category
    })) as Job[];

    const totalPages = Math.ceil(total / limit);

    return {
        jobs,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore: page < totalPages,
        },
    };
};
