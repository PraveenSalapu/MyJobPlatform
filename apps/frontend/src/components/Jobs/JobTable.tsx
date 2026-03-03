import React, { useEffect, useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import { WifiOff, RefreshCw, ArrowDown, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchJobsFromDB } from '../../services/database/supabase';
import type { FetchJobsResult } from '../../services/database/supabase';
import { refreshMatchScores } from '../../services/api';
import type { PaginationInfo } from '../../services/api';
import type { Job } from '../../types';
import { JobCard } from './JobCard';

// 1. CONFIGURATION
// (N8N logic replaced by Supabase)

// 2. TYPES - Job imported from types

// MOCK DATA FOR FALLBACK
const MOCK_JOBS: Job[] = [
    {
        company: "Nebula AI Systems",
        title: "Senior Full Stack Engineer",
        link: "https://example.com/job/1",
        match_score: 92,
        missing_skills: [],
        summary: "Leading the development of our core AI infrastructure. Looking for strong React and Node.js experience. Great fit for your background in full-stack development.",
        location: "San Francisco, CA",
        jobType: "Full-time",
        experienceLevel: "Senior",
        salary: "$180k - $250k"
    },
    {
        company: "TechFlow Corp",
        title: "Backend Developer",
        link: "https://example.com/job/2",
        match_score: 78,
        missing_skills: ["Kubernetes", "Go"],
        summary: "Building high-scale distributed systems. Requires strong knowledge of microservices architecture. You match 80% of the requirements but missing Go experience.",
        location: "Remote",
        jobType: "Contract",
        experienceLevel: "Mid Level",
        salary: "$60/hr"
    },
    {
        company: "Creative Solutions Inc",
        title: "Frontend Architect",
        link: "https://example.com/job/3",
        match_score: 65,
        missing_skills: ["GraphQL", "Webpack", "Figma"],
        summary: "We need a design-minded engineer to overhaul our UI library. Your profile lacks specific design tool experience mentioned in the JD.",
        location: "New York, NY",
        jobType: "Full-time",
        experienceLevel: "Lead",
        salary: "$200k+"
    }
];

type SortField = 'match_score' | 'created_at' | 'company';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 20;

export const JobTable: React.FC = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshingScores, setRefreshingScores] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [usingMockData, setUsingMockData] = useState<boolean>(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pagination, setPagination] = useState<PaginationInfo | null>(null);

    // Sorting & Filtering State
    const [sortField, setSortField] = useState<SortField>('match_score');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filterExp, setFilterExp] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');

    const { resume, dispatch } = useResume();

    // Filter Jobs
    const filteredJobs = jobs.filter(job => {
        if (filterExp && job.experienceLevel && job.experienceLevel !== filterExp) return false;
        if (filterType && job.jobType && job.jobType !== filterType) return false;
        if (filterCategory && job.category && job.category !== filterCategory) return false;
        return true;
    });

    // Sort Jobs
    const sortedJobs = [...filteredJobs].sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
            case 'match_score':
                comparison = (a.match_score || 0) - (b.match_score || 0);
                break;
            case 'created_at':
                comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                break;
            case 'company':
                comparison = a.company.localeCompare(b.company);
                break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
    });

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const handleTailor = (job: Job) => {
        dispatch({
            type: 'START_TAILORING',
            payload: {
                job: {
                    title: job.title,
                    company: job.company,
                    description: job.summary || '', // AI Summary serves as JD context
                    link: job.link
                }
            }
        });
    };

    // HANDLE APPLY (STAGES AUTOFILL)
    const handleApply = async (job: Job) => {
        if (!job.link) return;

        // 1. Determine which resume to use
        // If we are currently tailoring THIS job, use the tailored state.
        // Otherwise used the saved profile.
        let resumeToUse = resume;
        const isTailoringThisJob = resume.isTailoring &&
            (resume.tailoringJob?.link === job.link ||
                resume.tailoringJob?.company === job.company);

        // Notify user
        const toastId = `apply-${Date.now()}`;
        // Note: effectively we'd want a toast here but I don't have addToast handy in this scope comfortably
        // changing console log to debug
        console.log("Applying to:", job.company, "Tailored:", isTailoringThisJob);

        try {
            // Stage for Extension (Mirroring PreviewPanel logic + LocalStorage Fallback)
            const payload = {
                jobUrl: job.link,
                jobTitle: job.title,
                company: job.company,
                tailoredResume: isTailoringThisJob ? resume : null, // If null, backend/extension uses profile
                timestamp: Date.now()
            };

            // A. Try API (Persistent Staging)
            try {
                await fetch('/api/autofill/pending', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                console.warn("API Autofill stage failed, falling back to local storage", e);
            }

            // B. LocalStorage Fallback (Immediate/Extension Access)
            localStorage.setItem('EXTENSION_AUTOFILL_DATA', JSON.stringify(payload));

            // C. Post Message (Direct Extension Communication)
            window.postMessage({
                type: 'EXTENSION_AUTOFILL',
                payload: payload
            }, '*');

            // D. Open Job
            window.open(job.link, '_blank');

        } catch (err) {
            console.error("Apply failed", err);
            window.open(job.link, '_blank'); // Fallback open anyway
        }
    };

    // 5. UPDATE: Fetch from Supabase (BackendDB) instead of direct API
    const handleFetchJobs = async (page: number = currentPage) => {
        try {
            setLoading(true);
            setError(null);
            setUsingMockData(false);

            // Fetch from Central Database (populated by scripts/fetch-jobs.ts)
            const result = await fetchJobsFromDB(page, ITEMS_PER_PAGE);

            if (result.jobs.length === 0 && page === 1) {
                // Fallback if DB is empty? (Optional: Trigger crawling via an API endpoint if you had one)
                console.warn("Supabase returned no jobs. The crawler script might not have run yet.");
            }

            setJobs(result.jobs);
            if (result.pagination) {
                setPagination(result.pagination);
            }

        } catch (err: any) {
            console.error("Supabase Fetch failed:", err);
            // Fallback to mock data if DB fails
            setError(`Database connection failed: ${err.message}`);
            setUsingMockData(true);
            setJobs(MOCK_JOBS);
            setPagination(null);
        } finally {
            setLoading(false);
        }
    };

    // Handle page change
    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        handleFetchJobs(newPage);
        // Scroll to top of job list
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Refresh match scores for current profile
    const handleRefreshScores = async () => {
        try {
            setRefreshingScores(true);
            await refreshMatchScores();
            // Re-fetch jobs to get updated scores
            await handleFetchJobs();
        } catch (err: any) {
            console.error("Failed to refresh scores:", err);
        } finally {
            setRefreshingScores(false);
        }
    };

    // Init Logic
    useEffect(() => {
        handleFetchJobs();
    }, []);

    // Extract unique filter options
    const uniqueExpLevels = Array.from(new Set(jobs.map(j => j.experienceLevel).filter(Boolean)));
    const uniqueJobTypes = Array.from(new Set(jobs.map(j => j.jobType).filter(Boolean)));
    const uniqueCategories = Array.from(new Set(jobs.map(j => j.category).filter(Boolean)));

    return (
        <div className="h-full flex flex-col bg-[#0F0F0F] font-sans">
            {/* Header / Toolbar */}
            <div className="p-4 sm:p-6 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
                        Job Board
                        <span className="text-xs sm:text-sm font-normal text-gray-500 bg-gray-900 border border-gray-800 px-2 py-0.5 rounded-full">
                            {pagination ? pagination.total : jobs.length} found
                        </span>
                    </h1>
                    <p className="text-gray-400 text-xs sm:text-sm mt-1">AI-curated opportunities matching your profile.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefreshScores}
                        disabled={refreshingScores}
                        className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-900 border border-gray-700 hover:border-indigo-500 text-gray-300 rounded-lg transition-all w-full sm:w-auto text-sm"
                    >
                        <RefreshCw size={16} className={`${refreshingScores ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">{refreshingScores ? 'Calculating Matches...' : 'Refresh Matches'}</span>
                        <span className="sm:hidden">{refreshingScores ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                </div>
            </div>

            {/* Filters Row - Scrollable on mobile */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-800/50 bg-[#121215] overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-2 sm:gap-3 min-w-max">
                    <div className="flex items-center gap-2 text-gray-500 text-xs sm:text-sm mr-1 sm:mr-2">
                        <Filter size={14} /> <span className="hidden sm:inline">Filters:</span>
                    </div>

                    <select
                        value={filterExp}
                        onChange={e => setFilterExp(e.target.value)}
                        className="bg-[#1a1a1e] text-gray-300 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-md border border-gray-700 outline-none focus:border-indigo-500"
                    >
                        <option value="">All Exp</option>
                        {uniqueExpLevels.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-[#1a1a1e] text-gray-300 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-md border border-gray-700 outline-none focus:border-indigo-500"
                    >
                        <option value="">All Types</option>
                        {uniqueJobTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <select
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        className="bg-[#1a1a1e] text-gray-300 text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-md border border-gray-700 outline-none focus:border-indigo-500"
                    >
                        <option value="">All Categories</option>
                        {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <div className="w-4 sm:flex-1"></div>

                    {/* Sorting */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-widest font-bold hidden sm:block">Sort</span>
                        <button
                            onClick={() => toggleSort('match_score')}
                            className={`px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm flex items-center gap-1 transition-colors ${sortField === 'match_score' ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:text-white'}`}
                        >
                            Match {sortField === 'match_score' && <ArrowDown size={12} />}
                        </button>
                        <button
                            onClick={() => toggleSort('created_at')}
                            className={`px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm flex items-center gap-1 transition-colors ${sortField === 'created_at' ? 'bg-indigo-900/40 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:text-white'}`}
                        >
                            New {sortField === 'created_at' && <ArrowDown size={12} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Error / Mock Banner */}
            {usingMockData && (
                <div className="bg-amber-900/20 border-b border-amber-900/50 px-6 py-2 flex items-center gap-2 text-amber-500 text-sm">
                    <WifiOff size={16} />
                    <span>Viewing offline/demo data. {error}</span>
                </div>
            )}

            {/* Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-48 sm:h-64 space-y-4">
                        <RefreshCw className="animate-spin text-indigo-500" size={28} />
                        <p className="text-gray-500 text-sm sm:text-base text-center px-4">Scanning neural network for opportunities...</p>
                    </div>
                ) : filteredJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 sm:h-64 text-gray-500">
                        <p className="text-sm sm:text-base">No jobs found matching filters.</p>
                        <button
                            onClick={() => { setFilterExp(''); setFilterType(''); setFilterCategory(''); }}
                            className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm"
                        >
                            Clear Filters
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3 sm:space-y-4 max-w-5xl mx-auto">
                        {sortedJobs.map((job, idx) => (
                            <JobCard
                                key={idx}
                                job={job}
                                onTailor={handleTailor}
                            />
                        ))}

                        {/* Pagination Controls */}
                        {pagination && pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 py-6 border-t border-gray-800 mt-6">
                                <button
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage <= 1}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 hover:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                    <span className="hidden sm:inline">Previous</span>
                                </button>

                                <div className="flex items-center gap-2">
                                    {/* Page numbers */}
                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                        let pageNum: number;
                                        if (pagination.totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= pagination.totalPages - 2) {
                                            pageNum = pagination.totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => handlePageChange(pageNum)}
                                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                                    currentPage === pageNum
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-gray-900 border border-gray-700 text-gray-300 hover:border-indigo-500'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={!pagination.hasMore}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-300 hover:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className="hidden sm:inline">Next</span>
                                    <ChevronRight size={16} />
                                </button>

                                <span className="text-gray-500 text-sm ml-2">
                                    Page {currentPage} of {pagination.totalPages}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
