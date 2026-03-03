/**
 * Resume Analysis Service
 * Provides comprehensive, personalized analysis of resumes
 * Generates actionable feedback based on actual resume content
 */

import { GoogleGenAI } from '@google/genai';
import type { Resume } from '@resumind/shared';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface AnalysisIssue {
  type: 'error' | 'warning' | 'info' | 'success';
  category: 'structure' | 'content' | 'ats' | 'impact' | 'completeness';
  message: string;
  field?: string;
  suggestion?: string;
  priority: number; // 1-5, 1 being highest priority
}

export interface SectionAnalysis {
  name: string;
  score: number; // 0-100
  status: 'excellent' | 'good' | 'needs_work' | 'missing' | 'critical';
  issues: string[];
  suggestions: string[];
}

export interface ResumeAnalysisResult {
  overallScore: number;
  letterGrade: string;
  summary: string;

  // Detailed scores by category
  scores: {
    completeness: number;
    impact: number;
    atsCompatibility: number;
    clarity: number;
    relevance: number;
  };

  // Section-by-section breakdown
  sectionAnalysis: SectionAnalysis[];

  // All issues found
  issues: AnalysisIssue[];

  // Top 3 priorities to fix
  topPriorities: string[];

  // Strengths identified
  strengths: string[];

  // Keywords analysis
  keywords: {
    found: string[];
    missing: string[];
    industryRelevant: string[];
  };

  // Quantification analysis
  metrics: {
    bulletPointsWithNumbers: number;
    totalBulletPoints: number;
    percentageQuantified: number;
  };

  // Action verb analysis
  actionVerbs: {
    strong: string[];
    weak: string[];
    suggestions: string[];
  };
}

/**
 * Analyze resume structure and completeness
 */
