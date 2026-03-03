// Environment Configuration
// Centralized configuration for environment-specific URLs and settings

const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

export const config = {
  // API Backend URL - defaults to localhost in dev, MUST be set in production
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',

  // Frontend App URL (used by extension)
  appUrl: import.meta.env.VITE_APP_URL || 'http://localhost:5173',

  // Environment mode
  isDevelopment: isDev,
  isProduction: isProd,

  // Feature flags
  enableDebugLogs: isDev,

  // Optional features - gracefully disabled if not configured
  features: {
    jobSearch: !!import.meta.env.VITE_RAPIDAPI_KEY,
    aiTailoring: !!import.meta.env.VITE_GEMINI_API_KEY,
  },
};

// Validate required environment variables
const requiredVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const criticalVars = [...requiredVars, 'VITE_GEMINI_API_KEY']; // AI is critical for core features

const missing = criticalVars.filter(v => !import.meta.env[v]);

if (missing.length > 0) {
  if (isProd) {
    console.error(`[CRITICAL] Missing environment variables: ${missing.join(', ')}`);
  } else {
    console.warn(`[DEV] Missing environment variables: ${missing.join(', ')}`);
  }
}

// Warn about API URL in production
if (isProd && config.apiUrl.includes('localhost')) {
  console.error('[CRITICAL] VITE_API_URL is not set! API calls will fail.');
}

export default config;
