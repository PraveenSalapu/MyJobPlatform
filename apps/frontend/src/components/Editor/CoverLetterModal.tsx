import { useState, useEffect } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useAuth } from '../../context/AuthContext';
import { generateCoverLetter } from '../../services/gemini';
import { X, FileText, Copy, Check, Loader2, PenTool, Lightbulb } from 'lucide-react';

const COVER_LETTER_COST = 15; // credits

interface CoverLetterModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CoverLetterModal = ({ isOpen, onClose }: CoverLetterModalProps) => {
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
    const [jobDescription, setJobDescription] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [company, setCompany] = useState('');
    const [generatedLetter, setGeneratedLetter] = useState('');
    const [companyInsight, setCompanyInsight] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    // Auto-fill from tailoring context if available
    useEffect(() => {
        if (isOpen && resume.tailoringJob) {
            const { title, company: jobCompany, description } = resume.tailoringJob;
            setJobTitle(title || '');
            setCompany(jobCompany || '');
            setJobDescription(description || '');
        }
    }, [isOpen, resume.tailoringJob]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setGeneratedLetter('');
            setCompanyInsight('');
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleGenerate = async () => {
        if (!jobDescription.trim() || !company.trim()) {
            setError('Please provide at least the company name and job description.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const result = await generateCoverLetter(
                resume,
                jobDescription,
                jobTitle || 'Target Role',
                company
            );
            setGeneratedLetter(result.coverLetter);
            setCompanyInsight(result.companyInsight || '');
            // Store cover letter in context for autofill
            dispatch({ type: 'SET_COVER_LETTER', payload: result.coverLetter });
            // Refresh credits after generation
            refreshCredits();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to generate cover letter. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedLetter);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-[#111] border border-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-900/20 rounded-lg border border-indigo-500/20">
                            <PenTool className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-200">Cover Letter Generator</h2>
                            <p className="text-sm text-gray-400">AI-crafted cover letters tailored to the job.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[#1a1a1a] rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                    {!generatedLetter ? (
                        <div className="space-y-4">
                            {/* Error message */}
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Job Title & Company - side by side */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Job Title</label>
                                    <input
                                        type="text"
                                        value={jobTitle}
                                        onChange={(e) => setJobTitle(e.target.value)}
                                        className="input-field w-full bg-[#1a1a1a] border-gray-700 text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-600"
                                        placeholder="e.g., Software Engineer"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">Company *</label>
                                    <input
                                        type="text"
                                        value={company}
                                        onChange={(e) => setCompany(e.target.value)}
                                        className="input-field w-full bg-[#1a1a1a] border-gray-700 text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-600"
                                        placeholder="e.g., Google"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">Job Description *</label>
                                <textarea
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                    className="input-field w-full h-48 resize-none bg-[#1a1a1a] border-gray-700 text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-600"
                                    placeholder="Paste the full job description here..."
                                />
                            </div>

                            {/* Info box about AI research */}
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex gap-3">
                                <Lightbulb className="text-indigo-400 shrink-0" size={18} />
                                <p className="text-xs text-indigo-300">
                                    Our AI will research the company to find recent news, initiatives, and values to personalize your cover letter with a compelling opening hook.
                                </p>
                            </div>

                            {/* Insufficient Credits Warning */}
                            {credits !== null && credits < COVER_LETTER_COST && (
                                <div className="p-4 bg-red-900/20 border border-red-800/50 rounded-lg flex items-start gap-3">
                                    <span className="text-2xl">⚡</span>
                                    <div>
                                        <h4 className="text-red-300 font-semibold mb-1">Insufficient Credits</h4>
                                        <p className="text-red-400/80 text-sm">
                                            You need <span className="font-bold">{COVER_LETTER_COST} credits</span> to generate a cover letter.
                                            You currently have <span className="font-bold">{credits}</span>.
                                        </p>
                                        <p className="text-gray-500 text-xs mt-2">
                                            Credits will refill to 500 in <span className="text-gray-400 font-medium">{formatRefillDate(nextRefillAt)}</span>.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleGenerate}
                                disabled={loading || !jobDescription.trim() || !company.trim() || (credits !== null && credits < COVER_LETTER_COST)}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        <span>Researching & crafting your letter...</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={20} />
                                        <span>Generate Cover Letter ({COVER_LETTER_COST} ⚡)</span>
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4 h-full flex flex-col">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-medium text-gray-300">Generated Letter</h3>
                                <button
                                    onClick={() => {
                                        setGeneratedLetter('');
                                        setCompanyInsight('');
                                    }}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                                >
                                    Create New
                                </button>
                            </div>

                            {/* Company insight panel */}
                            {companyInsight && (
                                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex gap-3">
                                    <Lightbulb className="text-green-400 shrink-0" size={18} />
                                    <div>
                                        <p className="text-xs font-medium text-green-400 mb-1">Company Research Used:</p>
                                        <p className="text-xs text-green-300">{companyInsight}</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 bg-[#1a1a1a] border border-gray-800 text-gray-300 p-6 rounded-lg shadow-inner overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed custom-scrollbar">
                                {generatedLetter}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {generatedLetter && (
                    <div className="p-4 border-t border-gray-800 bg-[#111] rounded-b-2xl flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleCopy}
                            className="px-4 py-2 bg-gray-200 hover:bg-white text-gray-900 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                        >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                            <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
