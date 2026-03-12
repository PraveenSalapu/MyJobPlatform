import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ResumeProvider } from './context/ResumeContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { AuthPage } from './components/Auth/AuthPage';
import { LandingPage } from './components/Landing/LandingPage';
import { HeroRoaster } from './components/Landing/HeroRoaster';
import { ScanResults } from './components/Landing/ScanResults';
import { DemographicsStep } from './components/Onboarding/DemographicsStep';
import { useState, useEffect } from 'react';
import { getOnboardingStatus, completeOnboarding } from './services/storage';
import { Loader2 } from 'lucide-react';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Main app content after auth
function AppContent() {
  const { user, isLoading: authLoading } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [view, setView] = useState<'roaster' | 'results' | 'demographics' | 'editor'>('roaster');

  // Check onboarding status from database when user changes
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setOnboardingComplete(false);
      return;
    }

    const checkOnboarding = async () => {
      try {
        const status = await getOnboardingStatus(user.id);
        setOnboardingComplete(status);
        if (!status) {
          setView('roaster');
        }
      } catch (error) {
        console.error('[App] Failed to check onboarding status:', error);
        setOnboardingComplete(false);
      }
    };
    checkOnboarding();
  }, [user, authLoading]);

  const handleFinalComplete = async () => {
    try {
      await completeOnboarding(user?.id);
      setOnboardingComplete(true);
    } catch (error) {
      console.error('[App] Failed to complete onboarding:', error);
      // Still allow user to proceed even if save fails
      setOnboardingComplete(true);
    }
  };

  const handleSkipToEditor = () => {
    handleFinalComplete();
  };

  // Loading state while checking onboarding status
  if (onboardingComplete === null) {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0F0F0F] text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-gray-400 font-mono text-sm">Checking profile status...</p>
      </div>
    );
  }

  if (onboardingComplete) {
    return <Layout />;
  }

  return (
    <>
      {view === 'roaster' && (
        <HeroRoaster
          onScanComplete={() => setView('results')}
          onProfileSelect={handleSkipToEditor}
        />
      )}
      {view === 'results' && (
        <ScanResults onComplete={() => setView('demographics')} />
      )}
      {view === 'demographics' && (
        <DemographicsStep onComplete={handleFinalComplete} />
      )}
    </>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Landing page for non-authenticated users */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <ProtectedRoute>
              <ResumeProvider>
                <AppContent />
              </ResumeProvider>
            </ProtectedRoute>
          ) : (
            <LandingPage />
          )
        }
      />

      {/* Auth routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/app" replace /> : <AuthPage initialMode="login" />
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated ? <Navigate to="/app" replace /> : <AuthPage initialMode="register" />
        }
      />

      {/* Protected app routes */}
      <Route
        path="/app/*"
        element={
          <ProtectedRoute>
            <ResumeProvider>
              <AppContent />
            </ResumeProvider>
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect */}
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <Navigate to="/app" replace />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
