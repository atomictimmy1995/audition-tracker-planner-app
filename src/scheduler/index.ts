/**
 * Advance — deterministic practice scheduler.
 *
 * Pure module: no model calls, no Supabase, no React Native imports.
 * The model owns musical reasoning and language; this owns the math.
 */

export * from './types.ts';
export { generatePlan, buildMinimumViableSession, seededShuffle, type PlanInputs } from './engine.ts';
export { analyzeOverlap, overlapSummary } from './overlap.ts';
export { replan } from './replan.ts';
export { phaseWindowsForExcerpt, phaseOn } from './phases.ts';
export {
  applyVolumeCaps,
  pickPracticeDays,
  MAX_DAILY_MINUTES,
  MAX_PRACTICE_DAYS_PER_WEEK,
} from './guardrails.ts';
export { addDays, diffDays, dateRange } from './dates.ts';
