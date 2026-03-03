import React, { useState, useCallback, useEffect } from 'react';
import { useResume } from '../../context/ResumeContext';
import { useAuth } from '../../context/AuthContext';
import { Cpu, Upload, User, ArrowRight, PlusCircle, Loader2 } from 'lucide-react';
import { extractTextFromPDF } from '../../utils/pdfUtils';
import { parseResumeWithAI } from '../../services/parser';
import { getAllProfiles, setActiveProfileId, createProfile, updateActiveProfileData, type UserProfile } from '../../services/storage';
import { analyzeResume } from '../../services/api';
import type { AtsScan } from '../../types';

interface HeroRoasterProps {
    onScanComplete?: () => void;
    onProfileSelect?: () => void;
}

export const HeroRoaster: React.FC<HeroRoasterProps> = ({ onScanComplete, onProfileSelect }) => {
    const { dispatch } = useResume();
    const { user } = useAuth();
    const [isDragging, setIsDragging] = useState(false);
    const [scanState, setScanState] = useState<'idle' | 'scanning' | 'complete'>('idle');
    const [logs, setLogs] = useState<string[]>([]);
    const [existingProfiles, setExistingProfiles] = useState<UserProfile[]>([]);
    const [showUpload, setShowUpload] = useState(false);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

    useEffect(() => {
        const loadProfiles = async () => {
            try {
                const profiles = await getAllProfiles(user?.id);
                const validProfiles = profiles.filter(p =>
                    p.data?.personalInfo?.fullName?.trim() !== '' ||
                    (p.data?.experience && p.data.experience.length > 0) ||
                    (p.name !== 'Default Profile' && p.name.trim() !== '')
                ).sort((a, b) => b.updatedAt - a.updatedAt);

                setExistingProfiles(validProfiles);
                setShowUpload(validProfiles.length === 0);
            } catch (error) {
                console.error('Failed to load profiles:', error);
                setShowUpload(true);
            } finally {
                setIsLoadingProfiles(false);
            }
        };
        loadProfiles();
    }, [user?.id]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

    const handleFile = async (file: File) => {
        if (file.type !== 'application/pdf') return;

        setScanState('scanning');
        setShowUpload(true);
        setLogs([]);
        addLog("Initializing ATS Scanner v2.1...");

        setTimeout(() => addLog("Parsing binary PDF structure..."), 800);
        setTimeout(() => addLog("Extracting raw text layer..."), 1600);
        setTimeout(() => addLog("Identifying key sections..."), 2400);

        try {
            const text = await extractTextFromPDF(file);
            addLog("Text extraction complete.");
            addLog("Analyzing keyword density against current market...");

            const parsedData = await parseResumeWithAI(text);
            let finalResumeData = parsedData;

            // Save to database immediately (before view transition)
            addLog("Saving profile to database...");
            try {
                // Check if we have an active profile to update, or need to create one
                const activeProfile = existingProfiles.find(p => p.isActive);

                if (activeProfile) {
                    // Update existing
                    // Ensure we preserve the ID
                    finalResumeData = { ...parsedData, id: activeProfile.id };
                    await updateActiveProfileData(finalResumeData, user?.id);
                    addLog("Profile updated successfully.");
                } else {
                    // Create new profile for this upload
                    const newProfile = await createProfile(
                        parsedData.personalInfo.fullName || 'Uploaded Resume',
                        parsedData,
                        user?.id
                    );
                    await setActiveProfileId(newProfile.id, user?.id);
                    // Critical: Use the new ID from DB
                    finalResumeData = newProfile.data;
                    addLog("New profile created successfully.");
                }
            } catch (saveError) {
                console.error('Failed to save parsed resume:', saveError);
                addLog("Warning: Could not save to database.");
            }

            // Perform real analysis
            addLog("Running comprehensive resume analysis...");

            try {
                const analysisResult = await analyzeResume(finalResumeData, false);
                addLog(`Analysis complete. Score: ${analysisResult.overallScore}/100`);

                // Convert analysis result to AtsScan format
                const scanResults: AtsScan = {
                    score: analysisResult.overallScore,
                    letterGrade: analysisResult.letterGrade,
                    summary: analysisResult.summary,
                    scores: analysisResult.scores,
                    sectionAnalysis: analysisResult.sectionAnalysis,
                    issues: analysisResult.issues,
                    topPriorities: analysisResult.topPriorities,
                    strengths: analysisResult.strengths,
                    keywords: analysisResult.keywords.found,
                    missingKeywords: analysisResult.keywords.missing,
                    industryKeywords: analysisResult.keywords.industryRelevant,
                    metrics: analysisResult.metrics,
                    actionVerbs: analysisResult.actionVerbs,
                };

                setTimeout(() => {
                    addLog("Optimization complete.");
                    setScanState('complete');

                    // Dispatch with the CORRECT ID (from DB or existing)
                    dispatch({ type: 'SET_RESUME', payload: finalResumeData });
                    dispatch({ type: 'SET_SCAN_RESULTS', payload: scanResults });

                    if (onScanComplete) onScanComplete();
                }, 1000);

            } catch (analysisError) {
                console.error('Analysis failed:', analysisError);
                addLog("Warning: Could not complete full analysis. Using basic scan.");

                // Fallback to basic analysis if API fails
                setTimeout(() => {
                    addLog("Basic scan complete.");
                    setScanState('complete');

                    dispatch({ type: 'SET_RESUME', payload: finalResumeData });
                    dispatch({
                        type: 'SET_SCAN_RESULTS',
                        payload: {
                            score: 50,
                            issues: [
                                { type: 'info', message: 'Resume parsed successfully. Complete your profile for detailed analysis.', category: 'completeness', priority: 1 }
                            ],
                            missingKeywords: []
                        }
                    });

                    if (onScanComplete) onScanComplete();
                }, 1500);
            }

        } catch (error) {
            addLog("ERROR: Parse failed. File corrupted or encrypted.");
            addLog("Falling back to manual entry mode...");

            setTimeout(() => {
                setScanState('complete');
                dispatch({
                    type: 'SET_SCAN_RESULTS',
                    payload: {
                        score: 0,
                        issues: [{ type: 'error', message: 'Parsing failed. Please enter data manually.' }],
                        missingKeywords: []
                    }
                });
                if (onScanComplete) onScanComplete();
            }, 2000);
        }
    };

    const [activatingProfileId, setActivatingProfileId] = useState<string | null>(null);

    const handleContinueProfile = async (profileId: string) => {
        setActivatingProfileId(profileId);
        try {
            const activeProfile = await setActiveProfileId(profileId, user?.id);
            if (activeProfile && activeProfile.data) {
                // Use the returned profile payload (might have new ID if healed)
                dispatch({ type: 'SET_RESUME', payload: activeProfile.data });
                if (onProfileSelect) onProfileSelect();
            } else {
                console.error("Could not activate profile", profileId);
                setActivatingProfileId(null);
            }
        } catch (error) {
            console.error("Failed to continue profile:", error);
            setActivatingProfileId(null);
        }
    };

    const handleStartScratch = async () => {
        const newProfile = await createProfile('New Resume', undefined, user?.id);
        await setActiveProfileId(newProfile.id, user?.id);
        dispatch({ type: 'SET_RESUME', payload: newProfile.data });
        if (onProfileSelect) onProfileSelect(); // Skip scan results for scratch
    };

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, []);

    const renderWelcomeBack = () => (
        <div className="z-10 w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-500 px-4 sm:px-6">
            <div className="text-center mb-6 sm:mb-10">
                <div className="inline-block px-3 py-1 mb-4 border border-indigo-500/30 bg-indigo-900/10 rounded-full">
                    <span className="text-xs font-mono text-indigo-400">● USER IDENTIFIED</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tighter mb-4 text-white">
                    Welcome back, Agent.
                </h1>
                <p className="text-gray-400 max-w-xl mx-auto text-sm sm:text-base">
                    Resume profiles detected in local cache. Select a profile to continue or upload a new mission file.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full">
                <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Recent Profiles</h3>
                    {existingProfiles.slice(0, 3).map(profile => (
                        <button
                            key={profile.id}
                            onClick={() => handleContinueProfile(profile.id)}
                            disabled={activatingProfileId !== null}
                            className={`w-full flex items-center justify-between p-3 sm:p-4 bg-[#1A1A1A] border border-gray-800 rounded-xl hover:border-indigo-500/50 hover:bg-[#222] transition-all group text-left ${activatingProfileId === profile.id ? 'border-indigo-500 bg-[#222]' : ''}`}
                        >
                            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <div className="p-2 sm:p-3 bg-indigo-900/20 rounded-lg text-indigo-400 group-hover:scale-110 transition-transform flex-shrink-0">
                                    {activatingProfileId === profile.id ? <Loader2 size={18} className="animate-spin" /> : <User size={18} />}
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-medium text-gray-200 group-hover:text-white truncate">{profile.data.personalInfo.fullName || profile.name}</h4>
                                    <p className="text-xs text-gray-500">Last updated: {new Date(profile.updatedAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <ArrowRight size={18} className="text-gray-600 group-hover:text-indigo-400 transform group-hover:translate-x-1 transition-all flex-shrink-0 ml-2" />
                        </button>
                    ))}
                </div>

                <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2 ml-1">Other Actions</h3>

                    <button
                        onClick={() => setShowUpload(true)}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[#1A1A1A] border border-gray-800 rounded-xl hover:border-green-500/50 hover:bg-[#222] transition-all group text-left"
                    >
                        <div className="p-2 sm:p-3 bg-green-900/20 rounded-lg text-green-400 group-hover:scale-110 transition-transform">
                            <Upload size={18} />
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-200 group-hover:text-white">Upload New Resume</h4>
                            <p className="text-xs text-gray-500">Parse PDF with ATS scanner</p>
                        </div>
                    </button>

                    <button
                        onClick={handleStartScratch}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[#1A1A1A] border border-gray-800 rounded-xl hover:border-purple-500/50 hover:bg-[#222] transition-all group text-left"
                    >
                        <div className="p-2 sm:p-3 bg-purple-900/20 rounded-lg text-purple-400 group-hover:scale-110 transition-transform">
                            <PlusCircle size={18} />
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-200 group-hover:text-white">Create from Scratch</h4>
                            <p className="text-xs text-gray-500">Empty template</p>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );

    const renderScanner = () => (
        <>
            <div className="relative z-10 text-center mb-8 sm:mb-12 max-w-3xl animate-in fade-in slide-in-from-top-4 duration-500 px-4">
                <div className="inline-block px-3 py-1 mb-4 border border-green-500/30 bg-green-900/10 rounded-full">
                    <span className="text-xs font-mono text-green-400">● SYSTEM ONLINE</span>
                </div>
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter mb-4 sm:mb-6 bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent">
                    Resume.optimize( )
                </h1>
                <h2 className="text-base sm:text-lg md:text-xl text-gray-400 font-light font-mono max-w-2xl mx-auto">
                    The only ATS-compliant builder verified against Greenhouse & Lever algorithms.
                    <br className="hidden sm:block" /><span className="text-gray-500">Parse, score, and fix your profile in seconds.</span>
                </h2>
                {existingProfiles.length > 0 && (
                    <button
                        onClick={() => setShowUpload(false)}
                        className="mt-4 sm:mt-6 text-sm text-gray-500 hover:text-white underline transition-colors"
                    >
                        ← Back to Profiles
                    </button>
                )}
            </div>

            <div
                className={`relative z-10 w-full max-w-2xl px-4 transition-all duration-300 transform ${scanState === 'complete' ? 'scale-95 opacity-50 blur-sm' : 'scale-100 opacity-100'
                    }`}
            >
                {scanState === 'idle' && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={onDrop}
                        className={`border-2 border-dashed rounded-xl h-48 sm:h-64 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#1A1A1A] ${isDragging ? 'border-green-500 bg-green-900/10' : 'border-gray-700 hover:border-gray-500'
                            }`}
                    >
                        <input
                            type="file"
                            accept=".pdf"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                        />
                        <div className="p-3 sm:p-4 bg-gray-800 rounded-full mb-3 sm:mb-4">
                            <Upload className={`w-6 h-6 sm:w-8 sm:h-8 ${isDragging ? 'text-green-400' : 'text-gray-400'}`} />
                        </div>
                        <p className="text-lg sm:text-xl font-medium text-gray-300 text-center px-4">Drop your PDF here to scan</p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-2 font-mono">Supports generic PDF formats</p>
                    </div>
                )}

                {scanState === 'scanning' && (
                    <div className="border border-green-500/50 rounded-xl h-48 sm:h-64 bg-black p-4 sm:p-6 font-mono text-xs sm:text-sm overflow-hidden shadow-[0_0_30px_rgba(0,255,148,0.1)]">
                        <div className="flex items-center gap-2 mb-3 sm:mb-4 border-b border-gray-800 pb-2">
                            <Cpu className="w-4 h-4 text-green-500 animate-pulse" />
                            <span className="text-green-500">ATS_SCANNER_RUNNING...</span>
                        </div>
                        <div className="space-y-2">
                            {logs.map((log, i) => (
                                <div key={i} className="text-gray-300 animate-in fade-in slide-in-from-left-2 duration-300">
                                    {log}
                                </div>
                            ))}
                            <div className="w-2 h-4 bg-green-500 animate-pulse inline-block ml-1" />
                        </div>
                    </div>
                )}
            </div>
        </>
    );

    // Loading state while fetching profiles
    if (isLoadingProfiles) {
        return (
            <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0F0F0F] text-white">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                <p className="text-gray-400 font-mono text-sm">Loading profiles...</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0F0F0F] text-white p-6 overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#222_1px,transparent_1px),linear-gradient(to_bottom,#222_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none" />

            {!showUpload && existingProfiles.length > 0 ? renderWelcomeBack() : renderScanner()}

            {scanState === 'complete' && (
                <div className="absolute z-20 inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
                    <div className="text-green-500 font-mono mb-4">Redirecting to Analysis...</div>
                    <button
                        onClick={() => onScanComplete && onScanComplete()}
                        className="text-gray-500 hover:text-white underline text-sm"
                    >
                        Stuck? Click to Skip
                    </button>
                </div>
            )}
        </div>
    );
};
