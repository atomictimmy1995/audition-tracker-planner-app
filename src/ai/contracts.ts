/**
 * Model call contracts (spec §5.5). Three separate calls, each narrow and
 * testable. All return strict JSON — validated here with Zod before anything
 * downstream may touch it. A failed parse is a failed call, never a guess.
 */

import { z } from 'zod';

export const READINESS_VALUES = [
  'not_started',
  'learning',
  'under_tempo',
  'performance_ready',
] as const;

/**
 * Auto-accept threshold for canonicalization (open question §11).
 * Below this, the match is surfaced to the user for confirmation rather
 * than silently guessed (acceptance criterion #1).
 */
export const CANONICALIZE_CONFIDENCE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// A. canonicalize_rep — messy rep text → canonical excerpt ids
// ---------------------------------------------------------------------------

export const CanonicalizeInput = z.object({
  instrument: z.string(),
  rawRepText: z.string().min(1),
  /** The canonical library the model may map into: id + names + aliases. */
  library: z.array(
    z.object({
      excerptId: z.string(),
      composer: z.string(),
      work: z.string(),
      movement: z.string().optional(),
      sectionLabel: z.string().optional(),
      aliases: z.array(z.string()),
    }),
  ),
});
export type CanonicalizeInput = z.infer<typeof CanonicalizeInput>;

export const CanonicalizedItem = z.object({
  raw_text: z.string(),
  excerpt_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  suggested_new_excerpt: z
    .object({
      composer: z.string(),
      work: z.string(),
      movement: z.string().optional(),
      section_label: z.string().optional(),
    })
    .optional(),
});
export const CanonicalizeOutput = z.array(CanonicalizedItem);
export type CanonicalizedItem = z.infer<typeof CanonicalizedItem>;
export type CanonicalizeOutput = z.infer<typeof CanonicalizeOutput>;

// ---------------------------------------------------------------------------
// B. assess_rep — difficulty / prep weeks / priority for THIS user
// ---------------------------------------------------------------------------

export const AssessInput = z.object({
  userLevel: z.enum(['student', 'emerging', 'professional']),
  weeksAvailable: z.number().positive(),
  excerpts: z.array(
    z.object({
      excerptId: z.string(),
      composer: z.string(),
      work: z.string(),
      libraryDifficulty: z.number().min(1).max(5),
      typicalPrepWeeks: z.number(),
      selfRating: z.enum(READINESS_VALUES),
    }),
  ),
});
export type AssessInput = z.infer<typeof AssessInput>;

export const AssessedExcerpt = z.object({
  excerpt_id: z.string(),
  difficulty: z.number().min(1).max(5),
  estimated_prep_weeks: z.number().positive(),
  priority_score: z.number().min(0).max(2),
  rationale: z.string(),
});
export const AssessOutput = z.array(AssessedExcerpt);
export type AssessOutput = z.infer<typeof AssessOutput>;

// ---------------------------------------------------------------------------
// C. write_sessions — the only call that writes user-facing prose
// ---------------------------------------------------------------------------

export const WriteSessionsInput = z.object({
  practiceProfile: z.object({
    warmupRitual: z.string().optional(),
    closingRitual: z.string().optional(),
    timeOfDay: z.string().optional(),
  }),
  /** Scheduler output — the model may NOT change dates, minutes, or order. */
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      date: z.string(),
      phase: z.string(),
      blocks: z.array(
        z.object({
          kind: z.string(),
          minutes: z.number(),
          excerptId: z.string().optional(),
          phase: z.string().optional(),
        }),
      ),
    }),
  ),
  /** Retrieved ExcerptKnowledge — the RAG grounding (spec §5.4). */
  knowledge: z.array(
    z.object({
      excerptId: z.string(),
      displayName: z.string(),
      technicalTraps: z.array(z.string()),
      practiceStrategies: z.array(z.string()),
      committeeExpectations: z.string().optional(),
      commonFailureModes: z.array(z.string()),
    }),
  ),
});
export type WriteSessionsInput = z.infer<typeof WriteSessionsInput>;

export const WrittenSession = z.object({
  session_id: z.string(),
  blocks: z.array(
    z.object({
      excerpt_id: z.string().optional(),
      label: z.string(),
      minutes: z.number(),
      instructions: z.string(),
    }),
  ),
  coach_note: z.string(),
});
export const WriteSessionsOutput = z.array(WrittenSession);
export type WriteSessionsOutput = z.infer<typeof WriteSessionsOutput>;

/** Parse + validate a model response that must be strict JSON. */
export function parseModelJson<T>(schema: z.ZodType<T>, raw: string): T {
  // Models occasionally wrap JSON in fences despite instructions; strip them
  // but accept nothing else non-JSON.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return schema.parse(JSON.parse(cleaned));
}