function analyzeStructure(resume: Resume): { issues: AnalysisIssue[]; sections: SectionAnalysis[] } {
  const issues: AnalysisIssue[] = [];
  const sections: SectionAnalysis[] = [];

  // Personal Info Analysis
  const personalInfo = resume.personalInfo || {};
  const personalIssues: string[] = [];
  const personalSuggestions: string[] = [];

  if (!personalInfo.fullName?.trim()) {
    personalIssues.push('Name is missing');
    issues.push({
      type: 'error',
      category: 'completeness',
      message: 'Your name is missing from the resume',
      field: 'personalInfo.fullName',
      suggestion: 'Add your full professional name',
      priority: 1,
    });
  }

  if (!personalInfo.email?.trim()) {
    personalIssues.push('Email is missing');
    issues.push({
      type: 'error',
      category: 'completeness',
      message: 'Email address is missing',
      field: 'personalInfo.email',
      suggestion: 'Add a professional email address',
      priority: 1,
    });
  } else if (!personalInfo.email.includes('@')) {
    personalIssues.push('Email format is invalid');
    issues.push({
      type: 'error',
      category: 'structure',
      message: 'Email address format appears invalid',
      field: 'personalInfo.email',
      suggestion: 'Ensure email is in correct format (example@domain.com)',
      priority: 1,
    });
  }

  if (!personalInfo.phone?.trim()) {
    personalIssues.push('Phone number is missing');
    issues.push({
      type: 'warning',
      category: 'completeness',
      message: 'Phone number is missing',
      field: 'personalInfo.phone',
      suggestion: 'Add a phone number for recruiters to reach you',
      priority: 2,
    });
  }

  if (!personalInfo.location?.trim()) {
    personalSuggestions.push('Consider adding your location');
    issues.push({
      type: 'info',
      category: 'completeness',
      message: 'Location is not specified',
      field: 'personalInfo.location',
      suggestion: 'Add city/state or "Remote" to help with job matching',
      priority: 3,
    });
  }

  if (!personalInfo.linkedin?.trim()) {
    personalSuggestions.push('Add LinkedIn profile for credibility');
    issues.push({
      type: 'info',
      category: 'completeness',
      message: 'LinkedIn profile not included',
      field: 'personalInfo.linkedin',
      suggestion: 'Adding LinkedIn increases recruiter trust by 40%',
      priority: 3,
    });
  }

  const personalScore = Math.max(0, 100 - (personalIssues.length * 20));
  sections.push({
    name: 'Contact Information',
    score: personalScore,
    status: personalScore >= 80 ? 'excellent' : personalScore >= 60 ? 'good' : personalScore >= 40 ? 'needs_work' : 'critical',
    issues: personalIssues,
    suggestions: personalSuggestions,
  });

  // Summary Analysis
  const summary = resume.summary?.trim() || '';
  const summaryIssues: string[] = [];
  const summarySuggestions: string[] = [];

  if (!summary) {
    summaryIssues.push('Professional summary is missing');
    issues.push({
      type: 'error',
      category: 'completeness',
      message: 'Professional summary is missing',
      field: 'summary',
      suggestion: 'Add a 2-3 sentence summary highlighting your value proposition',
      priority: 1,
    });
  } else {
    const wordCount = summary.split(/\s+/).length;
    if (wordCount < 20) {
      summaryIssues.push('Summary is too short');
      issues.push({
        type: 'warning',
        category: 'content',
        message: `Summary is only ${wordCount} words - too brief to be impactful`,
        field: 'summary',
        suggestion: 'Expand to 50-100 words covering your expertise, experience level, and key achievements',
        priority: 2,
      });
    } else if (wordCount > 150) {
      summaryIssues.push('Summary is too long');
      issues.push({
        type: 'warning',
        category: 'content',
        message: `Summary is ${wordCount} words - recruiters may skip long summaries`,
        field: 'summary',
        suggestion: 'Condense to 50-100 words focusing on your most impressive qualifications',
        priority: 3,
      });
    }
  }

  const summaryScore = !summary ? 0 : summary.split(/\s+/).length >= 30 ? 85 : 50;
  sections.push({
    name: 'Professional Summary',
    score: summaryScore,
    status: summaryScore >= 80 ? 'excellent' : summaryScore >= 50 ? 'needs_work' : 'missing',
    issues: summaryIssues,
    suggestions: summarySuggestions,
  });

  // Experience Analysis
  const experience = resume.experience || [];
  const expIssues: string[] = [];
  const expSuggestions: string[] = [];

  if (experience.length === 0) {
    expIssues.push('No work experience listed');
    issues.push({
      type: 'error',
      category: 'completeness',
      message: 'Work experience section is empty',
      field: 'experience',
      suggestion: 'Add your relevant work history, internships, or volunteer experience',
      priority: 1,
    });
  } else {
    experience.forEach((exp, index) => {
      if (!exp.company?.trim()) {
        issues.push({
          type: 'error',
          category: 'completeness',
          message: `Experience #${index + 1}: Company name is missing`,
          field: `experience[${index}].company`,
          priority: 2,
        });
      }
      if (!exp.position?.trim()) {
        issues.push({
          type: 'error',
          category: 'completeness',
          message: `Experience #${index + 1}: Job title is missing`,
          field: `experience[${index}].position`,
          priority: 2,
        });
      }

      const bullets = exp.description || [];
      if (bullets.length === 0) {
        expIssues.push(`${exp.company || 'One role'} has no bullet points`);
        issues.push({
          type: 'warning',
          category: 'content',
          message: `${exp.position || 'Role'} at ${exp.company || 'Company'} has no accomplishments listed`,
          field: `experience[${index}].description`,
          suggestion: 'Add 3-5 bullet points highlighting your achievements and responsibilities',
          priority: 2,
        });
      } else if (bullets.length < 2) {
        expSuggestions.push(`Add more details to ${exp.company}`);
      }
    });
  }

  const expScore = experience.length === 0 ? 0 :
    Math.min(100, 50 + (experience.length * 10) +
    (experience.reduce((sum, e) => sum + (e.description?.length || 0), 0) * 5));

  sections.push({
    name: 'Work Experience',
    score: Math.min(100, expScore),
    status: expScore >= 80 ? 'excellent' : expScore >= 50 ? 'good' : expScore > 0 ? 'needs_work' : 'missing',
    issues: expIssues,
    suggestions: expSuggestions,
  });

  // Skills Analysis
  const skills = resume.skills || [];
  const skillIssues: string[] = [];
  const skillSuggestions: string[] = [];
  const totalSkills = skills.reduce((sum, group) => sum + (group.items?.length || 0), 0);

  if (totalSkills === 0) {
    skillIssues.push('No skills listed');
    issues.push({
      type: 'error',
      category: 'completeness',
      message: 'Skills section is empty',
      field: 'skills',
      suggestion: 'Add technical skills, tools, and technologies you\'re proficient in',
      priority: 1,
    });
  } else if (totalSkills < 5) {
    skillIssues.push('Very few skills listed');
    issues.push({
      type: 'warning',
      category: 'completeness',
      message: `Only ${totalSkills} skills listed - this may appear insufficient`,
      field: 'skills',
      suggestion: 'Add more relevant skills (aim for 10-20 total skills)',
      priority: 2,
    });
  }

  if (skills.length === 1 || skills.every(g => !g.category?.trim())) {
    skillSuggestions.push('Organize skills into categories');
    issues.push({
      type: 'info',
      category: 'structure',
      message: 'Skills are not categorized',
      field: 'skills',
      suggestion: 'Group skills by category (e.g., Languages, Frameworks, Tools) for better readability',
      priority: 4,
    });
  }

  const skillScore = totalSkills === 0 ? 0 : Math.min(100, 30 + (totalSkills * 5) + (skills.length * 10));
  sections.push({
    name: 'Skills',
    score: skillScore,
    status: skillScore >= 80 ? 'excellent' : skillScore >= 50 ? 'good' : skillScore > 0 ? 'needs_work' : 'missing',
    issues: skillIssues,
    suggestions: skillSuggestions,
  });

  // Education Analysis
  const education = resume.education || [];
  const eduIssues: string[] = [];

  if (education.length === 0) {
    issues.push({
      type: 'warning',
      category: 'completeness',
      message: 'Education section is empty',
      field: 'education',
      suggestion: 'Add your educational background, certifications, or relevant coursework',
      priority: 3,
    });
  }

  const eduScore = education.length === 0 ? 40 : Math.min(100, 60 + (education.length * 20));
  sections.push({
    name: 'Education',
    score: eduScore,
    status: eduScore >= 80 ? 'excellent' : eduScore >= 50 ? 'good' : 'needs_work',
    issues: eduIssues,
    suggestions: [],
  });

  // Projects Analysis
  const projects = resume.projects || [];
  const projectScore = projects.length === 0 ? 50 : Math.min(100, 60 + (projects.length * 15));

  if (projects.length === 0 && experience.length < 2) {
    issues.push({
      type: 'info',
      category: 'completeness',
      message: 'No projects listed',
      field: 'projects',
      suggestion: 'Adding personal or academic projects can strengthen your profile, especially with limited work experience',
      priority: 3,
    });
  }

  sections.push({
    name: 'Projects',
    score: projectScore,
    status: projects.length > 0 ? (projectScore >= 80 ? 'excellent' : 'good') : 'missing',
    issues: [],
    suggestions: projects.length === 0 ? ['Consider adding relevant projects'] : [],
  });

  return { issues, sections };
}

