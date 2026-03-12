// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Import config
import config, { validateEnvironment } from './config/environment.js';

// Validate environment variables at startup
validateEnvironment();

// Import routes after env is loaded
// Authorization routes removed (Supabase Native Auth)
import profileRoutes from './routes/profiles.js';
import tailorRoutes from './routes/tailor.js';
import autofillRoutes from './routes/autofill.js';
import scrapeRoutes from './routes/scrape.js';
import applicationRoutes from './routes/applications.js';
import jobRoutes from './routes/jobs.js';
import creditRoutes from './routes/credits.js';

const app: express.Application = express();
const PORT = config.port;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.supabase.co"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for extension
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow CORS
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Rate limiting - Global API protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isDevelopment ? 1000 : 300, // More restrictive in production
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
// app.use('/api/auth', authRoutes); // Handled by Supabase
app.use('/api/profiles', profileRoutes);
app.use('/api/tailor', tailorRoutes);
app.use('/api/autofill', autofillRoutes);
app.use('/api/scrape', scrapeRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/credits', creditRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

export default app;
