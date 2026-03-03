// Backend Environment Configuration
// Centralized configuration for environment-specific settings

const isDevelopment = process.env.NODE_ENV !== 'production';

// Build CORS origins list
function getCorsOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [
    /^chrome-extension:\/\/.*/, // Chrome extension always allowed
  ];

  if (isDevelopment) {
    // Development origins
    origins.push(
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:4173',
    );
    // Allow Vercel previews only in development for testing
    origins.push(/^https:\/\/[a-z0-9-]+-[a-z0-9]+\.vercel\.app$/);
  }

  // Production origins from environment (comma-separated)
  // IMPORTANT: Set CORS_ORIGINS in production with your specific domain(s)
  const productionOrigins = process.env.CORS_ORIGINS;
  if (productionOrigins) {
    productionOrigins.split(',').forEach(origin => {
      const trimmed = origin.trim();
      if (trimmed) origins.push(trimmed);
    });
  }

  // Always include the app URL if set (primary production domain)
  const appUrl = process.env.APP_URL;
  if (appUrl && !origins.includes(appUrl)) {
    origins.push(appUrl);
  }

  // If no production origins configured and in production, warn
  if (!isDevelopment && !productionOrigins && !appUrl) {
    console.warn('⚠️  No CORS_ORIGINS or APP_URL configured for production!');
  }

  return origins;
}

export const config = {
  // Server port
  port: process.env.PORT || 3001,

  // Environment mode
  isDevelopment,
  isProduction: !isDevelopment,

  // CORS allowed origins
  corsOrigins: getCorsOrigins(),

  // Feature flags
  enableDebugLogs: isDevelopment,
};

// Validate required environment variables at startup
export function validateEnvironment(): void {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    if (config.isProduction) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  // Log CORS configuration in development
  if (isDevelopment) {
    console.log('📋 CORS Origins:', config.corsOrigins);
  }
}

export default config;
