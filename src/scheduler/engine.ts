/**
 * The deterministic scheduler (spec §5.1). Owns ALL math: date math, session
 * counts, rotation frequency, load balancing, phase boundaries, taper
 * windows, rest days, exposure counts. No model involvement anywhere.
 */

import { addDays, dateRange, diffDays, isBefore, maxDate, weekKey, weekday } from './dates.ts';
import {
  DEFAULT_BREAK_EVERY_MINUTES,
  DEFAULT_BREAK_MINUTES,
  DEFAULT_MAX_WEEKLY_RAMP_PCT,
  MAX_PRACTICE_DAYS_PER_WEEK,
  applyVolumeCaps,
  pickPracticeDays,
  type DayVolume,
} from './guardrails.ts';
import { analyzeOverlap } from './overlap.ts';
import { phaseOn, phaseWindowsForExcerpt } from './phases.ts';
import type {
  AuditionInput,
  ExcerptInput,
  ISODate,
  Phase,
  PhaseWindow,
  PlanOutput,
  PlannedSessionOutput,
  PracticeProfileInput,
  SchedulerOptions,
  SessionBlock,
} from './types.ts';

export interface PlanInputs {
  auditions: AuditionInput[];
  excerpts: ExcerptInput[];
  profile: PracticeProfileInput;
  options: SchedulerOptions;
}

const READINESS_DEFICIT: Record<ExcerptInput['readiness'], number> = {
  not_started: 4,
  learning: 3,
  under_tempo: 2,
  performance_ready: 1,
};

const PHASE_WEIGHT: Record<Phase, number> = {
  learn: 1.2,
  build: 1.3,
  consolidate: 1.0,
  simulate: 1.0,
  taper: 0.5,
  maintain: 0.35,
};

const PHASE_BLOCK_MINUTES: Record<Phase, number> = {
  learn: 20,
  build: 15,
  consolidate: 12,
  simulate: 10,
  taper: 8,
  maintain: 8,
};

const MIN_BLOCK_MINUTES = 8;
const TAPER_VOLUME_FACTOR = 0.6;
const DEFAULT_WARMUP_MINUTES = 10;
const DEFAULT_CLOSER_MINUTES = 5;
const DEFAULT_TAPER_DAYS = 3;