/**
 * Analyze bullet points for impact and quantification
 */
function analyzeBulletPoints(resume: Resume): {
  issues: AnalysisIssue[];
  metrics: ResumeAnalysisResult['metrics'];
  actionVerbs: ResumeAnalysisResult['actionVerbs'];
} {
  const issues: AnalysisIssue[] = [];
  const allBullets: string[] = [];

  // Collect all bullet points
  (resume.experience || []).forEach(exp => {
    (exp.description || []).forEach(bullet => allBullets.push(bullet));
  });
  (resume.projects || []).forEach(proj => {
    (proj.description || []).forEach(bullet => allBullets.push(bullet));
  });

  // Count quantified bullets (contain numbers)
  const quantifiedBullets = allBullets.filter(b => /\d+/.test(b));
  const percentageQuantified = allBullets.length > 0
    ? Math.round((quantifiedBullets.length / allBullets.length) * 100)
    : 0;

  if (allBullets.length > 0 && percentageQuantified < 30) {
    issues.push({
      type: 'warning',
      category: 'impact',
      message: `Only ${percentageQuantified}% of bullet points contain metrics`,
      suggestion: 'Add numbers, percentages, or metrics to demonstrate impact (e.g., "Increased sales by 25%")',
      priority: 2,
    });
  }

  // Strong action verbs
  const strongVerbs = ['led', 'developed', 'designed', 'implemented', 'created', 'built', 'launched',
    'increased', 'decreased', 'improved', 'optimized', 'streamlined', 'spearheaded', 'orchestrated',
    'achieved', 'delivered', 'transformed', 'pioneered', 'established', 'generated', 'reduced'];

  // Weak verbs to avoid
  const weakVerbs = ['helped', 'assisted', 'worked on', 'was responsible for', 'participated in',
    'involved in', 'handled', 'dealt with', 'did', 'made'];

  const foundStrongVerbs: string[] = [];
  const foundWeakVerbs: string[] = [];

  allBullets.forEach(bullet => {
    const lowerBullet = bullet.toLowerCase();
    strongVerbs.forEach(verb => {
      if (lowerBullet.startsWith(verb) || lowerBullet.includes(` ${verb} `)) {
        if (!foundStrongVerbs.includes(verb)) foundStrongVerbs.push(verb);
      }
    });
    weakVerbs.forEach(verb => {
      if (lowerBullet.startsWith(verb) || lowerBullet.includes(verb)) {
        if (!foundWeakVerbs.includes(verb)) foundWeakVerbs.push(verb);
      }
    });
  });

  if (foundWeakVerbs.length > 0) {
    issues.push({
      type: 'warning',
      category: 'content',
      message: `Weak action verbs detected: "${foundWeakVerbs.slice(0, 3).join('", "')}"`,
      suggestion: `Replace with stronger verbs like: ${strongVerbs.slice(0, 5).join(', ')}`,
      priority: 3,
    });
  }

  // Check for first-person pronouns
  const bulletsWithPronouns = allBullets.filter(b =>
    /\b(I|my|me|we|our)\b/i.test(b)
  );
  if (bulletsWithPronouns.length > 0) {
    issues.push({
      type: 'warning',
      category: 'ats',
      message: 'First-person pronouns detected in bullet points',
      suggestion: 'Remove "I", "my", "we" - start bullets with action verbs instead',
      priority: 3,
    });
  }

  return {
    issues,
    metrics: {
      bulletPointsWithNumbers: quantifiedBullets.length,
      totalBulletPoints: allBullets.length,
      percentageQuantified,
    },
    actionVerbs: {
      strong: foundStrongVerbs,
      weak: foundWeakVerbs,
      suggestions: strongVerbs.filter(v => !foundStrongVerbs.includes(v)).slice(0, 5),
    },
  };
}

