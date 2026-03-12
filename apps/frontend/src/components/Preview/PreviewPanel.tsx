import { useState, useEffect, useRef } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useAuth } from '../../context/AuthContext';
import { ModernTemplate } from './templates/ModernTemplate';
import { ClassicTemplate } from './templates/ClassicTemplate';
import { MinimalistTemplate } from './templates/MinimalistTemplate';
import { JakeTemplate } from './templates/JakeTemplate';
import { Layout, Type, Minimize2, FileText, Briefcase, ExternalLink, Loader2, CheckCircle2, Link2, X, Download, AlertTriangle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ResumePDF } from '../PDF/ResumePDF';
import { getDatabase } from '../../services/database/mongodb';
import { v4 } from 'uuid';
import { fetchWithAuth } from '../../services/api';
import { getActiveProfile } from '../../services/storage';
import { PAGE_SIZES } from '../../utils/pdfConstants';

export const PreviewPanel = () => {
    const { resume, dispatch } = useResume();
    const { user } = useAuth();
    const { addToast } = useToast();
    const { selectedTemplate, pageSize } = resume;
    const [debouncedResume, setDebouncedResume] = useState(resume);
    const [isSavingApp, setIsSavingApp] = useState(false);
    const [appSaved, setAppSaved] = useState(false);
    const [isApplyingToJob, setIsApplyingToJob] = useState(false);
    const [manualJobUrl, setManualJobUrl] = useState('');
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [overflowsPage, setOverflowsPage] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Extract job URL from tailoring job or try to find it in description
    const getJobUrl = (): string => {
        // Manual URL takes priority
        if (manualJobUrl) return manualJobUrl;
        if (resume.tailoringJob?.link) return resume.tailoringJob.link;

        // Try to extract from description
        const description = resume.tailoringJob?.description || '';
        const urlMatch = description.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            return urlMatch[0].replace(/[.,;)>\]]+$/, '');
        }
        const linkMatch = description.match(/Link:\s*(https?:\/\/[^\s]+)/i);
        if (linkMatch) {
            return linkMatch[1].replace(/[.,;)>\]]+$/, '');
        }
        return '';
    };
    const jobUrl = getJobUrl();
    const hasDetectedUrl = !!(resume.tailoringJob?.link || resume.tailoringJob?.description?.match(/https?:\/\/[^\s]+/));

    // Reset appSaved when tailoring state changes
    useEffect(() => {
        if (!resume.isTailoring) {
            setAppSaved(false);
        }
    }, [resume.isTailoring]);

    // Handle tracking application
    const handleTrackApplication = async () => {
        setIsSavingApp(true);
        try {
            const db = getDatabase();
            const company = resume.tailoringJob?.company || 'Target Company';
            const title = resume.tailoringJob?.title || 'Tailored Role';

            await db.createApplication({
                id: v4(),
                userId: user?.id ?? '',
                company,
                jobTitle: title,
                jobDescription: resume.tailoringJob?.description || '',
                status: 'applied',
                appliedDate: new Date(),
                lastUpdated: new Date(),
                source: 'AI Tailor',
                timeline: [{ date: new Date(), status: 'applied', notes: 'Application created via AI Tailor' }],
                resumeSnapshot: resume,
                tags: ['Tailored', 'AI Generated'],
                notes: `Auto-tracked after AI tailoring for ${title}`
            });

            setAppSaved(true);
            addToast('success', 'Application tracked successfully');
        } catch (error) {
            console.error('Error saving application:', error);
            addToast('error', 'Failed to save application');
        } finally {
            setIsSavingApp(false);
        }
    };

    // Handle applying to job (creates pending autofill and opens job page)
    const handleApplyToJob = async () => {
        if (!jobUrl) {
            addToast('error', 'No job URL found. Please add a job link.');
            return;
        }

        setIsApplyingToJob(true);
        try {
            const profile = await getActiveProfile();
            if (!profile?.id) {
                addToast('error', 'No active profile found');
                return;
            }

            const response = await fetchWithAuth('/api/autofill/pending', {
                method: 'POST',
                body: JSON.stringify({
                    profileId: profile.id,
                    jobUrl: jobUrl,
                    jobTitle: resume.tailoringJob?.title || '',
                    company: resume.tailoringJob?.company || '',
                    jobDescription: resume.tailoringJob?.description || '',
                    tailoredResume: resume,
                    coverLetter: resume.generatedCoverLetter || undefined,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to prepare autofill');
            }

            addToast('success', '🚀 Opening job page - Extension will auto-fill!');
            window.open(jobUrl, '_blank');
        } catch (error) {
            console.error('Error preparing autofill:', error);
            addToast('error', 'Failed to prepare auto-fill. Try again.');
        } finally {
            setIsApplyingToJob(false);
        }
    };

    // Debounce the resume update to prevent flickering/lag on every keystroke
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedResume(resume);
        }, 500); // 500ms delay

        return () => {
            clearTimeout(handler);
        };
    }, [resume]);

    // Use shared page size constants for consistent rendering (declared early for overflow detection)
    const pageDims = PAGE_SIZES[pageSize === 'LETTER' ? 'LETTER' : 'A4'];

    // Detect when content overflows past the first page boundary
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        // 1px = 96/25.4 mm at standard screen DPI; page height is in mm
        const pageHeightPx = pageDims.height * (96 / 25.4);
        const check = () => setOverflowsPage(el.offsetHeight > pageHeightPx + 4);
        const observer = new ResizeObserver(check);
        observer.observe(el);
        check();
        return () => observer.disconnect();
    }, [pageDims.height, debouncedResume]);

    const templates = [
        { id: 'modern', name: 'Modern', icon: Layout },
        { id: 'classic', name: 'Classic', icon: Type },
        { id: 'minimalist', name: 'Minimal', icon: Minimize2 },
        { id: 'jake', name: "Jake's", icon: FileText },
    ] as const;

    const renderTemplate = () => {
        switch (selectedTemplate) {
            case 'classic':
                return <ClassicTemplate resume={debouncedResume} />;
            case 'minimalist':
                return <MinimalistTemplate resume={debouncedResume} />;
            case 'jake':
                return <JakeTemplate resume={debouncedResume} />;
            case 'modern':
            default:
                return <ModernTemplate resume={debouncedResume} />;
        }
    };

    const pageWidth = `${pageDims.width}mm`;
    const pageHeight = `${pageDims.height}mm`;

    return (
        <div className="h-full flex flex-col bg-[#1e1e1e] border-l border-gray-800">
            {/* Template Selector Toolbar */}
            <div className="p-4 border-b border-gray-800 bg-[#111] shadow-sm z-10">
                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                    {/* Template Selector */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-400">Template:</span>
                        <div className="flex bg-[#1a1a1a] border border-gray-700 rounded-lg p-1">
                            {templates.map((t) => {
                                const Icon = t.icon;
                                const isActive = selectedTemplate === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => dispatch({ type: 'SET_TEMPLATE', payload: t.id })}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${isActive
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                            }`}
                                    >
                                        <Icon size={14} />
                                        {t.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Download PDF Button */}
                    <div className="flex items-center ml-auto md:ml-4">
                        <PDFDownloadLink
                            document={<ResumePDF resume={debouncedResume} />}
                            fileName={`${resume.personalInfo?.fullName?.replace(/\s+/g, '_') || 'My'}_Resume.pdf`}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                        >
                            {({ loading }) => (
                                loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" /> Preparing PDF...
                                    </>
                                ) : (
                                    <>
                                        <Download size={16} /> Download
                                    </>
                                )
                            )}
                        </PDFDownloadLink>
                    </div>
                </div>
            </div>

            {/* Overflow warning */}
            {overflowsPage && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-900/80 border-b border-amber-600/50 text-amber-200 text-xs font-medium">
                    <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                    Resume exceeds 1 page. Reduce font size in Layout Settings or trim content.
                </div>
            )}

            {/* Preview Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar flex justify-center bg-[#1e1e1e]">
                <div className="relative">
                    {/* Page */}
                    <div
                        ref={contentRef}
                        className="bg-white origin-top transform scale-90 sm:scale-100 transition-transform duration-300 shadow-2xl"
                        style={{
                            width: pageWidth,
                            minHeight: pageHeight
                        }}
                    >
                        {renderTemplate()}
                    </div>

                    {/* Page Break Indicator — only shown when content overflows */}
                    {overflowsPage && (
                        <div className="absolute left-0 right-0 transform scale-90 sm:scale-100 pointer-events-none" style={{ top: pageHeight }}>
                            <div className="flex items-center justify-center">
                                <div className="flex-1 border-t-2 border-dashed border-red-500/60"></div>
                                <span className="px-4 py-1.5 bg-red-900/80 backdrop-blur-sm text-red-200 text-xs font-bold rounded-full shadow-lg border border-red-500/50">
                                    PAGE 2 STARTS HERE
                                </span>
                                <div className="flex-1 border-t-2 border-dashed border-red-500/60"></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Bar - Shows after tailoring changes are applied */}
            {resume.isTailoring && (
                <div className="p-4 border-t border-gray-800 bg-[#111] flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-sm text-gray-400">
                            <span className="text-indigo-400 font-medium">Tailored for:</span>{' '}
                            {resume.tailoringJob?.title || 'Job'} at {resume.tailoringJob?.company || 'Company'}
                        </div>
                        <div className="flex items-center gap-3">
                            {!appSaved ? (
                                <button
                                    onClick={handleTrackApplication}
                                    disabled={isSavingApp}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm shadow-[0_0_15px_rgba(147,51,234,0.3)]"
                                >
                                    {isSavingApp ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Briefcase size={16} /> Track Application
                                        </>
                                    )}
                                </button>
                            ) : (
                                <span className="px-4 py-2 text-green-400 font-medium flex items-center gap-2 bg-green-900/20 rounded-lg border border-green-900/50 text-sm">
                                    <CheckCircle2 size={16} /> Saved to Tracker
                                </span>
                            )}
                            {jobUrl ? (
                                <button
                                    onClick={handleApplyToJob}
                                    disabled={isApplyingToJob}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                                >
                                    {isApplyingToJob ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" /> Preparing...
                                        </>
                                    ) : (
                                        <>
                                            <ExternalLink size={16} /> Apply to Job
                                        </>
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowUrlInput(true)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                                >
                                    <Link2 size={16} /> Add Job URL
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Manual URL Input */}
                    {showUrlInput && !hasDetectedUrl && (
                        <div className="flex items-center gap-2 bg-[#1a1a1a] border border-gray-700 rounded-lg p-2">
                            <Link2 size={16} className="text-gray-400 ml-2" />
                            <input
                                type="url"
                                value={manualJobUrl}
                                onChange={(e) => setManualJobUrl(e.target.value)}
                                placeholder="Paste job posting URL here..."
                                className="flex-1 bg-transparent text-gray-200 text-sm outline-none placeholder-gray-500"
                                autoFocus
                            />
                            <button
                                onClick={() => {
                                    setShowUrlInput(false);
                                    setManualJobUrl('');
                                }}
                                className="p-1 text-gray-400 hover:text-white"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