export function generatePlan(inputs: PlanInputs): PlanOutput {
  const { auditions, excerpts, profile, options } = inputs;
  const warnings: string[] = [];

  if (auditions.length === 0 || excerpts.length === 0) {
    return {
      sessions: [],
      phaseMap: {},
      overlap: analyzeOverlap(auditions),
      warnings: ['Nothing to schedule: add at least one audition with rep.'],
    };
  }

  let daysPerWeek = Math.max(1, Math.min(7, Math.round(profile.daysPerWeek)));
  if (daysPerWeek > MAX_PRACTICE_DAYS_PER_WEEK) {
    daysPerWeek = MAX_PRACTICE_DAYS_PER_WEEK;
    warnings.push(
      'Practicing 7 days a week invites injury — a full rest day is built in. Planning 6 days.',
    );
  }

  const horizonStart = options.horizonStart;
  const horizonEnd =
    options.horizonEnd ?? maxDate(auditions.map((a) => a.auditionDate));
  const taperDays = options.taperDays ?? DEFAULT_TAPER_DAYS;

  // --- Phase map per excerpt --------------------------------------------
  const excerptById = new Map(excerpts.map((e) => [e.excerptId, e]));
  const auditionsByExcerpt = new Map<string, AuditionInput[]>();
  for (const a of auditions) {
    for (const id of a.repExcerptIds) {
      if (!excerptById.has(id)) continue;
      (auditionsByExcerpt.get(id) ?? auditionsByExcerpt.set(id, []).get(id)!).push(a);
    }
  }

  const phaseMap: Record<string, PhaseWindow[]> = {};
  for (const [excerptId, its] of auditionsByExcerpt) {
    phaseMap[excerptId] = phaseWindowsForExcerpt(
      excerptById.get(excerptId)!,
      its,
      horizonStart,
      taperDays,
    );
  }

  // --- Practice days: rest days + blackouts + volume caps ----------------
  const blackouts = new Set(profile.blackoutDates);
  const weeks = new Map<ISODate, ISODate[]>();
  for (const d of dateRange(horizonStart, horizonEnd)) {
    const key = weekKey(d);
    (weeks.get(key) ?? weeks.set(key, []).get(key)!).push(d);
  }

  const auditionDates = new Set(auditions.map((a) => a.auditionDate));
  const practiceDays: ISODate[] = [];
  for (const [, bucket] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Audition days themselves are never practice days.
    const candidates = bucket.filter((d) => !auditionDates.has(d));
    practiceDays.push(...pickPracticeDays(candidates, daysPerWeek, blackouts, weekday));
  }

  const nearestAuditionGap = (date: ISODate): number | null => {
    let best: number | null = null;
    for (const a of auditions) {
      const gap = diffDays(date, a.auditionDate);
      if (gap >= 0 && (best === null || gap < best)) best = gap;
    }
    return best;
  };

  const requestedVolumes: DayVolume[] = practiceDays.map((date) => {
    const gap = nearestAuditionGap(date);
    const isTaper = gap !== null && gap <= taperDays;
    const minutes = Math.round(
      profile.sessionMinutes * (isTaper ? TAPER_VOLUME_FACTOR : 1),
    );
    return { date, minutes: Math.max(minutes, profile.minimumViableSessionMinutes) };
  });

  const cappedVolumes = applyVolumeCaps(
    requestedVolumes,
    options.maxWeeklyRampPct ?? DEFAULT_MAX_WEEKLY_RAMP_PCT,
  );
  const minutesByDate = new Map(cappedVolumes.map((v) => [v.date, v.minutes]));

  // --- Rotation: smooth weighted round-robin -----------------------------
  // Exposure frequency ∝ (difficulty × deficit × phase) / days_remaining,
  // which satisfies acceptance criterion #3 by construction.
  const weightOn = (excerptId: string, date: ISODate): { weight: number; phase: Phase } | null => {
    const windows = phaseMap[excerptId];
    if (!windows) return null;
    const phase = phaseOn(windows, date);
    if (!phase) return null;

    const excerpt = excerptById.get(excerptId)!;
    const nextAudition = auditionsByExcerpt
      .get(excerptId)!
      .filter((a) => !isBefore(a.auditionDate, date))
      .sort((a, b) => a.auditionDate.localeCompare(b.auditionDate))[0];
    if (!nextAudition) return null;

    const daysRemaining = Math.max(1, diffDays(date, nextAudition.auditionDate));
    const deficit = READINESS_DEFICIT[excerpt.readiness];
    const priority = excerpt.priorityScore ?? 1;
    const weight =
      (excerpt.difficulty * deficit * PHASE_WEIGHT[phase] * priority) / daysRemaining;
    return { weight, phase };
  };

  const credit = new Map<string, number>();
  const mockScheduledForWeek = new Set<ISODate>();
  const sessions: PlannedSessionOutput[] = [];

  const lastPracticeDayOfWeek = new Map<ISODate, ISODate>();
  for (const d of practiceDays) {
    if (minutesByDate.has(d)) lastPracticeDayOfWeek.set(weekKey(d), d);
  }

  for (const date of practiceDays) {
    const dayMinutes = minutesByDate.get(date);
    if (!dayMinutes) continue;

    const active = [...auditionsByExcerpt.keys()]
      .map((id) => ({ id, info: weightOn(id, date) }))
      .filter((x): x is { id: string; info: { weight: number; phase: Phase } } => x.info !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (active.length === 0) continue;

    const warmupMinutes = Math.min(
      profile.warmupMinutes ?? DEFAULT_WARMUP_MINUTES,
      Math.floor(dayMinutes / 3),
    );
    const closerMinutes = Math.min(
      profile.closerMinutes ?? DEFAULT_CLOSER_MINUTES,
      Math.floor(dayMinutes / 4),
    );

    const dominantPhase = dominant(active.map((a) => a.info.phase));
    const week = weekKey(date);
    const isMockDay =
      dominantPhase === 'simulate' &&
      lastPracticeDayOfWeek.get(week) === date &&
      !mockScheduledForWeek.has(week);

    const blocks: SessionBlock[] = [
      { kind: 'warmup', minutes: warmupMinutes, label: 'Your warm-up ritual' },
    ];
    let used = warmupMinutes;
    let sinceBreak = warmupMinutes;
    const breakEvery = options.breakEveryMinutes ?? DEFAULT_BREAK_EVERY_MINUTES;
    const breakMinutes = options.breakMinutes ?? DEFAULT_BREAK_MINUTES;
    const playingBudget = dayMinutes - closerMinutes;

    if (isMockDay) {
      mockScheduledForWeek.add(week);
      const audition = auditions
        .filter((a) => !isBefore(a.auditionDate, date))
        .sort((a, b) => a.auditionDate.localeCompare(b.auditionDate))[0];
      if (audition) {
        const runMinutes = Math.max(MIN_BLOCK_MINUTES, playingBudget - used);
        blocks.push({
          kind: 'mock_run',
          minutes: runMinutes,
          label: `Mock round: ${audition.name}`,
          auditionId: audition.id,
          mockOrder: seededShuffle(audition.repExcerptIds, `${date}:${audition.id}`),
        });
        used += runMinutes;
      }
    } else {
      const totalWeight = active.reduce((s, a) => s + a.info.weight, 0);
      // Sessions are short; without a floor an excerpt scheduled today could
      // still starve. SWRR guarantees long-run proportionality.
      while (true) {
        for (const a of active) {
          credit.set(a.id, (credit.get(a.id) ?? 0) + a.info.weight);
        }
        const pick = active.reduce((best, a) =>
          (credit.get(a.id) ?? 0) > (credit.get(best.id) ?? 0) ? a : best,
        );
        credit.set(pick.id, (credit.get(pick.id) ?? 0) - totalWeight);

        let blockMinutes = PHASE_BLOCK_MINUTES[pick.info.phase];
        if (used + blockMinutes > playingBudget) {
          blockMinutes = playingBudget - used;
        }
        if (blockMinutes < MIN_BLOCK_MINUTES) break;

        if (sinceBreak + blockMinutes > breakEvery && playingBudget - used > breakMinutes + MIN_BLOCK_MINUTES) {
          blocks.push({ kind: 'break', minutes: breakMinutes, label: 'Hands off — short break' });
          used += breakMinutes;
          sinceBreak = 0;
          continue;
        }

        blocks.push({
          kind: 'excerpt',
          minutes: blockMinutes,
          label: pick.id,
          excerptId: pick.id,
          phase: pick.info.phase,
        });
        used += blockMinutes;
        sinceBreak += blockMinutes;
      }
    }

    // Block granularity can leave a few minutes unused; fold them into the
    // closer so the session fills its capped allowance exactly. Weekly ramp
    // math on the assembled plan then matches the allowance math.
    blocks.push({
      kind: 'closer',
      minutes: closerMinutes + Math.max(0, dayMinutes - used - closerMinutes),
      label: 'Your closer',
    });
    used = Math.max(used + closerMinutes, dayMinutes);

    sessions.push({
      date,
      phase: dominantPhase,
      plannedMinutes: used,
      blocks,
    });
  }

  enforceWeeklyRamp(sessions, options.maxWeeklyRampPct ?? DEFAULT_MAX_WEEKLY_RAMP_PCT);

  return { sessions, phaseMap, overlap: analyzeOverlap(auditions), warnings };
}

/**
 * Final guardrail pass on the assembled plan: whatever the allocator did,
 * no week's actual total may exceed the previous week's by more than the
 * ramp cap. Excess is trimmed from the end of the offending week.
 */
function enforceWeeklyRamp(sessions: PlannedSessionOutput[], maxRampPct: number): void {
  const byWeek = new Map<ISODate, PlannedSessionOutput[]>();
  for (const s of sessions) {
    const key = weekKey(s.date);
    (byWeek.get(key) ?? byWeek.set(key, []).get(key)!).push(s);
  }

  let prevTotal: number | null = null;
  for (const [, weekSessions] of [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let total = weekSessions.reduce((sum, s) => sum + s.plannedMinutes, 0);
    if (prevTotal !== null) {
      const cap = Math.round(prevTotal * (1 + maxRampPct));
      let excess = total - cap;
      for (let i = weekSessions.length - 1; i >= 0 && excess > 0; i--) {
        const session = weekSessions[i];
        for (let j = session.blocks.length - 1; j >= 0 && excess > 0; j--) {
          const block = session.blocks[j];
          if (block.kind !== 'excerpt' && block.kind !== 'mock_run') continue;
          const cut = Math.min(excess, block.minutes);
          block.minutes -= cut;
          session.plannedMinutes -= cut;
          total -= cut;
          excess -= cut;
        }
        session.blocks = session.blocks.filter((b) => b.minutes > 0);
      }
    }
    prevTotal = total;
  }
}

/**
 * The bad-day fallback (spec §5.3): minimum viable session, spine only.
 * Never scheduled by default — offered when the day is falling apart.
 */
export function buildMinimumViableSession(
  date: ISODate,
  inputs: PlanInputs,
): PlannedSessionOutput {
  const overlap = analyzeOverlap(inputs.auditions);
  const spineIds = overlap.spine.map((s) => s.excerptId);
  const total = inputs.profile.minimumViableSessionMinutes;
  const warmup = 2;
  const budget = Math.max(MIN_BLOCK_MINUTES, total - warmup);
  const candidates =
    spineIds.length > 0 ? spineIds : inputs.excerpts.map((e) => e.excerptId);
  // Fit however many spine excerpts the budget actually holds — a bad day
  // never gets stretched to fit the rep; the rep shrinks to fit the day.
  const count = Math.max(1, Math.min(candidates.length, Math.floor(budget / MIN_BLOCK_MINUTES), 3));
  const ids = candidates.slice(0, count);

  const per = Math.floor(budget / count);
  const blocks: SessionBlock[] = [
    { kind: 'warmup', minutes: warmup, label: 'Two minutes of ease-in — nothing heroic' },
    ...ids.map((excerptId) => ({
      kind: 'excerpt' as const,
      minutes: per,
      label: excerptId,
      excerptId,
      phase: 'maintain' as const,
    })),
  ];
  return {
    date,
    phase: 'maintain',
    plannedMinutes: blocks.reduce((s, b) => s + b.minutes, 0),
    blocks,
  };
}

function dominant(phases: Phase[]): Phase {
  const counts = new Map<Phase, number>();
  for (const p of phases) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best: Phase = 'consolidate';
  let bestCount = -1;
  for (const [p, c] of counts) {
    if (c > bestCount) {
      best = p;
      bestCount = c;
    }
  }
  return best;
}

/** Deterministic Fisher-Yates with a string-seeded PRNG (mulberry32). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
