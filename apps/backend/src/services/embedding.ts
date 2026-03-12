import { GoogleGenAI } from '@google/genai';
import type { Resume } from '@resumind/shared';

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Embedding features will not work.');
}

const genAI = new GoogleGenAI({ apiKey: API_KEY || '' });
const EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Generate embedding vector for text using Gemini text-embedding-004
 * Returns a 768-dimensional vector
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!API_KEY) throw new Error('API Key not set');
  if (!text || text.trim().length === 0) throw new Error('Text cannot be empty');

  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      const result = await genAI.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
        },
      });

      if (!result.embeddings || result.embeddings.length === 0) {
        throw new Error('No embeddings returned from API');
      }

      return result.embeddings[0].values as number[];
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('429')) {
        retries++;
        const delay = Math.pow(2, retries) * 1000 + (Math.random() * 1000);
        console.log(`[Embedding] Rate limit hit. Retrying in ${Math.round(delay)}ms (Attempt ${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Error generating embedding:', error);
        throw error;
      }
    }
  }
  throw new Error('Failed to generate results after max retries');
};

/**
 * Generate embedding for a resume/profile
 * Formats resume as text optimized for semantic matching
 */
export const generateResumeEmbedding = async (resume: Resume): Promise<number[]> => {
  const text = formatResumeForEmbedding(resume);

  try {
    const result = await genAI.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        taskType: 'RETRIEVAL_QUERY', // Query type for profiles (searching for matching jobs)
      },
    });

    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('No embeddings returned from API');
    }

    return result.embeddings[0].values as number[];
  } catch (error) {
    console.error('Error generating resume embedding:', error);
    throw error;
  }
};

/**
 * Generate embedding for a job description
 */
export const generateJobEmbedding = async (jobDescription: string): Promise<number[]> => {
  return generateEmbedding(jobDescription);
};

/**
 * Calculate cosine similarity between two embedding vectors
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    console.warn(`Vector length mismatch: ${a.length} vs ${b.length}. Returning 0 similarity.`);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  // DEBUG: Sample check why score might be 0
  if (Math.random() < 0.05) { // Log 5% of calcs to avoid spam
    console.log('Cosine Debug:', {
      sampleA: a.slice(0, 3),
      sampleB: b.slice(0, 3),
      dotProduct,
      magnitude,
      result: magnitude === 0 ? 0 : dotProduct / magnitude
    });
  }

  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
};

/**
 * Convert cosine similarity to match score (0-100)
 */
export const similarityToScore = (similarity: number): number => {
  // Similarity ranges from -1 to 1, but typically 0.3-0.8 for related content
  // Map to 0-100 scale, with scores below 0.3 becoming very low
  const normalized = Math.max(0, similarity);
  return Math.round(normalized * 100);
};

/**
 * Batch generate embeddings for multiple job descriptions
 * Includes rate limiting to avoid API throttling
 */
export const batchGenerateJobEmbeddings = async (
  jobs: { id: string; description: string }[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, number[]>> => {
  const embeddings = new Map<string, number[]>();
  const BATCH_DELAY_MS = 200; // Delay between requests to avoid rate limiting

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const embedding = await generateJobEmbedding(job.description);
      embeddings.set(job.id, embedding);

      if (onProgress) {
        onProgress(i + 1, jobs.length);
      }

      // Small delay between requests
      if (i < jobs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    } catch (error) {
      console.error(`Error generating embedding for job ${job.id}:`, error);
      // Continue with other jobs even if one fails
    }
  }

  return embeddings;
};

/**
 * Format resume for embedding generation
 * Creates a text representation optimized for semantic matching with job descriptions
 */
function formatResumeForEmbedding(resume: Resume): string {
  const parts: string[] = [];

  // Title/Role (Derived from first experience or summary)
  // PersonalInfo doesn't have a title field in the schema
  if (resume.experience?.length > 0 && resume.experience[0].position) {
    parts.push(`Current Role: ${resume.experience[0].position}`);
  }

  // Summary (high signal)
  if (resume.summary && resume.summary.trim()) {
    parts.push(`Professional Summary: ${resume.summary}`);
  }

  // Skills (critical for matching)
  if (resume.skills?.length) {
    const allSkills = resume.skills.flatMap(group => group.items || []).filter(Boolean);
    if (allSkills.length > 0) {
      parts.push(`Skills: ${allSkills.join(', ')}`);
    }
  }

  // Experience (titles and key responsibilities)
  if (resume.experience?.length) {
    const validExperiences = resume.experience.filter(exp => exp.position || exp.company);
    if (validExperiences.length > 0) {
      parts.push('Experience:');
      for (const exp of validExperiences) {
        if (exp.position || exp.company) {
          parts.push(`${exp.position || 'Role'} at ${exp.company || 'Company'}`);
        }
        if (exp.description?.length) {
          // Include first 3 bullets for each experience
          const bullets = exp.description.slice(0, 3).filter(Boolean).join('. ');
          if (bullets) parts.push(bullets);
        }
      }
    }
  }

  // Education (degree and field)
  if (resume.education?.length) {
    const validEducation = resume.education.filter(edu => edu.degree || edu.fieldOfStudy);
    if (validEducation.length > 0) {
      const eduSummary = validEducation
        .map(edu => `${edu.degree || 'Degree'} in ${edu.fieldOfStudy || 'Field'}`)
        .join(', ');
      parts.push(`Education: ${eduSummary}`);
    }
  }

  // Certifications
  if (resume.certifications?.length) {
    const validCerts = resume.certifications.filter(c => c.name);
    if (validCerts.length > 0) {
      const certNames = validCerts.map(c => c.name).join(', ');
      parts.push(`Certifications: ${certNames}`);
    }
  }

  // Projects (technologies used)
  if (resume.projects?.length) {
    const projectTech = resume.projects.flatMap(p => p.technologies || []).filter(Boolean);
    const uniqueTech = [...new Set(projectTech)];
    if (uniqueTech.length > 0) {
      parts.push(`Project Technologies: ${uniqueTech.join(', ')}`);
    }
  }

  return parts.join('\n');
}

/**
 * Check if resume has enough content to generate a meaningful embedding
 */
export function hasEnoughContentForEmbedding(resume: Resume): boolean {
  const text = formatResumeForEmbedding(resume);
  // Need at least 50 characters of meaningful content
  return text.trim().length >= 50;
}
