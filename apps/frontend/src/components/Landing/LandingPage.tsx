import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    Wand2,
    Target,
    BarChart3,
    Briefcase,
    CheckCircle2,
    ArrowRight,
    Zap,
    Shield,
    Sparkles,
    ChevronRight,
    Bot,
    Upload,
    MousePointerClick
} from 'lucide-react';

export const LandingPage: React.FC = () => {
    const navigate = useNavigate();

    const features = [
        {
            icon: Upload,
            title: 'Smart Resume Parsing',
            description: 'Upload your PDF and our AI extracts all your information instantly with ATS-compliant formatting.',
            color: 'from-green-500 to-emerald-600'
        },
        {
            icon: Wand2,
            title: 'AI-Powered Tailoring',
            description: 'Automatically customize your resume for each job posting to maximize your match score.',
            color: 'from-indigo-500 to-purple-600'
        },
        {
            icon: Target,
            title: 'ATS Score Analysis',
            description: 'Get instant feedback on how well your resume matches job requirements and ATS systems.',
            color: 'from-amber-500 to-orange-600'
        },
        {
            icon: Briefcase,
            title: 'Job Board Integration',
            description: 'Browse curated job listings with AI-calculated match scores based on your profile.',
            color: 'from-blue-500 to-cyan-600'
        },
        {
            icon: BarChart3,
            title: 'Application Tracking',
            description: 'Track all your applications in one place with status updates and analytics.',
            color: 'from-pink-500 to-rose-600'
        },
        {
            icon: Bot,
            title: 'AI Career Agent',
            description: 'Your personal AI assistant to help optimize your job search strategy.',
            color: 'from-violet-500 to-purple-600'
        }
    ];

    const stats = [
        { value: '92%', label: 'ATS Pass Rate' },
        { value: '3x', label: 'More Interviews' },
        { value: '10k+', label: 'Resumes Optimized' },
        { value: '< 60s', label: 'Parse Time' }
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden">
            {/* Grid Background */}
            <div className="fixed inset-0 bg-[linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] bg-[size:60px_60px] opacity-30 pointer-events-none" />

            {/* Gradient Orbs */}
            <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

            {/* Navigation */}
            <nav className="relative z-50 border-b border-gray-800/50 bg-[#050505]/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 sm:h-20">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                                KC
                            </div>
                            <span className="text-xl font-bold tracking-tight">CareerFlow</span>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4">
                            <button
                                onClick={() => navigate('/login')}
                                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                            >
                                Sign In
                            </button>
                            <button
                                onClick={() => navigate('/register')}
                                className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                            >
                                Get Started <ArrowRight size={16} className="hidden sm:block" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 pt-16 sm:pt-24 lg:pt-32 pb-16 sm:pb-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center max-w-4xl mx-auto">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-900/20 mb-6 sm:mb-8">
                            <Sparkles size={14} className="text-indigo-400" />
                            <span className="text-xs sm:text-sm font-medium text-indigo-300">AI-Powered Resume Builder</span>
                        </div>

                        {/* Main Headline */}
                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 sm:mb-8 leading-[1.1]">
                            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
                                Land Your Dream Job
                            </span>
                            <br />
                            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                                With AI Precision
                            </span>
                        </h1>

                        {/* Subheadline */}
                        <p className="text-base sm:text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
                            The only resume builder that uses AI to tailor your resume for each job,
                            analyze ATS compatibility, and track your applications—all in one place.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 sm:mb-16">
                            <button
                                onClick={() => navigate('/register')}
                                className="w-full sm:w-auto px-8 py-4 text-base font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl transition-all shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 group"
                            >
                                Start Free <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className="w-full sm:w-auto px-8 py-4 text-base font-semibold bg-white/5 hover:bg-white/10 border border-gray-700 hover:border-gray-600 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <MousePointerClick size={18} /> Watch Demo
                            </button>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto">
                            {stats.map((stat, i) => (
                                <div key={i} className="p-4 sm:p-6 rounded-xl bg-white/5 border border-gray-800">
                                    <div className="text-2xl sm:text-3xl font-bold text-white mb-1">{stat.value}</div>
                                    <div className="text-xs sm:text-sm text-gray-500">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Preview Section */}
            <section className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gradient-to-b from-[#111] to-[#0a0a0a] shadow-2xl">
                        {/* Browser Chrome */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-[#0f0f0f]">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <div className="flex-1 flex justify-center">
                                <div className="px-4 py-1 rounded-md bg-[#1a1a1a] text-xs text-gray-500 font-mono">
                                    careerflow.app/editor
                                </div>
                            </div>
                        </div>

                        {/* App Preview */}
                        <div className="aspect-[16/9] sm:aspect-[16/8] bg-[#0F0F0F] p-4 sm:p-8">
                            <div className="h-full flex flex-col lg:flex-row gap-4 sm:gap-6">
                                {/* Left - Editor Mock */}
                                <div className="flex-1 rounded-xl bg-[#151518] border border-gray-800 p-4 sm:p-6 overflow-hidden">
                                    <div className="flex items-center gap-2 mb-4 sm:mb-6">
                                        <FileText className="text-indigo-400" size={18} />
                                        <span className="text-sm font-semibold text-gray-300">Resume Editor</span>
                                    </div>
                                    <div className="space-y-3 sm:space-y-4">
                                        {[
                                            { label: 'Full Name', width: '70%' },
                                            { label: 'Job Title', width: '60%' },
                                            { label: 'Summary', width: '100%', h: 'h-12 sm:h-16' }
                                        ].map((field, i) => (
                                            <div key={i}>
                                                <div className="text-[10px] sm:text-xs text-gray-500 mb-1">{field.label}</div>
                                                <div className={`${field.h || 'h-6 sm:h-8'} rounded-lg bg-[#1a1a1a] border border-gray-800`} style={{ width: field.width }} />
                                            </div>
                                        ))}
                                        <div className="pt-2 sm:pt-4 border-t border-gray-800">
                                            <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                                <Briefcase size={14} className="text-gray-500" />
                                                <span className="text-[10px] sm:text-xs text-gray-500">Experience</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="h-16 sm:h-20 rounded-lg bg-[#1a1a1a] border border-gray-800 p-2 sm:p-3">
                                                    <div className="h-2 sm:h-3 w-1/2 bg-gray-700 rounded mb-2" />
                                                    <div className="h-2 w-3/4 bg-gray-800 rounded mb-1" />
                                                    <div className="h-2 w-2/3 bg-gray-800 rounded" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right - Preview Mock */}
                                <div className="flex-1 rounded-xl bg-white p-4 sm:p-6 overflow-hidden shadow-xl hidden lg:block">
                                    <div className="space-y-4">
                                        <div className="text-center pb-4 border-b border-gray-200">
                                            <div className="h-5 w-32 bg-gray-800 rounded mx-auto mb-2" />
                                            <div className="h-3 w-24 bg-gray-300 rounded mx-auto" />
                                        </div>
                                        <div>
                                            <div className="h-3 w-16 bg-indigo-500 rounded mb-2" />
                                            <div className="space-y-1.5">
                                                <div className="h-2 w-full bg-gray-200 rounded" />
                                                <div className="h-2 w-5/6 bg-gray-200 rounded" />
                                                <div className="h-2 w-4/5 bg-gray-200 rounded" />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="h-3 w-20 bg-indigo-500 rounded mb-2" />
                                            <div className="space-y-1.5">
                                                <div className="h-2 w-full bg-gray-200 rounded" />
                                                <div className="h-2 w-3/4 bg-gray-200 rounded" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Score Widget */}
                                <div className="lg:w-48 space-y-3 sm:space-y-4">
                                    <div className="rounded-xl bg-[#151518] border border-gray-800 p-3 sm:p-4">
                                        <div className="text-[10px] sm:text-xs text-gray-500 mb-2 sm:mb-3">ATS Score</div>
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-12 h-12 sm:w-14 sm:h-14">
                                                <svg className="w-full h-full -rotate-90">
                                                    <circle cx="50%" cy="50%" r="45%" stroke="#374151" strokeWidth="8%" fill="none" />
                                                    <circle cx="50%" cy="50%" r="45%" stroke="#4ade80" strokeWidth="8%" fill="none"
                                                        strokeDasharray="283" strokeDashoffset="23" strokeLinecap="round" />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-sm sm:text-lg font-bold text-green-400">92%</span>
                                                </div>
                                            </div>
                                            <div className="text-[10px] sm:text-xs text-gray-400">
                                                Excellent match!
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 p-3 sm:p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wand2 size={14} className="text-indigo-400" />
                                            <span className="text-[10px] sm:text-xs font-medium text-indigo-300">AI Tailoring</span>
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-gray-400">
                                            Optimized for: Senior Developer
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="relative z-10 py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-12 sm:mb-16">
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
                            Everything You Need to
                            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"> Land the Job</span>
                        </h2>
                        <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
                            From resume creation to job tracking, our AI-powered platform handles every step of your job search.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        {features.map((feature, i) => (
                            <div
                                key={i}
                                className="group p-6 sm:p-8 rounded-2xl bg-[#111] border border-gray-800 hover:border-gray-700 transition-all hover:-translate-y-1"
                            >
                                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 sm:mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                                    <feature.icon size={24} className="text-white" />
                                </div>
                                <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3 text-white">{feature.title}</h3>
                                <p className="text-sm sm:text-base text-gray-400 leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="relative z-10 py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-12 sm:mb-16">
                        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
                            How It Works
                        </h2>
                        <p className="text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
                            Get started in minutes and let AI do the heavy lifting.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
                        {[
                            {
                                step: '01',
                                title: 'Upload Your Resume',
                                description: 'Drop your existing PDF or start from scratch. Our AI parses everything automatically.',
                                icon: Upload
                            },
                            {
                                step: '02',
                                title: 'Find Jobs & Tailor',
                                description: 'Browse matched jobs and let AI customize your resume for each application.',
                                icon: Wand2
                            },
                            {
                                step: '03',
                                title: 'Apply & Track',
                                description: 'One-click apply with auto-fill. Track all applications in your dashboard.',
                                icon: Target
                            }
                        ].map((item, i) => (
                            <div key={i} className="relative text-center">
                                {/* Connector Line */}
                                {i < 2 && (
                                    <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-px bg-gradient-to-r from-indigo-500/50 to-transparent" />
                                )}
                                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 mb-6 shadow-xl shadow-indigo-500/20">
                                    <item.icon size={28} className="text-white" />
                                </div>
                                <div className="text-xs font-bold text-indigo-400 mb-2">{item.step}</div>
                                <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-white">{item.title}</h3>
                                <p className="text-sm sm:text-base text-gray-400 max-w-xs mx-auto">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Testimonial/Trust Section */}
            <section className="relative z-10 py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="flex items-center justify-center gap-1 mb-6">
                        {[...Array(5)].map((_, i) => (
                            <Zap key={i} size={20} className="text-yellow-400 fill-yellow-400" />
                        ))}
                    </div>
                    <blockquote className="text-xl sm:text-2xl md:text-3xl font-medium text-gray-200 mb-6 sm:mb-8 leading-relaxed">
                        "I went from getting zero callbacks to landing 5 interviews in my first week.
                        The AI tailoring feature is a game-changer."
                    </blockquote>
                    <div className="flex items-center justify-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600" />
                        <div className="text-left">
                            <div className="font-semibold text-white">Sarah Chen</div>
                            <div className="text-sm text-gray-500">Software Engineer at Google</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative z-10 py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto">
                    <div className="relative rounded-3xl overflow-hidden">
                        {/* Background */}
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />

                        <div className="relative px-6 py-12 sm:px-12 sm:py-16 text-center">
                            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6">
                                Ready to Land Your Dream Job?
                            </h2>
                            <p className="text-base sm:text-lg text-white/80 max-w-xl mx-auto mb-8">
                                Join thousands of job seekers who've already optimized their resumes with CareerFlow.
                            </p>
                            <button
                                onClick={() => navigate('/register')}
                                className="px-8 sm:px-10 py-4 text-base sm:text-lg font-semibold bg-white text-indigo-600 hover:bg-gray-100 rounded-xl transition-all shadow-xl flex items-center gap-2 mx-auto"
                            >
                                Get Started Free <ChevronRight size={20} />
                            </button>
                            <p className="text-sm text-white/60 mt-4">No credit card required</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="relative z-10 border-t border-gray-800 py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm">
                                KC
                            </div>
                            <span className="font-semibold">CareerFlow</span>
                        </div>
                        <div className="flex items-center gap-6 text-sm text-gray-500">
                            <a href="#" className="hover:text-white transition-colors">Privacy</a>
                            <a href="#" className="hover:text-white transition-colors">Terms</a>
                            <a href="#" className="hover:text-white transition-colors">Contact</a>
                        </div>
                        <div className="text-sm text-gray-500">
                            © 2025 CareerFlow. All rights reserved.
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};
