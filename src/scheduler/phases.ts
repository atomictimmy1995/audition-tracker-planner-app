/**
 * Backwards periodization (spec §5.3):
 *   Learn → Build → Consolidate → Simulate → Taper
 * computed per-excerpt (open question §11 — readiness varies wildly within
 * one list), backwards from each audition date. Rep shared with a later
 * audition goes to `maintain` between auditions instead of dropping to zero.
 */

import { addDays, diffDays, isBefore } from './dates.ts';
import type {
  AuditionInput,
  ExcerptInput,
  ISODate,
  Phase,
  PhaseWindow,
  Readiness,
} from './types.ts';

/** Readiness → how much of the pipeline the excerpt still needs. */
const ENTRY_PHASE: Record<Readiness, Phase> = {
  not_started: 'learn',
  learning: 'learn',
  under_tempo: 'build',
  performance_ready: 'consolidate',
};

/** Relative weights of each phase's share of available prep days. */
const PHASE_SHARE: Record<Exclude<Phase, 'taper' | 'maintain'>, number> = {
  learn: 0.3,
  build: 0.3,
  consolidate: 0.25,
  simulate: 0.15,
};

const PHASE_ORDER: Array<Exclude<Phase, 'taper' | 'maintain'>> = [
  'learn',
  'build',
  'consolidate',
  'simulate',
];

/**
 * Phase windows for one excerpt across the horizon. Multiple auditions that
 * include the excerpt produce: full ramp to the FIRST audition, `maintain`
 * between auditions, then a short re-peak (simulate + taper) before each
 * subsequent one — peaking repeatedly, not once.
 */
export function phaseWindowsForExcerpt(
  excerpt: ExcerptInput,
  auditionsWithExcerpt: AuditionInput[],
  horizonStart: ISODate,
  taperDays: number,
): PhaseWindow[] {
  if (auditionsWithExcerpt.length === 0) return [];

  const auditions = [...auditionsWithExcerpt].sort((a, b) =>
    a.auditionDate.localeCompare(b.auditionDate),
  );
  const windows: PhaseWindow[] = [];

  const first = auditions[0];
  const lastPrepDay = addDays(first.auditionDate, -1);
  if (!isBefore(lastPrepDay, horizonStart)) {
    windows.push(
      ...rampWindows(excerpt.readiness, horizonStart, lastPrepDay, first.id, taperDays),
    );
  }

  for (let i = 1; i < auditions.length; i++) {
    const prev = auditions[i - 1];
    const next = auditions[i];
    const gapStart = addDays(prev.auditionDate, 1);
    const gapEnd = addDays(next.auditionDate, -1);
    if (isBefore(gapEnd, gapStart)) continue;

    const gapDays = diffDays(gapStart, gapEnd) + 1;
    const rePeakDays = Math.min(gapDays, taperDays + 7); // ~1 week simulate + taper
    const rePeakStart = addDays(gapEnd, -(rePeakDays - 1));

    if (isBefore(gapStart, rePeakStart)) {
      windows.push({
        phase: 'maintain',
        start: gapStart,
        end: addDays(rePeakStart, -1),
        auditionId: next.id,
      });
    }
    const taperStart = addDays(gapEnd, -Math.min(taperDays, rePeakDays) + 1);
    if (isBefore(rePeakStart, taperStart)) {
      windows.push({
        phase: 'simulate',
        start: rePeakStart,
        end: addDays(taperStart, -1),
        auditionId: next.id,
      });
    }
    windows.push({ phase: 'taper', start: taperStart, end: gapEnd, auditionId: next.id });
  }

  return windows;
}

/** Full ramp toward a single audition, sized to the days actually available. */
function rampWindows(
  readiness: Readiness,
  start: ISODate,
  end: ISODate, // last prep day (day before audition)
  auditionId: string,
  taperDays: number,
): PhaseWindow[] {
  const totalDays = diffDays(start, end) + 1;
  const entry = ENTRY_PHASE[readiness];
  const phases = PHASE_ORDER.slice(PHASE_ORDER.indexOf(entry as never));

  const taper = Math.min(taperDays, Math.max(1, totalDays - phases.length));
  let rampDays = totalDays - taper;

  if (rampDays <= 0) {
    // No runway at all — everything is taper.
    return [{ phase: 'taper', start, end, auditionId }];
  }

  const shareTotal = phases.reduce((s, p) => s + PHASE_SHARE[p], 0);
  const windows: PhaseWindow[] = [];
  let cursor = start;
  let remaining = rampDays;

  for (const [i, phase] of phases.entries()) {
    const isLast = i === phases.length - 1;
    const days = isLast
      ? remaining
      : Math.max(1, Math.min(remaining - (phases.length - 1 - i), Math.round((PHASE_SHARE[phase] / shareTotal) * rampDays)));
    if (remaining <= 0) break;
    const windowEnd = addDays(cursor, Math.min(days, remaining) - 1);
    windows.push({ phase, start: cursor, end: windowEnd, auditionId });
    remaining -= Math.min(days, remaining);
    cursor = addDays(windowEnd, 1);
  }

  windows.push({ phase: 'taper', start: cursor, end, auditionId });
  return windows;
}

/** The phase an excerpt is in on a given date, per its windows. */
export function phaseOn(windows: PhaseWindow[], date: ISODate): Phase | null {
  for (const w of windows) {
    if (!isBefore(date, w.start) && !isBefore(w.end, date)) return w.phase;
  }
  return null;
}
