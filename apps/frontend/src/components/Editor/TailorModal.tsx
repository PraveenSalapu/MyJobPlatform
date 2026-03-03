import { useState, useEffect } from 'react';
import { X, Wand2, Loader2, Lightbulb, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useRealtimeMatch } from '../../hooks/useRealtimeMatch';
import { useResume } from '../../context/ResumeContext';
import { useAuth } from '../../context/AuthContext';
import { tailorResume } from '../../services/gemini';
import type { TailorResponse, Resume } from '../../types';
import { useToast } from '../../context/ToastContext';
import ErrorBoundary from '../ErrorBoundary';

interface TailorModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobDescription?: string;
}

export const TailorModal = ({ isOpen, onClose, jobDescription: initialJD = '' }: TailorModalProps) => {
    const { resume, dispatch } = useResume();
    const { credits, nextRefillAt, refreshCredits } = useAuth();

    // Format refill date for display
    const formatRefillDate = (isoDate: string | null): string => {
        if (!isoDate) return 'in 5 days';
        const refillDate = new Date(isoDate);
        const now = new Date();
        const diffMs = refillDate.getTime() - now.getTime();

        if (diffMs <= 0) return 'soon';

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (diffDays > 0) {
            return diffHours > 0 ? `${diffDays} days ${diffHours} hours` : `${diffDays} days`;
        } else if (diffHours > 0) {
            return `${diffHours} hours`;
        } else {
            const diffMins = Math.floor(diffMs / (1000 * 60));
            return `${diffMins} minutes`;
        }
    };
    const { addToast } = useToast();
    const [jobDescription, setJobDescription] = useState(initialJD);
    const [isTailoring, setIsTailoring] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tailorResult, setTailorResult] = useState<TailorResponse | null>(null);
    const [showReasoning, setShowReasoning] = useState(true);
    const [selectedImprovements, setSelectedImprovements] = useState<{
        experience: { [key: string]: { revised: number[], suggested: number[], dropped: number[] } },
        projects: number[]
    }>({ experience: {}, projects: [] });
    const [jobUrl, setJobUrl] = useState('');

    // Update local state if prop changes or resume context has tailoring job
    useEffect(() => {
        if (resume.tailoringJob) {
            const { title, company, description, link } = resume.tailoringJob;
            const composedDescription = `Role: ${title}\nCompany: ${company}\nLink: ${link || 'N/A'}\n\nJob Description:\n${description || ''}`;
            setJobDescription(composedDescription.trim());
            if (link) setJobUrl(link);
        } else if (initialJD) {
            setJobDescription(initialJD);
        }
    }, [initialJD, resume.tailoringJob]);

    // Extract URL from job description
    useEffect(() => {
        if (!jobUrl && jobDescription) {
            // Try to extract URL from the job description
            const urlMatch = jobDescription.match(/https?:\/\/[^\s]+/);
            if (urlMatch) {
                setJobUrl(urlMatch[0].replace(/[.,;)>\]]+$/, '')); // Remove trailing punctuation
            }
            // Also check for "Link:" pattern
            const linkMatch = jobDescription.match(/Link:\s*(https?:\/\/[^\s]+)/i);
            if (linkMatch) {
                setJobUrl(linkMatch[1].replace(/[.,;)>\]]+$/, ''));
            }
        }
    }, [jobDescription, jobUrl]);

    // Initialize selection state when results come in
    useEffect(() => {
        if (tailorResult) {
            const initialSelection: typeof selectedImprovements = { experience: {}, projects: [] };

            // Select all experience improvements by default
            tailorResult.improvedExperience?.forEach(exp => {
                initialSelection.experience[exp.experienceId] = {
                    revised: exp.revisedBullets?.map((_, i) => i) || [],
                    suggested: exp.suggestedAdditions?.map((_, i) => i) || [], // Renamed from recommended
                    dropped: exp.bulletsToDrop?.map((_, i) => i) || [] // New: drop selection
                };
            });

            // Select all projects by default
            initialSelection.projects = tailorResult.projectSuggestions?.map((_, i) => i) || [];

            setSelectedImprovements(initialSelection);
        }
    }, [tailorResult]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setTailorResult(null);
            setError(null);
            setShowReasoning(true);
            setSelectedImprovements({ experience: {}, projects: [] });
        }
    }, [isOpen]);

    const handleAnalyze = async () => {
        if (!jobDescription.trim()) return;

        setIsTailoring(true);
        setError(null);
        setTailorResult(null);

        try {
            // Use TOON format for ~40-60% token savings
            // The tailorResume function handles TOON encoding internally
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { history, historyIndex, ...resumeWithoutHistory } = resume as any;
            const resumeForTailor = resumeWithoutHistory as Resume;

            const result = await tailorResume(resumeForTailor, jobDescription);
            setTailorResult(result);
            addToast('success', 'Resume analyzed successfully');
            refreshCredits(); // Refresh balance after spending
        } catch (err: any) {
            console.error(err);
            const msg = err.message || 'Failed to tailor resume. Please try again.';
            setError(msg);
            addToast('error', msg);
        } finally {
            setIsTailoring(false);
        }
    };

    const toggleExperienceSelection = (expId: string, type: 'revised' | 'suggested' | 'dropped', index: number) => {
        setSelectedImprovements(prev => {
            const current = prev.experience[expId] || { revised: [], suggested: [], dropped: [] };
            const list = current[type];
            const newList = list.includes(index)
                ? list.filter(i => i !== index)
                : [...list, index];

            return {
                ...prev,
                experience: {
                    ...prev.experience,
                    [expId]: { ...current, [type]: newList }
                }
            };
        });
    };

    const toggleProjectSelection = (index: number) => {
        setSelectedImprovements(prev => {
            const newList = prev.projects.includes(index)
                ? prev.projects.filter(i => i !== index)
                : [...prev.projects, index];
            return { ...prev, projects: newList };
        });
    };

    const handleApplyChanges = () => {
        if (!tailorResult) return;

        const { tailoredSummary, missingHardSkills, improvedExperience, projectSuggestions } = tailorResult;

        // 1. Update Skills
        let newSkills = [...resume.skills];

        // CATEGORY NORMALIZATION MAPPING
        // Maps various potential AI outputs to our 5 standard categories
        const CATEGORY_MAP: Record<string, string> = {
            // 1. Programming Languages
            'python': 'Programming Languages', 'java': 'Programming Languages', 'javascript': 'Programming Languages',
            'typescript': 'Programming Languages', 'c#': 'Programming Languages', 'sql': 'Programming Languages',
            'go': 'Programming Languages', 'languages': 'Programming Languages', 'coding': 'Programming Languages',

            // 2. Cloud & Infrastructure
            'aws': 'Cloud & Infrastructure', 'amazon web services': 'Cloud & Infrastructure',
            'azure': 'Cloud & Infrastructure', 'gcp': 'Cloud & Infrastructure', 'cloud': 'Cloud & Infrastructure',
            'infrastructure': 'Cloud & Infrastructure', 'infrastructure as code': 'Cloud & Infrastructure',

            // 3. Frameworks & Architecture
            'frameworks': 'Frameworks & Architecture', 'architecture': 'Frameworks & Architecture',
            'spring': 'Frameworks & Architecture', '.net': 'Frameworks & Architecture',
            'react': 'Frameworks & Architecture', 'node': 'Frameworks & Architecture',
            'microservices': 'Frameworks & Architecture', 'system design': 'Frameworks & Architecture',

            // 4. DevOps & AI
            'devops': 'DevOps & AI', 'cicd': 'DevOps & AI', 'containers': 'DevOps & AI',
            'kubernetes': 'DevOps & AI', 'docker': 'DevOps & AI', 'ai': 'DevOps & AI',
            'artificial intelligence': 'DevOps & AI', 'machine learning': 'DevOps & AI',
            'mlops': 'DevOps & AI', 'genai': 'DevOps & AI',

            // 5. Tools & Platforms
            'tools': 'Tools & Platforms', 'platforms': 'Tools & Platforms',
            'databases': 'Tools & Platforms', 'testing': 'Tools & Platforms',
            'monitoring': 'Tools & Platforms', 'ide': 'Tools & Platforms',
            'software': 'Tools & Platforms'
        };

        const normalizeCategory = (cat: string) => {
            if (!cat) return 'Skills';
            const lower = cat.toLowerCase().trim();
            // 1. Direct Map Check
            if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
            // 2. Partial Match Check (e.g. "AWS Services" -> "Cloud...")
            const keys = Object.keys(CATEGORY_MAP);
            for (const k of keys) {
                if (lower.includes(k)) return CATEGORY_MAP[k];
            }
            // 3. Fallback: Title Case the original
            return cat.charAt(0).toUpperCase() + cat.slice(1);
        };

        if (missingHardSkills && missingHardSkills.length > 0) {
            missingHardSkills.forEach(skill => {
                const rawCategory = skill.category || 'Skills';
                const targetCategoryName = normalizeCategory(rawCategory);

                // Find matching category (case-insensitive)
                const existingCategoryIndex = newSkills.findIndex(s =>
                    (s.category || '').toLowerCase().trim() === targetCategoryName.toLowerCase().trim()
                );

                if (existingCategoryIndex >= 0) {
                    // Add to existing category if not already present
                    if (!newSkills[existingCategoryIndex].items.includes(skill.name)) {
                        newSkills[existingCategoryIndex] = {
                            ...newSkills[existingCategoryIndex],
                            items: [...newSkills[existingCategoryIndex].items, skill.name]
                        };
                    }
                } else {
                    // Create new category
                    newSkills.push({
                        id: crypto.randomUUID(),
                        category: targetCategoryName,
                        items: [skill.name]
                    });
                }
            });
        }

        // 2. Update Experience
        let newExperience = [...resume.experience];
        if (improvedExperience && Array.isArray(improvedExperience)) {
            improvedExperience.forEach(update => {
                const index = newExperience.findIndex(e => e.id === update.experienceId);
                if (index !== -1) {
                    let currentBullets = [...newExperience[index].description];
                    const selections = selectedImprovements.experience[update.experienceId];
                    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]$/, '');

                    // Helper for fuzzy matching (same as used in Revisions below)
                    const isMatch = (bullet: string, target: string) => {
                        const normB = normalize(bullet);
                        return normB === target ||
                            normB.includes(target) ||
                            target.includes(normB) ||
                            (target.length > 10 && normB.startsWith(target.substring(0, 10)));
                    };

                    // A. Remove Dropped Bullets First (if selected)
                    if (update.bulletsToDrop && selections?.dropped) {
                        update.bulletsToDrop.forEach((drop, i) => {
                            if (selections.dropped.includes(i)) {
                                const target = normalize(drop.original);
                                currentBullets = currentBullets.filter(b => !isMatch(b, target));
                            }
                        });
                    }

                    // B. Apply Revisions (if selected)
                    if (update.revisedBullets && selections?.revised) {
                        update.revisedBullets.forEach((revised, i) => {
                            if (selections.revised.includes(i)) {
                                const target = normalize(revised.original);
                                let bulletIndex = currentBullets.findIndex(b => normalize(b) === target);

                                // Fallback: Fuzzy search
                                if (bulletIndex === -1) {
                                    bulletIndex = currentBullets.findIndex(b => {
                                        const normB = normalize(b);
                                        return normB.includes(target) || target.includes(normB) || (target.length > 10 && normB.startsWith(target.substring(0, 10)));
                                    });
                                }

                                if (bulletIndex !== -1) {
                                    currentBullets[bulletIndex] = revised.new;
                                }
                            }
                        });
                    }

                    // C. Append Suggestions (if selected) - formerly recommendations
                    if (update.suggestedAdditions && selections?.suggested) {
                        update.suggestedAdditions.forEach((rec, i) => {
                            if (selections.suggested.includes(i)) {
                                currentBullets.push(rec.bullet);
                            }
                        });
                    }

                    newExperience[index] = {
                        ...newExperience[index],
                        description: currentBullets
                    };
                }
            });
        }

        // 3. Add Projects
        let newProjects = [...resume.projects];
        if (projectSuggestions && selectedImprovements.projects.length > 0) {
            selectedImprovements.projects.forEach(index => {
                const proj = projectSuggestions[index];
                newProjects.push({
                    id: crypto.randomUUID(),
                    name: proj.title,
                    description: proj.description,
                    technologies: proj.technologies,
                    bullets: [] // Ensure bullets array is always present, even if empty
                });
            });
        }

        // Update resume state
        try {
            dispatch({
                type: 'SET_RESUME',
                payload: {
                    ...resume,
                    summary: tailoredSummary,
                    skills: newSkills,
                    experience: newExperience,
                    projects: newProjects,
                    // CRITICAL: Preserve tailoring state so master resume stays unchanged
                    isTailoring: true,
                    originalResume: resume.originalResume,
                    tailoringJob: {
                        company: tailorResult.company || 'Unknown Company',
                        title: tailorResult.jobTitle || 'Unknown Position',
                        description: jobDescription,
                        link: jobUrl || ''
                    }
                }
            });

            addToast('success', '✅ Changes applied! Your master resume stays unchanged.');
            onClose();
        } catch (error) {
            console.error('Error applying changes:', error);
            addToast('error', 'Failed to apply changes');
        }
    };

    // Debugging: Check if bulletsToDrop exists
    console.log('Tailor Data:', tailorResult);
    if (tailorResult?.improvedExperience) {
        tailorResult.improvedExperience.forEach((exp, idx) => {
            console.log(`Exp ${idx} bulletsToDrop:`, exp.bulletsToDrop);
            console.log(`Exp ${idx} suggestedAdditions:`, exp.suggestedAdditions);
        });
    }

    // Calculate Preview Text for Live Scoring
    const getPreviewResumeText = () => {
        if (!tailorResult) return '';

        // 1. New Summary
        const summaryText = tailorResult.tailoredSummary || resume.summary || '';

        // 2. Skills (Original + New)
        const originalSkills = (resume.skills || []).flatMap(g => g.items);
        const newSkills = (tailorResult.missingHardSkills || []).map(s => s.name);
        const skillsText = [...originalSkills, ...newSkills].join(' ');

        // 3. Experience (With Swapped Bullets)
        const experienceText = (resume.experience || []).map(exp => {
            const updates = tailorResult.improvedExperience?.find(u => u.experienceId === exp.id);
            const selections = updates ? selectedImprovements.experience[exp.id] : null;

            let description = [...exp.description];
            const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;]$/, '');

            if (updates && selections) {
                // Remove Dropped
                if (updates.bulletsToDrop && selections.dropped) {
                    updates.bulletsToDrop.forEach((drop, i) => {
                        if (selections.dropped.includes(i)) {
                            const target = normalize(drop.original);
                            description = description.filter(b => normalize(b) !== target);
                        }
                    });
                }
                // Apply Revisions
                if (updates.revisedBullets && selections.revised) {
                    updates.revisedBullets.forEach((rev, i) => {
                        if (selections.revised.includes(i)) {
                            description.push(rev.new);
                        }
                    });
                }
                // Apply Suggestions
                if (updates.suggestedAdditions && selections.suggested) {
                    updates.suggestedAdditions.forEach((rec, i) => {
                        if (selections.suggested.includes(i)) {
                            description.push(rec.bullet);
                        }
                    });
                }
            }

            return `${exp.position} ${exp.company} ${description.join(' ')}`;
        }).join(' ');

        // 4. New Projects
        const projectsText = (tailorResult.projectSuggestions || [])
            .filter((_, i) => selectedImprovements.projects.includes(i))
            .map(p => `${p.title} ${p.description} ${p.technologies.join(' ')}`)
            .join(' ');

        // 5. Old Projects/Education
        const oldProjects = (resume.projects || []).map(p => `${p.name} ${p.description}`).join(' ');
        const education = (resume.education || []).map(e => `${e.degree} ${e.fieldOfStudy} ${e.institution}`).join(' ');

        return [summaryText, skillsText, experienceText, projectsText, oldProjects, education].join(' ');
    };

    const previewText = getPreviewResumeText();

    const { score: previewScore } = useRealtimeMatch(
        tailorResult ? previewText : '',
        jobDescription
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#111] border border-gray-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold text-gray-200 flex items-center gap-2">
                            <Wand2 className="text-indigo-400" /> Tailor Resume to Job
                        </h2>
                        {tailorResult && (
                            <div className={`px-3 py-1 rounded-full border flex items-center gap-2 transition-all duration-500 ${previewScore >= 70 ? 'bg-green-900/40 text-green-400 border-green-800' :
                                previewScore >= 40 ? 'bg-yellow-900/40 text-yellow-400 border-yellow-800' :
                                    'bg-gray-800 text-gray-400 border-gray-700'
                                }`}>
                                <Wand2 size={12} />
                                <span className="text-xs font-bold">
                                    Projected Match: {previewScore}%
                                </span>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <ErrorBoundary>
                    <div className="p-6 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                        {!tailorResult ? (
                            <>
                                <p className="text-gray-400">
                                    Paste the job description below. Gemini AI will analyze it and suggest improvements to your summary and identify missing skills.
                                </p>

                                <textarea
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                    className="w-full h-64 bg-[#1a1a1a] border border-gray-700 rounded-lg p-4 text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none placeholder-gray-600"
                                    placeholder="Paste Job Description here..."
                                />

                                {error && (
                                    <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-300 text-sm">
                                        {error}
                                    </div>
                                )}

                                {/* Insufficient Credits Warning */}
                                {credits !== null && credits < 30 && (
                                    <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-lg flex items-start gap-3">
                                        <span className="text-2xl">⚡</span>
                                        <div>
                                            <h4 className="text-red-300 font-semibold mb-1">Insufficient Credits</h4>
                                            <p className="text-red-400/80 text-sm">
                                                You need <span className="font-bold">30 credits</span> to use AI tailoring.
                                                You currently have <span className="font-bold">{credits}</span>.
                                            </p>
                                            <p className="text-gray-500 text-xs mt-2">
                                                Credits will refill to 500 in <span className="text-gray-400 font-medium">{formatRefillDate(nextRefillAt)}</span>.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="space-y-6">
                                {/* AI Reasoning Section */}
                                <div className="bg-indigo-900/10 border border-indigo-500/30 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setShowReasoning(!showReasoning)}
                                        className="w-full p-4 flex items-center justify-between text-left hover:bg-indigo-900/20 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Lightbulb className="text-indigo-400" size={20} />
                                            <span className="font-semibold text-indigo-300">Why these changes?</span>
                                        </div>
                                        {showReasoning ? <ChevronUp className="text-indigo-400" size={20} /> : <ChevronDown className="text-indigo-400" size={20} />}
                                    </button>
                                    {showReasoning && (
                                        <div className="px-4 pb-4 text-gray-400 text-sm leading-relaxed">
                                            {tailorResult.reasoning}
                                        </div>
                                    )}
                                </div>

                                {/* Tailored Summary */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-green-500" />
                                        New Summary
                                    </h3>
                                    <div className="bg-[#1a1a1a] border border-green-800/50 rounded-lg p-4">
                                        <p className="text-gray-300 leading-relaxed">{tailorResult.tailoredSummary}</p>
                                    </div>
                                </div>

                                {/* Missing Skills */}
                                {tailorResult.missingHardSkills.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-green-500" />
                                            Skills to Add ({tailorResult.missingHardSkills.length})
                                        </h3>
                                        <div className="bg-[#1a1a1a] border border-green-800/50 rounded-lg p-4">
                                            <div className="flex flex-wrap gap-2">
                                                {tailorResult.missingHardSkills.map((skill, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="px-4 py-2 bg-green-950/60 border border-green-500/50 rounded-full text-green-100 text-base font-medium flex items-center gap-2 shadow-sm transition-transform hover:scale-105 whitespace-nowrap"
                                                    >
                                                        {skill.name}
                                                        <span className="text-xs text-green-400 font-bold pl-2 border-l border-green-500/50 uppercase tracking-wider">{skill.category}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Experience Improvements */}
                                {tailorResult.improvedExperience && tailorResult.improvedExperience.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <CheckCircle2 size={16} className="text-green-500" />
                                            Experience Improvements
                                        </h3>
                                        <div className="space-y-3">
                                            {tailorResult.improvedExperience.map((exp, idx) => (
                                                <div key={idx} className="bg-[#1a1a1a] border border-green-800/50 rounded-lg p-4">
                                                    {/* Revisions */}
                                                    {exp.revisedBullets && exp.revisedBullets.length > 0 && (
                                                        <div className="mb-3">
                                                            <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2">Revised Bullets</h4>
                                                            <div className="space-y-2">
                                                                {exp.revisedBullets.map((rev, rIdx) => (
                                                                    <div key={rIdx} className="flex items-start gap-3 text-sm group">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedImprovements.experience[exp.experienceId]?.revised.includes(rIdx) ?? false}
                                                                            onChange={() => toggleExperienceSelection(exp.experienceId, 'revised', rIdx)}
                                                                            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="text-red-400/70 line-through mb-1 text-xs">{rev.original}</div>
                                                                            <div className="text-green-300">{rev.new}</div>
                                                                            <div className="text-xs text-gray-500 mt-1 italic">Reason: {rev.reason}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Pruning Candidates (New) */}
                                                    {exp.bulletsToDrop && exp.bulletsToDrop.length > 0 && (
                                                        <div className="mb-3">
                                                            <h4 className="text-xs font-bold text-red-400 uppercase mb-2 flex items-center justify-between">
                                                                <span>Candidates for Pruning</span>
                                                                <span className="text-[10px] font-normal text-gray-500 normal-case">(Check to Remove)</span>
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {exp.bulletsToDrop.map((drop, dIdx) => (
                                                                    <div key={dIdx} className="flex items-start gap-3 text-sm group bg-red-950/20 p-2 rounded border border-red-900/30">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedImprovements.experience[exp.experienceId]?.dropped.includes(dIdx) ?? false}
                                                                            onChange={() => toggleExperienceSelection(exp.experienceId, 'dropped', dIdx)}
                                                                            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-red-500 focus:ring-red-500 focus:ring-offset-gray-900"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="text-red-300 line-through decoration-red-500/50">{drop.original}</div>
                                                                            <div className="text-xs text-red-400/80 mt-1 italic">Reason: {drop.reason}</div>
                                                                            <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">
                                                                                {selectedImprovements.experience[exp.experienceId]?.dropped.includes(dIdx) ? 'Will be Removed' : 'Kept in Resume'}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Suggestions */}
                                                    {exp.suggestedAdditions && exp.suggestedAdditions.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-bold text-green-400 uppercase mb-2">Gap-Bridging Suggestions</h4>
                                                            <div className="space-y-2">
                                                                {exp.suggestedAdditions.map((rec, recIdx) => (
                                                                    <div key={recIdx} className="flex items-start gap-3 text-sm group">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedImprovements.experience[exp.experienceId]?.suggested.includes(recIdx) ?? false}
                                                                            onChange={() => toggleExperienceSelection(exp.experienceId, 'suggested', recIdx)}
                                                                            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-gray-900"
                                                                        />
                                                                        <div className="flex-1">
                                                                            <div className="text-green-300 flex gap-2">
                                                                                <span>+</span>
                                                                                {rec.bullet}
                                                                            </div>
                                                                            <div className="text-xs text-gray-500 mt-1 italic ml-4">Reason: {rec.reason}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Project Suggestions */}
                                {tailorResult.projectSuggestions && tailorResult.projectSuggestions.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <Lightbulb size={16} className="text-yellow-500" />
                                            Suggested Projects to bridge gaps
                                        </h3>
                                        <div className="grid gap-3">
                                            {tailorResult.projectSuggestions.map((proj, idx) => (
                                                <div key={idx} className={`bg-[#1a1a1a] border rounded-lg p-4 transition-colors ${selectedImprovements.projects.includes(idx) ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-yellow-800/30'}`}>
                                                    <div className="flex items-start gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedImprovements.projects.includes(idx)}
                                                            onChange={() => toggleProjectSelection(idx)}
                                                            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-gray-900"
                                                        />
                                                        <div className="flex-1">
                                                            <h4 className="font-bold text-yellow-200 mb-1">{proj.title}</h4>
                                                            <p className="text-sm text-gray-300 mb-2">{proj.description}</p>
                                                            <div className="flex flex-wrap gap-2 mb-2">
                                                                {proj.technologies.map((tech, tIdx) => (
                                                                    <span key={tIdx} className="text-xs px-2 py-0.5 bg-yellow-900/20 text-yellow-400 rounded">
                                                                        {tech}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-gray-500 italic">Why: {proj.reason}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ErrorBoundary>

                <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        disabled={isTailoring}
                    >
                        Cancel
                    </button>
                    {!tailorResult ? (
                        <button
                            onClick={handleAnalyze}
                            disabled={isTailoring || !jobDescription.trim() || (credits !== null && credits < 30)}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                        >
                            {isTailoring ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" /> Analyzing...
                                </>
                            ) : (
                                <>
                                    <Wand2 size={18} /> Analyze & Tailor (30 ⚡)
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleApplyChanges}
                            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(5,150,105,0.3)]"
                        >
                            <CheckCircle2 size={18} /> Apply Changes
                        </button>
                    )}
                </div>
            </div >
        </div >
    );
};
