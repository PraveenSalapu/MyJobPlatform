
// API Service for backend communication
import { supabase } from './supabase';
import config from '../config/environment';

const API_BASE = config.apiUrl;

/**
 * Make an authenticated API request.
 *
 * Throws an Error for:
 *   - missing session (not authenticated)
 *   - non-2xx HTTP responses (error message taken from JSON body if available)
 *
 * Callers no longer need to check `response.ok` — a thrown error means failure.
 */
export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Attempt to parse error message from JSON body; fall back to status text.
    let message = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const body = await response.clone().json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body — keep the status-based message
    }

    // 401 means the session expired; the auth context will handle token refresh
    if (response.status === 401) {
      throw Object.assign(new Error(message), { status: 401 });
    }

    throw new Error(message);
  }

  return response;
}

// Profile API calls
export async function getProfiles(): Promise<any[]> {
  const response = await fetchWithAuth('/api/profiles');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch profiles');
  return data.profiles;
}

export async function createProfile(name: string, resumeData: any): Promise<any> {
  const response = await fetchWithAuth('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, data: resumeData }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to create profile');
  return data.profile;
}

export async function updateProfile(id: string, updates: { name?: string; data?: any; isActive?: boolean; hasCompletedOnboarding?: boolean }): Promise<any> {
  const response = await fetchWithAuth(`/api/profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to update profile');
  return data.profile;
}

export async function deleteProfile(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/profiles/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to delete profile');
  }
}

// Autofill Edge / Extension Bridge
export async function createPendingAutofill(payload: any): Promise<any> {
  const response = await fetchWithAuth('/api/autofill/pending', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to stage autofill data');
  return data;
}

// Jobs API calls

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedJobsResponse {
  jobs: any[];
  pagination: PaginationInfo;
}

/**
 * Get jobs with match scores for the current user's active profile
 * Supports pagination with page and limit parameters
 */
export async function getMatchedJobs(page = 1, limit = 20): Promise<PaginatedJobsResponse> {
  const response = await fetchWithAuth(`/api/jobs/matched?page=${page}&limit=${limit}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch matched jobs');
  return { jobs: data.jobs, pagination: data.pagination };
}

/**
 * Force refresh match scores for the current user
 */
export async function refreshMatchScores(): Promise<{ scoresComputed: number }> {
  const response = await fetchWithAuth('/api/jobs/refresh-scores', {
    method: 'POST',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to refresh scores');
  return data;
}

/**
 * Calculate ATS score for a specific job using current resume data (Draft Mode)
 */
export async function calculateDeepMatchScore(resumeData: any, jobDescription: string): Promise<{ score: number, missingKeywords: string[], criticalFeedback: string }> {
  try {
    const response = await fetchWithAuth('/api/tailor/score', {
      method: 'POST',
      body: JSON.stringify({
        resumeData,
        jobDescription
      })
    });

    if (!response.ok) {
      throw new Error('Failed to calculate deep match score');
    }

    const data = await response.json();
    return data.data; // { score, missingKeywords, criticalFeedback }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/**
 * Get match score for a specific job (Stored/Pre-calc)
 */
export async function getJobScore(jobId: string): Promise<number> {
  const response = await fetchWithAuth(`/api/jobs/${jobId}/score`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch job score');
  return data.match_score;
}

/**
 * Get semantic match score using Server-Side Vector Embeddings
 * High quality, but slower than client-side heuristic.
 */
export async function getVectorMatchScore(resumeText: string, jobDescription: string): Promise<number> {
  const response = await fetchWithAuth('/api/tailor/vector-match', {
    method: 'POST',
    body: JSON.stringify({ resumeText, jobDescription })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to calculate vector score');

  return data.score;
}

// Credits API
export interface CreditsResponse {
  credits: number;
  nextRefillAt: string; // ISO date string
}

export async function getCredits(): Promise<CreditsResponse> {
  const response = await fetchWithAuth('/api/credits/balance');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch credits');
  return { credits: data.credits, nextRefillAt: data.nextRefillAt };
}

// Resume Analysis API
export interface AnalysisIssue {
  type: 'error' | 'warning' | 'info' | 'success';
  category: 'structure' | 'content' | 'ats' | 'impact' | 'completeness';
  message: string;
  field?: string;
  suggestion?: string;
  priority: number;
}

export interface SectionAnalysis {
  name: string;
  score: number;
  status: 'excellent' | 'good' | 'needs_work' | 'missing' | 'critical';
  issues: string[];
  suggestions: string[];
}

export interface ResumeAnalysisResult {
  overallScore: number;
  letterGrade: string;
  summary: string;
  scores: {
    completeness: number;
    impact: number;
    atsCompatibility: number;
    clarity: number;
    relevance: number;
  };
  sectionAnalysis: SectionAnalysis[];
  issues: AnalysisIssue[];
  topPriorities: string[];
  strengths: string[];
  keywords: {
    found: string[];
    missing: string[];
    industryRelevant: string[];
  };
  metrics: {
    bulletPointsWithNumbers: number;
    totalBulletPoints: number;
    percentageQuantified: number;
  };
  actionVerbs: {
    strong: string[];
    weak: string[];
    suggestions: string[];
  };
}

/**
 * Analyze resume data and get personalized feedback
 * Can be used during onboarding before profile is saved
 */
export async function analyzeResume(resumeData: any, useAI = false): Promise<ResumeAnalysisResult> {
  const response = await fetchWithAuth('/api/profiles/analyze', {
    method: 'POST',
    body: JSON.stringify({ resumeData, useAI }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to analyze resume');
  return data.analysis;
}

/**
 * Analyze an existing profile
 */
export async function analyzeProfile(profileId: string, useAI = false): Promise<ResumeAnalysisResult> {
  const response = await fetchWithAuth(`/api/profiles/${profileId}/analyze?ai=${useAI}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to analyze profile');
  return data.analysis;
}
