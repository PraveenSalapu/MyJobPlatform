import React, { useState } from 'react';
import { useResume } from '../../context/ResumeContext';
import {
    AlertTriangle, CheckCircle, ArrowRight, XCircle, Info,
    Target, Zap, FileText, Award, TrendingUp, ChevronDown, ChevronUp,
    Sparkles, AlertCircle, BarChart3
} from 'lucide-react';

interface ScanResultsProps {
    onComplete: () => void;
}

export const ScanResults: React.FC<ScanResultsProps> = ({ onComplete }) => {
    const { resume } = useResume();
    const { atsScan } = resume;
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const score = atsScan?.score || 0;
    const letterGrade = atsScan?.letterGrade || 'N/A';
    const summary = atsScan?.summary || 'Upload a resume to see your personalized analysis.';
    const issues = atsScan?.issues || [];
    const scores = atsScan?.scores;
    const sectionAnalysis = atsScan?.sectionAnalysis || [];
    const topPriorities = atsScan?.topPriorities || [];
    const strengths = atsScan?.strengths || [];
    const metrics = atsScan?.metrics;
    const actionVerbs = atsScan?.actionVerbs;

    const getScoreColor = (s: number) => {
        if (s >= 80) return 'text-green-500 border-green-500';
        if (s >= 60) return 'text-yellow-500 border-yellow-500';
        if (s >= 40) return 'text-orange-500 border-orange-500';
        return 'text-red-500 border-red-500';
    };

    const getScoreBg = (s: number) => {
        if (s >= 80) return 'bg-green-500/10';
        if (s >= 60) return 'bg-yellow-500/10';
        if (s >= 40) return 'bg-orange-500/10';
        return 'bg-red-500/10';
    };

    const getGradeColor = (grade: string) => {
        if (grade.startsWith('A')) return 'text-green-400';
        if (grade.startsWith('B')) return 'text-blue-400';
        if (grade.startsWith('C')) return 'text-yellow-400';
        return 'text-red-400';
    };

    const getSectionStatusColor = (status: string) => {
        switch (status) {
            case 'excellent': return 'text-green-400 bg-green-500/10';
            case 'good': return 'text-blue-400 bg-blue-500/10';
            case 'needs_work': return 'text-yellow-400 bg-yellow-500/10';
            case 'missing': return 'text-red-400 bg-red-500/10';
            case 'critical': return 'text-red-500 bg-red-500/20';
            default: return 'text-gray-400 bg-gray-500/10';
        }
    };

    const getIssueIcon = (type: string) => {
        switch (type) {
            case 'error': return <XCircle className="text-red-500 shrink-0" size={18} />;
            case 'warning': return <AlertTriangle className="text-yellow-500 shrink-0" size={18} />;
            case 'info': return <Info className="text-blue-500 shrink-0" size={18} />;
            case 'success': return <CheckCircle className="text-green-500 shrink-0" size={18} />;
            default: return <AlertCircle className="text-gray-500 shrink-0" size={18} />;
        }
    };

    const categoryScores = scores ? [
        { name: 'Completeness', score: scores.completeness, icon: FileText, desc: 'All sections filled' },
        { name: 'Impact', score: scores.impact, icon: Zap, desc: 'Metrics & achievements' },
        { name: 'ATS Ready', score: scores.atsCompatibility, icon: Target, desc: 'Keyword optimization' },
        { name: 'Clarity', score: scores.clarity, icon: Award, desc: 'Structure & formatting' },
        { name: 'Relevance', score: scores.relevance, icon: TrendingUp, desc: 'Industry alignment' },
    ] : [];

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    return (
        <div className="fixed inset-0 w-full h-full bg-[#0F0F0F] text-white overflow-y-auto">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

            <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-in fade-in duration-500">
                {/* Header with Score */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
                    <div className="flex-1">
                        <div className="inline-block px-3 py-1 mb-3 border border-indigo-500/30 bg-indigo-900/10 rounded-full">
                            <span className="text-xs font-mono text-indigo-400">ANALYSIS COMPLETE</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                            {resume.personalInfo?.fullName ? `${resume.personalInfo.fullName.split(' ')[0]}'s Resume Analysis` : 'Resume Analysis'}
                        </h1>
                        <p className="text-gray-400 text-sm sm:text-base max-w-xl">{summary}</p>
                    </div>

                    {/* Score Circle */}
                    <div className="flex items-center gap-4">
                        <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 flex flex-col items-center justify-center ${getScoreBg(score)} ${getScoreColor(score)}`}>
                            <span className="text-3xl sm:text-4xl font-mono font-bold">{score}</span>
                            <span className="text-xs opacity-70">/100</span>
                        </div>
                        <div className="text-center">
                            <div className={`text-4xl sm:text-5xl font-bold ${getGradeColor(letterGrade)}`}>{letterGrade}</div>
                            <div className="text-xs text-gray-500 mt-1">GRADE</div>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                {(errorCount > 0 || warningCount > 0 || strengths.length > 0) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                        {errorCount > 0 && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                                <div className="text-2xl font-bold text-red-400">{errorCount}</div>
                                <div className="text-xs text-red-300">Critical Issues</div>
                            </div>
                        )}
                        {warningCount > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                                <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
                                <div className="text-xs text-yellow-300">Warnings</div>
                            </div>
                        )}
                        {strengths.length > 0 && (
                            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                                <div className="text-2xl font-bold text-green-400">{strengths.length}</div>
                                <div className="text-xs text-green-300">Strengths</div>
                            </div>
                        )}
                        {metrics && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                                <div className="text-2xl font-bold text-blue-400">{metrics.percentageQuantified}%</div>
                                <div className="text-xs text-blue-300">Quantified</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Category Scores */}
                {categoryScores.length > 0 && (
                    <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6 mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BarChart3 size={16} />
                            Category Breakdown
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {categoryScores.map((cat) => (
                                <div key={cat.name} className="text-center">
                                    <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${getScoreBg(cat.score)} ${getScoreColor(cat.score)}`}>
                                        <cat.icon size={20} />
                                    </div>
                                    <div className={`text-xl font-bold ${getScoreColor(cat.score)}`}>{cat.score}</div>
                                    <div className="text-xs text-gray-400 font-medium">{cat.name}</div>
                                    <div className="text-[10px] text-gray-600">{cat.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Top Priorities */}
                    {topPriorities.length > 0 && (
                        <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Target size={16} className="text-orange-400" />
                                Top Priorities
                            </h3>
                            <div className="space-y-3">
                                {topPriorities.map((priority, idx) => (
                                    <div key={idx} className="flex gap-3 p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                                        <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold shrink-0">
                                            {idx + 1}
                                        </div>
                                        <p className="text-sm text-gray-300">{priority}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Strengths */}
                    {strengths.length > 0 && (
                        <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Sparkles size={16} className="text-green-400" />
                                Your Strengths
                            </h3>
                            <div className="space-y-2">
                                {strengths.map((strength, idx) => (
                                    <div key={idx} className="flex gap-3 items-center p-2">
                                        <CheckCircle size={16} className="text-green-500 shrink-0" />
                                        <p className="text-sm text-gray-300">{strength}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Section Analysis */}
                {sectionAnalysis.length > 0 && (
                    <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6 mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <FileText size={16} />
                            Section-by-Section Analysis
                        </h3>
                        <div className="space-y-3">
                            {sectionAnalysis.map((section) => (
                                <div key={section.name} className="border border-gray-800 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setExpandedSection(expandedSection === section.name ? null : section.name)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${getScoreBg(section.score)} ${getScoreColor(section.score)}`}>
                                                {section.score}
                                            </div>
                                            <div className="text-left">
                                                <div className="font-medium text-gray-200">{section.name}</div>
                                                <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${getSectionStatusColor(section.status)}`}>
                                                    {section.status.replace('_', ' ')}
                                                </div>
                                            </div>
                                        </div>
                                        {(section.issues.length > 0 || section.suggestions.length > 0) && (
                                            expandedSection === section.name ? <ChevronUp size={18} /> : <ChevronDown size={18} />
                                        )}
                                    </button>
                                    {expandedSection === section.name && (section.issues.length > 0 || section.suggestions.length > 0) && (
                                        <div className="px-4 pb-4 pt-0 border-t border-gray-800/50">
                                            {section.issues.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="text-xs text-red-400 font-semibold mb-2">Issues:</div>
                                                    {section.issues.map((issue, idx) => (
                                                        <div key={idx} className="text-sm text-gray-400 ml-3 mb-1">• {issue}</div>
                                                    ))}
                                                </div>
                                            )}
                                            {section.suggestions.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="text-xs text-blue-400 font-semibold mb-2">Suggestions:</div>
                                                    {section.suggestions.map((sug, idx) => (
                                                        <div key={idx} className="text-sm text-gray-400 ml-3 mb-1">• {sug}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* All Issues */}
                {issues.length > 0 && (
                    <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6 mb-6">
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <AlertCircle size={16} />
                            All Findings ({issues.length})
                        </h3>
                        <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                            {issues.slice(0, 10).map((issue, idx) => (
                                <div
                                    key={idx}
                                    className="flex gap-3 p-3 bg-black/30 rounded-lg border border-gray-800 animate-in slide-in-from-right-2 fade-in"
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    {getIssueIcon(issue.type)}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-300">{issue.message}</p>
                                        {issue.suggestion && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                <span className="text-blue-400">Tip:</span> {issue.suggestion}
                                            </p>
                                        )}
                                        {issue.category && (
                                            <span className="inline-block mt-2 text-[10px] px-2 py-0.5 bg-gray-800 rounded-full text-gray-500 uppercase">
                                                {issue.category}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {issues.length > 10 && (
                                <p className="text-center text-sm text-gray-500 py-2">
                                    + {issues.length - 10} more issues to review in editor
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Action Verbs & Metrics */}
                {(actionVerbs || metrics) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                        {metrics && (
                            <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                                    Quantification Analysis
                                </h3>
                                <div className="flex items-center gap-4">
                                    <div className={`text-4xl font-bold ${metrics.percentageQuantified >= 50 ? 'text-green-400' : metrics.percentageQuantified >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {metrics.percentageQuantified}%
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        <p>{metrics.bulletPointsWithNumbers} of {metrics.totalBulletPoints} bullet points</p>
                                        <p className="text-xs">contain metrics or numbers</p>
                                    </div>
                                </div>
                                {metrics.percentageQuantified < 50 && (
                                    <p className="text-xs text-yellow-400/70 mt-3">
                                        Aim for 50%+ quantified bullets for maximum impact
                                    </p>
                                )}
                            </div>
                        )}

                        {actionVerbs && (
                            <div className="bg-[#1A1A1A] border border-gray-800 rounded-2xl p-6">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                                    Action Verbs
                                </h3>
                                {actionVerbs.strong.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs text-green-400 mb-1">Strong verbs used:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {actionVerbs.strong.slice(0, 5).map((verb, idx) => (
                                                <span key={idx} className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs">
                                                    {verb}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {actionVerbs.weak.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-xs text-red-400 mb-1">Weak verbs to replace:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {actionVerbs.weak.slice(0, 3).map((verb, idx) => (
                                                <span key={idx} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs">
                                                    {verb}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {actionVerbs.suggestions.length > 0 && (
                                    <div>
                                        <p className="text-xs text-blue-400 mb-1">Try these instead:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {actionVerbs.suggestions.slice(0, 5).map((verb, idx) => (
                                                <span key={idx} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">
                                                    {verb}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* CTA Button */}
                <div className="sticky bottom-4 z-20">
                    <button
                        onClick={onComplete}
                        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-black font-bold text-lg rounded-xl transition-all shadow-[0_0_20px_rgba(0,255,148,0.3)] hover:shadow-[0_0_30px_rgba(0,255,148,0.5)] flex items-center justify-center gap-2 group"
                    >
                        <span>Continue to Editor & Fix Issues</span>
                        <ArrowRight className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <p className="text-center text-xs text-gray-600 mt-3">
                        Your resume data has been saved. Click above to start improving.
                    </p>
                </div>
            </div>
        </div>
    );
};