/**
 * Extract keywords from resume for ATS analysis
 */
function extractKeywords(resume: Resume): ResumeAnalysisResult['keywords'] {
  const allText: string[] = [];

  // Collect all text content
  allText.push(resume.summary || '');
  allText.push(resume.title || '');

  (resume.experience || []).forEach(exp => {
    allText.push(exp.position || '');
    allText.push(exp.company || '');
    (exp.description || []).forEach(d => allText.push(d));
  });

  (resume.skills || []).forEach(group => {
    (group.items || []).forEach(skill => allText.push(skill));
  });

  (resume.projects || []).forEach(proj => {
    allText.push(proj.name || '');
    (proj.technologies || []).forEach(t => allText.push(t));
    (proj.description || []).forEach(d => allText.push(d));
  });

  const fullText = allText.join(' ').toLowerCase();

  // Common tech keywords to check
  const techKeywords = [
    'javascript', 'typescript', 'python', 'java', 'react', 'node', 'angular', 'vue',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'sql', 'nosql', 'mongodb',
    'git', 'ci/cd', 'agile', 'scrum', 'rest', 'api', 'graphql', 'microservices',
    'machine learning', 'ai', 'data analysis', 'testing', 'devops', 'linux'
  ];

  const found = techKeywords.filter(kw => fullText.includes(kw.toLowerCase()));

  // Skills already listed
  const listedSkills = (resume.skills || [])
    .flatMap(g => g.items || [])
    .map(s => s.toLowerCase());

  return {
    found,
    missing: techKeywords.filter(kw => !fullText.includes(kw.toLowerCase())).slice(0, 10),
    industryRelevant: listedSkills.slice(0, 15),
  };
}

