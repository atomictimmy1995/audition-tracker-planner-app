/**
 * Physical guardrails (spec §8) — enforced in the scheduler, not the prompt.
 * A plan that injures someone six weeks out is worse than no plan.
 */

import { weekKey } from './dates.ts';
import type { ISODate } from './types.ts';

export const DEFAULT_MAX_WEEKLY_RAMP_PCT = 0.1;
export const DEFAULT_BREAK_EVERY_MINUTES = 40;
export const DEFAULT_BREAK_MINUTES = 5;
/** Absolute per-day ceiling regardless of what the profile claims. */
export const MAX_DAILY_MINUTES = 240;
/** At least one full rest day per week, always. */
export const MAX_PRACTICE_DAYS_PER_WEEK = 6;

export interface DayVolume {
  date: ISODate;
  minutes: number;
}

/**
 * Clamp week-over-week volume ramp. Week 1's total is the baseline (the
 * user's stated current volume); each following week may grow by at most
 * `maxRampPct` over the previous *allowed* week. Overflow within a week is
 * trimmed from its last sessions — never redistributed forward, which would
 * defeat the cap.
 */
export function applyVolumeCaps(
  days: DayVolume[],
  maxRampPct: number = DEFAULT_MAX_WEEKLY_RAMP_PCT,
): DayVolume[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const weeks = new Map<ISODate, DayVolume[]>();
  for (const day of sorted) {
    const key = weekKey(day.date);
    const bucket = weeks.get(key) ?? [];
    bucket.push({ ...day, minutes: Math.min(day.minutes, MAX_DAILY_MINUTES) });
    weeks.set(key, bucket);
  }

  const out: DayVolume[] = [];
  let previousAllowedTotal: number | null = null;

  for (const [, bucket] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const requested = bucket.reduce((sum, d) => sum + d.minutes, 0);
    const cap =
      previousAllowedTotal === null
        ? requested
        : Math.round(previousAllowedTotal * (1 + maxRampPct));

    let remaining = Math.min(requested, cap);
    for (const day of bucket) {
      const minutes = Math.min(day.minutes, remaining);
      out.push({ date: day.date, minutes });
      remaining -= minutes;
    }
    previousAllowedTotal = Math.min(requested, cap);
  }

  return out.filter((d) => d.minutes > 0);
}

/**
 * Choose practice days for one calendar week, honoring blackouts and the
 * mandatory rest day. Preference order spreads days out (Mon/Wed/Fri-ish)
 * rather than clumping, which is what actual practice hygiene wants.
 */
const WEEKDAY_PREFERENCE: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 5],
  5: [0, 1, 2, 3, 5],
  6: [0, 1, 2, 3, 4, 5],
};

export function pickPracticeDays(
  weekDates: ISODate[], // the (≤7) horizon dates in one week bucket, sorted
  daysPerWeek: number,
  blackouts: ReadonlySet<ISODate>,
  weekdayOf: (d: ISODate) => number,
): ISODate[] {
  const target = Math.min(daysPerWeek, MAX_PRACTICE_DAYS_PER_WEEK);
  const available = weekDates.filter((d) => !blackouts.has(d));
  if (available.length <= target) return available;

  const preferred = WEEKDAY_PREFERENCE[target] ?? WEEKDAY_PREFERENCE[6];
  const chosen = new Set<ISODate>();
  for (const wd of preferred) {
    const hit = available.find((d) => weekdayOf(d) === wd && !chosen.has(d));
    if (hit) chosen.add(hit);
    if (chosen.size === target) break;
  }
  // Fill from remaining availability if preferences were blacked out.
  for (const d of available) {
    if (chosen.size === target) break;
    chosen.add(d);
  }
  return [...chosen].sort();
}
