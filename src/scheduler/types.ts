/**
 * Scheduler types. This module is pure: no model calls, no Supabase, no
 * React Native. It must be testable with fixtures alone (spec §6).
 */

export type Readiness =
  | 'not_started'
  | 'learning'
  | 'under_tempo'
  | 'performance_ready';

/**
 * Backwards periodization phases (spec §5.3), plus `maintain` for rep shared
 * with a later audition that must not drop to zero after the first one.
 */
export type Phase =
  | 'learn'
  | 'build'
  | 'consolidate'
  | 'simulate'
  | 'taper'
  | 'maintain';

/** ISO calendar date, e.g. '2026-09-14'. The scheduler is timezone-agnostic. */
export type ISODate = string;

export interface AuditionInput {
  id: string;
  name: string;
  auditionDate: ISODate;
  /** Canonical excerpt ids on this audition's rep list. */
  repExcerptIds: string[];
}

export interface ExcerptInput {
  excerptId: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  readiness: Readiness;
  /** Optional priority from the assess_rep model call; folded into weight. */
  priorityScore?: number;
}

export interface PracticeProfileInput {
  daysPerWeek: number; // 1..7 (7 is clamped to 6 — rest day is mandatory)
  sessionMinutes: number;
  blackoutDates: ISODate[];
  warmupMinutes?: number; // default 10
  closerMinutes?: number; // default 5
  /** "What does a bad day look like?" — the minimum viable session. */
  minimumViableSessionMinutes: number;
}

export interface SchedulerOptions {
  horizonStart: ISODate;
  /** Defaults to the latest audition date. */
  horizonEnd?: ISODate;
  /** Hard cap on week-over-week volume ramp (guardrail, spec §8). */
  maxWeeklyRampPct?: number; // default 0.10
  /** Insert a break after this many consecutive playing minutes. */
  breakEveryMinutes?: number; // default 40
  breakMinutes?: number; // default 5
  /** Days of taper immediately before each audition. */
  taperDays?: number; // default 3
}

export type BlockKind = 'warmup' | 'excerpt' | 'break' | 'closer' | 'mock_run';

export interface SessionBlock {
  kind: BlockKind;
  minutes: number;
  label: string;
  excerptId?: string;
  /** Phase this excerpt is in on this date (excerpt blocks only). */
  phase?: Phase;
  /** For mock_run: the audition being simulated and its ordered list. */
  auditionId?: string;
  mockOrder?: string[];
}

export interface PlannedSessionOutput {
  date: ISODate;
  /** Dominant phase of the day relative to the nearest upcoming audition. */
  phase: Phase;
  plannedMinutes: number;
  blocks: SessionBlock[];
}

export interface PhaseWindow {
  phase: Phase;
  start: ISODate;
  end: ISODate; // inclusive
  /** The audition this window is periodized toward. */
  auditionId: string;
}

export interface OverlapAnalysis {
  totalLineItems: number;
  distinctExcerpts: number;
  /** Excerpts on ≥ 2 auditions: high frequency, earliest-deadline standard. */
  spine: Array<{ excerptId: string; auditionIds: string[] }>;
  /** Excerpts on exactly 1 audition: ramped just-in-time. */
  orphans: Array<{ excerptId: string; auditionId: string }>;
  auditionIdsByExcerpt: Record<string, string[]>;
}

export interface PlanOutput {
  sessions: PlannedSessionOutput[];
  /** Per-excerpt phase timeline. */
  phaseMap: Record<string, PhaseWindow[]>;
  overlap: OverlapAnalysis;
  /** Non-fatal adjustments the scheduler made (e.g. clamped days/week). */
  warnings: string[];
}

export interface AdherenceEvent {
  date: ISODate;
  status: 'completed' | 'partial' | 'skipped';
  actualMinutes?: number;
}

export interface ReplanResult {
  plan: PlanOutput;
  /**
   * Structured facts about what changed — input to user-facing copy
   * (templated or phrased by the model). Never shaming (spec §8).
   */
  changes: {
    missedSessions: number;
    deprioritizedExcerptIds: string[];
    protectedSpineExcerptIds: string[];
    auditionRisk: Array<{
      auditionId: string;
      status: 'on_track' | 'tight' | 'at_risk';
    }>;
  };
  /** Plain-language, guilt-free summary built from `changes`. */
  message: string;
}