/**
 * Calculate overall score from component scores
 */
function calculateOverallScore(scores: ResumeAnalysisResult['scores']): { score: number; grade: string } {
  const weights = {
    completeness: 0.25,
    impact: 0.25,
    atsCompatibility: 0.20,
    clarity: 0.15,
    relevance: 0.15,
  };

  const score = Math.round(
    scores.completeness * weights.completeness +
    scores.impact * weights.impact +
    scores.atsCompatibility * weights.atsCompatibility +
    scores.clarity * weights.clarity +
    scores.relevance * weights.relevance
  );

  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 85) grade = 'A';
  else if (score >= 80) grade = 'A-';
  else if (score >= 75) grade = 'B+';
  else if (score >= 70) grade = 'B';
  else if (score >= 65) grade = 'B-';
  else if (score >= 60) grade = 'C+';
  else if (score >= 55) grade = 'C';
  else if (score >= 50) grade = 'C-';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return { score, grade };
}

/**
 * Main analysis function - performs comprehensive resume analysis
 */
export async function analyzeResume(resume: Resume): Promise<ResumeAnalysisResult> {
  // Structural analysis
  const { issues: structureIssues, sections } = analyzeStructure(resume);

  // Bullet point analysis
  const { issues: bulletIssues, metrics, actionVerbs } = analyzeBulletPoints(resume);

  // Keywords extraction
  const keywords = extractKeywords(resume);

  // Combine all issues
  const allIssues = [...structureIssues, ...bulletIssues];

  // Calculate section scores
  const sectionScores = sections.reduce((acc, s) => acc + s.score, 0) / sections.length;

  // Calculate component scores
  const completenessScore = sections
    .filter(s => ['Contact Information', 'Professional Summary', 'Work Experience', 'Skills'].includes(s.name))
    .reduce((acc, s) => acc + s.score, 0) / 4;

  const impactScore = metrics.totalBulletPoints > 0
    ? Math.min(100, 40 + metrics.percentageQuantified + (actionVerbs.strong.length * 5))
    : 30;

  const atsScore = Math.min(100, 50 + (keywords.found.length * 3) - (allIssues.filter(i => i.category === 'ats').length * 10));

  const clarityScore = Math.min(100, 70 - (allIssues.filter(i => i.category === 'structure').length * 10));

  const relevanceScore = Math.min(100, 50 + (keywords.industryRelevant.length * 3));

  const scores = {
    completeness: Math.round(completenessScore),
    impact: Math.round(impactScore),
    atsCompatibility: Math.round(Math.max(0, atsScore)),
    clarity: Math.round(Math.max(0, clarityScore)),
    relevance: Math.round(relevanceScore),
  };

  const { score: overallScore, grade: letterGrade } = calculateOverallScore(scores);

  // Identify strengths
  const strengths: string[] = [];
  if (scores.completeness >= 80) strengths.push('Comprehensive contact information');
  if (metrics.percentageQuantified >= 50) strengths.push('Good use of metrics and quantification');
  if (actionVerbs.strong.length >= 5) strengths.push('Strong action verbs used');
  if ((resume.experience?.length || 0) >= 3) strengths.push('Solid work experience history');
  if (keywords.industryRelevant.length >= 10) strengths.push('Good technical keyword coverage');
  if (sections.find(s => s.name === 'Projects')?.score || 0 >= 70) strengths.push('Strong project portfolio');

  // Generate summary
  let summary: string;
  if (overallScore >= 80) {
    summary = `Excellent resume! Your profile is well-structured and ATS-optimized. Focus on the ${allIssues.filter(i => i.priority <= 2).length} minor improvements below to make it even stronger.`;
  } else if (overallScore >= 60) {
    summary = `Good foundation, but there's room for improvement. Address the ${allIssues.filter(i => i.priority <= 2).length} key issues below to significantly boost your chances.`;
  } else if (overallScore >= 40) {
    summary = `Your resume needs attention in several areas. Focus on the critical issues first - completing missing sections and adding more impactful content.`;
  } else {
    summary = `Your resume is missing essential components. Start by adding basic information and work experience to create a strong foundation.`;
  }

  // Top priorities
  const topPriorities = allIssues
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(i => i.suggestion || i.message);

  return {
    overallScore,
    letterGrade,
    summary,
    scores,
    sectionAnalysis: sections,
    issues: allIssues.sort((a, b) => a.priority - b.priority),
    topPriorities,
    strengths,
    keywords,
    metrics,
    actionVerbs,
  };
}

