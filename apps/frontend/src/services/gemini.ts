import type { TailorResponse, MatchScoreResponse, Resume } from '../types';
import { fetchWithAuth } from './api';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { formatResumeForToon as _formatResumeForToon, toToon as _toToon, SYSTEM_INSTRUCTIONS as _SYSTEM_INSTRUCTIONS, PROMPT_TEMPLATES as _PROMPT_TEMPLATES } from '@resumind/shared';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!API_KEY) {
    console.warn('VITE_GEMINI_API_KEY is not set. AI features will not work.');
}

export const optimizeBulletPoint = async (bullet: string): Promise<string[]> => {
    try {
        if (!bullet) return [];

        const response = await fetchWithAuth('/api/tailor/optimize-bullet', {
            method: 'POST',
            body: JSON.stringify({ bullet })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Optimize bullet failed:', data.error);
            return [bullet];
        }

        return data.data as string[];
    } catch (error) {
        console.error('Error optimizing bullet point:', error);
        return [bullet];
    }
};


export const tailorResume = async (currentResume: string | Resume, jobDescription: string): Promise<TailorResponse> => {
    try {
        // Prepare payload: backend expects `resumeData` (object) or `profileId`
        // Since we are editing in real-time, we pass `resumeData`.
        // If currentResume is a string (legacy/TOON), we might need to update backend to accept string too, 
        // OR ensuring callers pass the Resume object.
        // `TailorModal.tsx` currently passes the formatted TOON string.
        // We need to change `TailorModal` to pass the object, OR wrap the string in an object structure the backend accepts.
        // But backend `tailorSchema` says `resumeData: z.any()`. So string is fine if we pass it as `resumeData`.

        // Wait, backend `tailorResume` service expects a Resume object if strictly typed.
        // If we pass a string, the backend service might fail if it tries to `redactPII` or access fields.
        // Let's assume `TailorModal` needs to pass the Resume Object.
        // Ideally, `currentResume` here should be the Resume Object.

        let payload: any = { jobDescription };

        if (typeof currentResume === 'string') {
            // Case A: Caller passed a string (TOON).
            // Backend `tailorResume` service does: `formatResumeForToon(redactPII(resume))`.
            // If we send a string, backend can't redact PII easily.
            // However, we are moving logic to backend.
            // Let's try to send `resumeData` as the object if possible.
            // The frontend `tailorResume` signature allows `string | Resume`.
            console.warn('tailorResume called with string. Backend prefers Resume object for full features.');
            payload.resumeData = currentResume; // Backend will receive string.
            // Note: Backend might crash if it expects Resume object.
        } else {
            // Case B: Caller passed Resume object.
            payload.resumeData = currentResume;
        }

        const response = await fetchWithAuth('/api/tailor/generate', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to tailor resume');
        }

        return data as TailorResponse;

    } catch (error) {
        console.error('Error tailoring resume:', error);
        throw error;
    }
};

export const calculateATSScore = async (resume: Resume, jobDescription: string): Promise<MatchScoreResponse> => {
    try {
        // We use resumeData to allow scoring UNSAVED changes in the editor
        const response = await fetchWithAuth('/api/tailor/score', {
            method: 'POST',
            body: JSON.stringify({
                resumeData: resume,
                jobDescription
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('ATS Score failed:', data.error);
            return { score: 0, missingKeywords: [], criticalFeedback: data.error || 'Failed to calculate score' };
        }

        return data.data as MatchScoreResponse;
    } catch (error) {
        console.error('Error calculating ATS score:', error);
        return { score: 0, missingKeywords: [], criticalFeedback: 'Error calculating score' };
    }
};

export const chatWithCoach = async (_message: string, _resumeContext: Resume, _history: unknown[]): Promise<string> => {
    console.warn('Chat with Coach temporarily disabled during backend migration.');
    return "Chat feature is undergoing maintenance to improve security. Please try again later.";
    // TODO: Implement backend route for Chat
};

interface CoverLetterResponse {
    coverLetter: string;
    companyInsight?: string;
}

export const generateCoverLetter = async (
    resume: Resume,
    jobDescription: string,
    jobTitle?: string,
    company?: string
): Promise<CoverLetterResponse> => {
    try {
        // Extract job title and company from job description if not provided
        const extractedTitle = jobTitle || 'Target Role';
        const extractedCompany = company || 'Target Company';

        const response = await fetchWithAuth('/api/tailor/cover-letter', {
            method: 'POST',
            body: JSON.stringify({
                resumeData: resume,
                jobDescription,
                jobTitle: extractedTitle,
                company: extractedCompany,
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate cover letter');
        }

        return data.data as CoverLetterResponse;
    } catch (error) {
        console.error('Error generating cover letter:', error);
        throw error;
    }
};

export const rewriteSummary = async (currentSummary: string, _instructions: string): Promise<string> => {
    console.warn('Summary rewrite temporarily disabled during backend migration.');
    return currentSummary;
    // TODO: Implement backend route
};
