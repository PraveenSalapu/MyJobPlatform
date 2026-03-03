
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

// Configure dotenv to read from the root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JSEARCH_API_KEY = process.env.VITE_RAPIDAPI_KEY;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

// Validate required environment variables
const missingVars = [];
if (!SUPABASE_URL) missingVars.push('VITE_SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
if (!JSEARCH_API_KEY) missingVars.push('VITE_RAPIDAPI_KEY');

if (missingVars.length > 0) {
    console.error(`Error: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please ensure these are set in your .env file');
    process.exit(1);
}

// Initialize Supabase with Service Role (Admin Access)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize Gemini
const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const EMBEDDING_MODEL = 'text-embedding-004';
const ANALYSIS_MODEL = 'gemini-1.5-flash';

// --- CONFIGURATION ---

const ATS_DOMAINS = [
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
    'myworkdayjobs.com',
    'jobs.silkroad.com',
    'icims.com',
    'jobvite.com',
    'bamboohr.com'
];

// --- HELPER FUNCTIONS ---

/**
 * Normalizes a job URL to prevent duplicates from tracking parameters
 */
const normalizeJobUrl = (url: string): string => {
    try {
        const urlObj = new URL(url);
        // Remove common tracking parameters
        const paramsToRemove = ['source', 'utm_source', 'utm_medium', 'utm_campaign', 'ref', 'gh_jid', 'lever-source'];
        paramsToRemove.forEach(p => urlObj.searchParams.delete(p));
        return urlObj.toString();
    } catch (e) {
        return url;
    }
};

/**
 * Validates if a string is a valid URL
 */
const isValidUrl = (urlString: string) => {
    try {
        return Boolean(new URL(urlString));
    }
    catch (e) {
        return false;
    }
}

/**
 * Scrapes the full job description from a URL using Cheerio
 */
const scrapeFullJobDescription = async (url: string): Promise<string | null> => {
    if (!isValidUrl(url)) return null;

    console.log(`Scraping full content from: ${url}`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobCrawler/1.0)' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove scripts, styles, navs
        $('script, style, nav, footer, header, aside, .cookie-banner').remove();

        // Target common job description containers
        const selectors = [
            '#job-description', '.job-description', '[class*="description"]',
            'main', 'article', '#content'
        ];

        let text = '';
        for (const sel of selectors) {
            const el = $(sel);
            if (el.length > 0) {
                text = el.text().replace(/\s+/g, ' ').trim();
                if (text.length > 500) break; // Found a good chunk
            }
        }

        // Fallback to body
        if (text.length < 200) {
            text = $('body').text().replace(/\s+/g, ' ').trim();
        }

        return text.length > 200 ? text : null;
    } catch (error) {
        console.error(`Failed to scrape ${url}:`, error instanceof Error ? error.message : String(error));
        return null;
    }
};

/**
 * Generate embedding for a job description using Gemini with Retry Logic
 */
const generateJobEmbedding = async (description: string): Promise<number[] | null> => {
    if (!genAI || !description || description.trim().length === 0) {
        return null;
    }

    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
        try {
            const result = await genAI.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: description.slice(0, 10000), // Limit text length
                config: { taskType: 'RETRIEVAL_DOCUMENT' },
            });

            if (!result.embeddings || result.embeddings.length === 0) {
                return null;
            }

            return result.embeddings[0].values;
        } catch (error: any) {
            if (error.status === 429 || error.message?.includes('429')) {
                retries++;
                const delay = Math.pow(2, retries) * 1000 + (Math.random() * 1000);
                console.log(`Rate limit (429) hit. Retrying in ${Math.round(delay)}ms (Attempt ${retries}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                return null;
            }
        }
    }
    return null;
};

// Metadata Interface
interface JobMetadata {
    experience_level: string;
    job_type: string;
    category: string;
}

/**
 * Analyze job description to extract metadata using Gemini
 */
const analyzeJobMetadata = async (description: string, title: string): Promise<JobMetadata | null> => {
    if (!genAI || !description) return null;

    try {
        const prompt = `
        Analyze this job listing and extract the following metadata in strict JSON format:
        1. experience_level: One of "Entry", "Mid", "Senior", "Lead"
        2. job_type: One of "Full-time", "Contract", "Part-time", "Internship"
        3. category: One of "Frontend", "Backend", "Full Stack", "DevOps", "AI/ML", "Mobile", "Data", "Other"

        Job Title: ${title}
        Description: ${description.slice(0, 1000)}

        Return ONLY the JSON object.
        `;

        const result = await genAI.models.generateContent({
            model: ANALYSIS_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        let jsonString = '';
        if (result && typeof (result as any).text === 'function') {
            jsonString = (result as any).text();
        } else if (result && (result as any).response && typeof (result as any).response.text === 'function') {
            jsonString = (result as any).response.text();
        } else {
            return null;
        }

        jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonString) as JobMetadata;
    } catch (error) {
        return null;
    }
};

interface JSearchJob {
    job_id: string;
    job_title: string;
    employer_name: string;
    job_apply_link: string;
    job_description: string;
    job_posted_at_datetime_utc: string;
    source?: 'RSS' | 'API' | 'Google'; // Track source
}

const fetchJobsFromRapidAPI = async (query: string, datePosted: string = 'month') => {
    const url = 'https://jsearch.p.rapidapi.com/search';
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': JSEARCH_API_KEY,
            'x-rapidapi-host': 'jsearch.p.rapidapi.com'
        }
    };

    try {
        // Use 'month' to ensure we get results
        const fetchUrl = `${url}?query=${encodeURIComponent(query)}&page=1&num_pages=1&date_posted=${datePosted}&country=us`;
        console.log(`Fetching jobs for: "${query}" (date_posted=${datePosted})...`);
        const response = await fetch(fetchUrl, options);
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('RapidAPI Fetch Error:', error);
        return [];
    }
};

