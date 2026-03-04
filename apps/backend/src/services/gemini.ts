/**
 * @deprecated Import directly from the focused ai/* modules instead.
 *
 * This facade exists only for backward compatibility while callers migrate.
 * Each function has been moved to its own Single-Responsibility module:
 *   - Resume tailoring/bullets  → services/ai/tailor.ts
 *   - ATS scoring               → services/ai/scoring.ts
 *   - Cover letter/essays/skills → services/ai/content.ts
 *   - Shared utilities           → services/ai/base.ts
 */
export { optimizeBulletPoint, tailorResume } from './ai/tailor.js';
export { calculateATSScore } from './ai/scoring.js';
export { generateCoverLetter, generateEssayResponses, standardizeSkills } from './ai/content.js';
