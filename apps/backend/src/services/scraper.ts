// AI-Powered Job Scraper Service
// Uses Fetch + Cheerio + Gemini for intelligent job extraction

import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import type { ScrapedJobData } from '@resumind/shared';

const API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: API_KEY || '' });
const MODEL_NAME = 'gemini-2.5-flash';

// Preprocessed content from Cheerio
interface ExtractedContent {
  title: string;
  company: string;
  rawText: string;
  structuredSections: string[];
}

// Clean JSON output from AI response
const cleanJsonOutput = (text: string): string => {
  let cleaned = text.trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
};

// Fetch HTML with browser-like headers
export async function fetchJobPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds');
    }
    throw error;
  }
}

// Cheerio preprocessing to extract relevant content and reduce tokens
export function preprocessHTML(html: string): ExtractedContent {
  const $ = cheerio.load(html);

  // Remove noise elements
  $('script, style, nav, footer, header, aside, iframe, noscript, svg, img').remove();
  $('[class*="cookie"], [class*="banner"], [class*="popup"], [class*="modal"]').remove();
  $('[class*="advertisement"], [class*="sidebar"], [class*="menu"]').remove();

  // Try to find title
  const title =
    $('h1').first().text().trim() ||
    $('[class*="job-title"]').first().text().trim() ||
    $('[class*="jobTitle"]').first().text().trim() ||
    $('[class*="position"]').first().text().trim() ||
    $('[data-testid*="title"]').first().text().trim() ||
    $('title').text().split('|')[0].split('-')[0].trim();

  // Try to find company
  const company =
    $('[class*="company"]').first().text().trim() ||
    $('[class*="employer"]').first().text().trim() ||
    $('[itemprop="hiringOrganization"]').text().trim() ||
    $('meta[property="og:site_name"]').attr('content') ||
    '';

  // Extract text from likely job description areas
  const sections: string[] = [];
  const sectionSelectors = [
    '[class*="description"]',
    '[class*="requirements"]',
    '[class*="qualifications"]',
    '[class*="responsibilities"]',
    '[class*="about-job"]',
    '[class*="job-details"]',
    '[id*="description"]',
    '[id*="requirements"]',
    'article',
    'main',
    '[role="main"]',
  ];

  const seenText = new Set<string>();

  for (const selector of sectionSelectors) {
    $(selector).each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      // Avoid duplicates and filter by length
      if (text.length > 100 && text.length < 15000 && !seenText.has(text)) {
        // Check if this text is not a subset of already collected text
        let isSubset = false;
        for (const existing of seenText) {
          if (existing.includes(text) || text.includes(existing)) {
            isSubset = true;
            break;
          }
        }
        if (!isSubset) {
          sections.push(text);
          seenText.add(text);
        }
      }
    });
  }

  // Fallback: get main body text
  const rawText = $('body').text()
    .replace(/\s+/g, ' ')
    .substring(0, 30000); // Limit for Gemini context

  return { title, company, rawText, structuredSections: sections.slice(0, 5) };
}

// Gemini extraction with structured output
export async function extractJobDataWithAI(
  url: string,
  preprocessed: ExtractedContent
): Promise<ScrapedJobData> {
  if (!API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const contentForAI = preprocessed.structuredSections.length > 0
    ? `STRUCTURED SECTIONS:\n${preprocessed.structuredSections.join('\n\n---\n\n')}`
    : `RAW PAGE TEXT:\n${preprocessed.rawText.substring(0, 20000)}`;

  const prompt = `
You are a job posting data extractor. Extract structured information from the following web page content.

URL: ${url}

${contentForAI}

Pre-detected hints:
- Title hint: ${preprocessed.title || 'Not found'}
- Company hint: ${preprocessed.company || 'Not found'}

INSTRUCTIONS:
1. Extract the job title, company name, location, and full job description.
2. The description should include ALL of:
   - Job responsibilities/duties
   - Required qualifications/requirements
   - Preferred qualifications (if available)
   - Skills required
3. If the content seems incomplete or you cannot find the full job description, use the googleSearch tool to search for: "${preprocessed.title || 'job'} ${preprocessed.company || ''} job description requirements"
4. Clean up any HTML artifacts, navigation text, or irrelevant content.
5. Return valid JSON only.

OUTPUT FORMAT (return ONLY this JSON, no markdown):
{
  "title": "Job Title",
  "company": "Company Name",
  "location": "City, State or Remote",
  "description": "Full job description with all requirements and qualifications...",
  "salary": "Salary range if mentioned, or null"
}
`;

  try {
    const result = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: 'You are a professional job data extractor. Extract accurate, complete structured data from job listings. Use web search if the provided content is incomplete. Output strictly valid JSON.',
      },
    });

    const text = result.text || '';

    // Parse JSON from response
    const cleaned = cleanJsonOutput(text);
    if (!cleaned) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || preprocessed.title || 'Unknown Position',
      company: parsed.company || preprocessed.company || 'Unknown Company',
      description: parsed.description || 'No description available',
      location: parsed.location || undefined,
      salary: parsed.salary || undefined,
      url: url,
      platform: 'ai-extracted',
    };
  } catch (error) {
    console.error('AI extraction error:', error);

    // If AI fails, return what we have from preprocessing
    if (preprocessed.structuredSections.length > 0) {
      return {
        title: preprocessed.title || 'Unknown Position',
        company: preprocessed.company || 'Unknown Company',
        description: preprocessed.structuredSections.join('\n\n'),
        url: url,
        platform: 'cheerio-fallback',
      };
    }

    throw error;
  }
}

// Main extraction function - combines all steps
export async function extractJobFromUrl(
  url: string,
  partialData?: { title?: string; company?: string }
): Promise<{ data: ScrapedJobData; method: string }> {
  let method = 'fetch-ai';
  let preprocessed: ExtractedContent;

  try {
    // Step 1: Fetch the page
    const html = await fetchJobPage(url);

    // Step 2: Preprocess with Cheerio
    preprocessed = preprocessHTML(html);

    // Merge with any partial data from extension
    if (partialData?.title && !preprocessed.title) {
      preprocessed.title = partialData.title;
    }
    if (partialData?.company && !preprocessed.company) {
      preprocessed.company = partialData.company;
    }
  } catch (fetchError) {
    console.log('Fetch failed, attempting AI-only extraction:', fetchError);
    method = 'ai-search-only';

    // Create minimal preprocessed data for AI-only extraction
    preprocessed = {
      title: partialData?.title || '',
      company: partialData?.company || '',
      rawText: '',
      structuredSections: [],
    };
  }

  // Step 3: Extract with Gemini
  const jobData = await extractJobDataWithAI(url, preprocessed);

  return { data: jobData, method };
}