const fetchJobsFromGoogle = async (query: string): Promise<JSearchJob[]> => {
    const jobs: JSearchJob[] = [];
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&ibp=htl;jobs`;

    console.log(`Fallback: Google Searching for "${query}"...`);

    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) return [];

        const html = await response.text();
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('greenhouse.io') || href.includes('lever.co') || href.includes('workday'))) {
                const urlObj = new URL(href, 'https://www.google.com');
                const realUrl = urlObj.searchParams.get('q') || href;

                if (isValidUrl(realUrl)) {
                    jobs.push({
                        job_id: Buffer.from(realUrl).toString('base64'),
                        job_title: $(el).text() || 'Unknown Job',
                        employer_name: 'Unknown Company',
                        job_apply_link: realUrl,
                        job_description: 'Fetched via Google Fallback',
                        job_posted_at_datetime_utc: new Date().toISOString(),
                        source: 'Google'
                    });
                }
            }
        });

    } catch (e) {
        console.error('Google Fallback Error (Ignored):', e instanceof Error ? e.message : String(e));
    }

    return jobs;
};

const runCrawler = async () => {
    console.log('--- Starting Job Crawler ---');

    let allJobs: JSearchJob[] = [];

    // 1. PRIMARY: JSearch (Broad Query + NO Strict Filter)
    console.log('--- Phase 1: JSearch (Broad) ---');
    // Using broad query because 'site:' queries were unreliable/unparsed by API occasionally
    // We fetch broad and accept ALL results (No Strict Filtering)
    const query = '"Software Engineer" OR "Developer"';
    const jobs = await fetchJobsFromRapidAPI(query, 'month');

    // Accept all valid job objects with a link
    const validJobs = jobs.filter((job: any) => job.job_apply_link && job.job_title);

    validJobs.forEach((j: any) => j.source = 'API');

    console.log(`Broad Query "${query}" returned ${jobs.length} jobs, ${validJobs.length} valid for processing.`);
    allJobs = [...allJobs, ...validJobs];

    // 2. SECONDARY: Google Boolean Search
    console.log('--- Phase 2: Google Boolean Search ---');
    const googleJobs = await fetchJobsFromGoogle('site:greenhouse.io (Software Engineer) -intitle:profiles -inurl:dir');
    allJobs = [...allJobs, ...googleJobs];

    console.log(`Total unique raw jobs fetched: ${allJobs.length}`);
    console.log('Processing and inserting jobs...');

    let authorizedCount = 0;
    let embeddingCount = 0;
    let analyzedCount = 0;
    let scrapedCount = 0;

    for (const job of allJobs) {
        if (job.job_apply_link && job.job_apply_link.includes('linkedin.com')) continue;

        const normalizedLink = normalizeJobUrl(job.job_apply_link);
        let description = job.job_description || '';

        // --- ENHANCEMENT: SCRAPE IF DESCRIPTION IS POOR ---
        if ((job.source === 'Google' || description.length < 500) && job.job_apply_link) {
            // Only verbose log occasionally
            if (scrapedCount % 5 === 0) console.log(`Enriching job "${job.job_title}" via scraping...`);
            const fullContent = await scrapeFullJobDescription(job.job_apply_link);

            if (fullContent && fullContent.length > description.length) {
                description = fullContent;
                scrapedCount++;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (description.length < 100) {
            console.log(`Skipping job "${job.job_title}" - Description too short.`);
            continue;
        }

        // Check if job exists using NORMALIZED link
        const { data: existing } = await supabase
            .from('jobs')
            .select('id')
            .eq('link', normalizedLink)
            .maybeSingle();

        if (existing) {
            // Skipping log to reduce noise
            continue;
        }

        // Analyze metadata (AI)
        const metadata = await analyzeJobMetadata(description, job.job_title);
        if (metadata) analyzedCount++;

        // Generate embedding
        const embedding = await generateJobEmbedding(description);

        const dbRecord: Record<string, unknown> = {
            title: job.job_title,
            company: job.employer_name,
            link: normalizedLink,
            description: description,
            location: 'Remote/US',
            created_at: job.job_posted_at_datetime_utc,
            experience_level: metadata?.experience_level || 'Mid',
            job_type: metadata?.job_type || 'Full-time',
            category: metadata?.category || 'Other'
        };

        if (embedding) {
            dbRecord.embedding = embedding;
            embeddingCount++;
        }

        const { error } = await supabase.from('jobs').insert(dbRecord);

        if (error) {
            console.error('Insert Error:', error.message);
        } else {
            authorizedCount++;
        }

        if (authorizedCount % 5 === 0 && authorizedCount > 0) {
            console.log(`Processed ${authorizedCount} new jobs so far...`);
        }
    }

    console.log(`Upserted ${authorizedCount} jobs.`);

    // Cleanup Old Jobs (Retention: 30 days to match fetch window)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`Deleting jobs older than: ${thirtyDaysAgo}`);

    const { count } = await supabase
        .from('jobs')
        .delete({ count: 'exact' })
        .lt('created_at', thirtyDaysAgo);

    console.log(`Cleaned up ${count} old jobs.`);
    console.log('--- Crawler Finished ---');
};

runCrawler();