/**
 * AI-enhanced analysis for deeper insights
 * Uses Gemini to provide personalized recommendations
 */
export async function analyzeResumeWithAI(resume: Resume): Promise<ResumeAnalysisResult> {
  // First do the rule-based analysis
  const baseAnalysis = await analyzeResume(resume);

  // If score is already good or resume is too empty, skip AI enhancement
  if (baseAnalysis.overallScore >= 85 || baseAnalysis.scores.completeness < 30) {
    return baseAnalysis;
  }

  try {
    // Build resume context for AI
    const resumeContext = `
Name: ${resume.personalInfo?.fullName || 'Not provided'}
Title: ${resume.title || 'Not provided'}
Summary: ${resume.summary || 'Not provided'}
Experience: ${(resume.experience || []).map(e => `${e.position} at ${e.company}`).join(', ') || 'None'}
Skills: ${(resume.skills || []).flatMap(g => g.items || []).join(', ') || 'None'}
Education: ${(resume.education || []).map(e => `${e.degree} from ${e.institution}`).join(', ') || 'None'}
    `.trim();

    const prompt = `You are an expert resume coach. Analyze this resume and provide 3 specific, actionable improvements.

RESUME:
${resumeContext}

CURRENT ISSUES IDENTIFIED:
${baseAnalysis.issues.slice(0, 5).map(i => `- ${i.message}`).join('\n')}

Provide exactly 3 personalized suggestions that are specific to THIS person's background. Focus on:
1. How to better highlight their unique experience
2. What specific skills or achievements to emphasize
3. Industry-specific improvements

Return as JSON array of strings: ["suggestion1", "suggestion2", "suggestion3"]`;

    const result = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const aiSuggestions = JSON.parse(result.text || '[]');

    if (Array.isArray(aiSuggestions) && aiSuggestions.length > 0) {
      // Add AI suggestions as info-level issues
      aiSuggestions.forEach((suggestion: string, index: number) => {
        baseAnalysis.issues.push({
          type: 'info',
          category: 'content',
          message: suggestion,
          priority: 4 + index,
        });
      });

      // Update summary to be more personalized
      const name = resume.personalInfo?.fullName?.split(' ')[0] || 'there';
      baseAnalysis.summary = `Hi ${name}! ${baseAnalysis.summary}`;
    }
  } catch (error) {
    console.error('AI enhancement failed, using base analysis:', error);
  }

  return baseAnalysis;
}
