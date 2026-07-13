import { describe, expect, it } from 'vitest';

import { diffDays, weekKey } from '../dates.ts';
import { buildMinimumViableSession, generatePlan, seededShuffle } from '../engine.ts';
import { phaseOn } from '../phases.ts';
import {
  AUDITIONS,
  DANSES,
  EXCERPTS,
  LUCIA,
  NUTCRACKER,
  PROFILE,
  SYMPH_FANTASTIQUE,
  baseInputs,
} from './fixtures.ts';

const plan = generatePlan(baseInputs());

describe('generatePlan — structure (acceptance criterion #3)', () => {
  it('produces sessions across the horizon', () => {
    expect(plan.sessions.length).toBeGreaterThan(50);
    expect(plan.sessions[0].date >= '2026-08-10').toBe(true);
    const last = plan.sessions[plan.sessions.length - 1];
    expect(last.date <= '2026-12-12').toBe(true);
  });

  it('honors blackout dates', () => {
    const dates = new Set(plan.sessions.map((s) => s.date));
    for (const blackout of PROFILE.blackoutDates) {
      expect(dates.has(blackout)).toBe(false);
    }
  });

  it('never schedules practice on an audition day', () => {
    const dates = new Set(plan.sessions.map((s) => s.date));
    for (const a of AUDITIONS) {
      expect(dates.has(a.auditionDate)).toBe(false);
    }
  });

  it('honors rest days: never more than daysPerWeek sessions in a week', () => {
    const perWeek = new Map<string, number>();
    for (const s of plan.sessions) {
      perWeek.set(weekKey(s.date), (perWeek.get(weekKey(s.date)) ?? 0) + 1);
    }
    for (const [, count] of perWeek) {
      expect(count).toBeLessThanOrEqual(PROFILE.daysPerWeek);
    }
  });

  it('clamps a 7-day-a-week profile to 6 with a warning (mandatory rest day)', () => {
    const seven = generatePlan(
      baseInputs({ profile: { ...PROFILE, daysPerWeek: 7 } }),
    );
    const perWeek = new Map<string, number>();
    for (const s of seven.sessions) {
      perWeek.set(weekKey(s.date), (perWeek.get(weekKey(s.date)) ?? 0) + 1);
    }
    for (const [, count] of perWeek) {
      expect(count).toBeLessThanOrEqual(6);
    }
    expect(seven.warnings.some((w) => w.includes('rest day'))).toBe(true);
  });

  it('no session exceeds the requested volume', () => {
    for (const s of plan.sessions) {
      expect(s.plannedMinutes).toBeLessThanOrEqual(PROFILE.sessionMinutes);
    }
  });

  it('week-over-week volume never ramps past the cap', () => {
    const weekTotals = new Map<string, number>();
    for (const s of plan.sessions) {
      weekTotals.set(weekKey(s.date), (weekTotals.get(weekKey(s.date)) ?? 0) + s.plannedMinutes);
    }
    const ordered = [...weekTotals.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i][1]).toBeLessThanOrEqual(Math.round(ordered[i - 1][1] * 1.1) + 1);
    }
  });

  it('inserts in-session breaks in full-length sessions', () => {
    const full = plan.sessions.find((s) => s.plannedMinutes >= 80 && s.blocks.some((b) => b.kind === 'excerpt'));
    expect(full).toBeDefined();
    expect(full!.blocks.some((b) => b.kind === 'break')).toBe(true);
  });

  it('opens with the warm-up ritual and ends with the closer', () => {
    for (const s of plan.sessions) {
      expect(s.blocks[0].kind).toBe('warmup');
      expect(s.blocks[s.blocks.length - 1].kind).toBe('closer');
    }
  });
});

describe('generatePlan — rotation frequency', () => {
  it('exposes every excerpt', () => {
    const exposed = new Set<string>();
    for (const s of plan.sessions) {
      for (const b of s.blocks) if (b.excerptId) exposed.add(b.excerptId);
    }
    for (const e of EXCERPTS) {
      expect(exposed.has(e.excerptId)).toBe(true);
    }
  });

  it('gives hard + not-ready rep more time than easy + ready rep before Oct 5', () => {
    const minutesBefore = (excerptId: string, cutoff: string) => {
      let total = 0;
      for (const s of plan.sessions) {
        if (diffDays(s.date, cutoff) < 0) continue;
        for (const b of s.blocks) if (b.excerptId === excerptId) total += b.minutes;
      }
      return total;
    };
    // Nutcracker: difficulty 5, learning (deficit 3) vs Vysehrad: difficulty 3,
    // performance_ready (deficit 1) — both due Oct 5. Weight ratio 15:3.
    const nutcracker = minutesBefore(NUTCRACKER, '2026-10-05');
    const vysehrad = minutesBefore('smetana-vysehrad-opening', '2026-10-05');
    expect(nutcracker).toBeGreaterThan(vysehrad * 2);
  });

  it('keeps shared rep alive after the first audition (maintenance, not zero)', () => {
    const spineAfterFirst = plan.sessions
      .filter((s) => s.date > '2026-10-05' && s.date < '2026-11-20')
      .flatMap((s) => s.blocks)
      .filter((b) => b.excerptId === SYMPH_FANTASTIQUE || b.excerptId === NUTCRACKER || b.excerptId === DANSES);
    expect(spineAfterFirst.length).toBeGreaterThan(0);
  });

  it('ramps orphan rep just-in-time: Lucia gets more minutes in the 4 weeks before KC than the first 4 weeks', () => {
    const minutesIn = (excerptId: string, from: string, to: string) => {
      let total = 0;
      for (const s of plan.sessions) {
        if (s.date < from || s.date > to) continue;
        for (const b of s.blocks) if (b.excerptId === excerptId) total += b.minutes;
      }
      return total;
    };
    const early = minutesIn(LUCIA, '2026-08-10', '2026-09-06');
    const late = minutesIn(LUCIA, '2026-10-23', '2026-11-19');
    expect(late).toBeGreaterThan(early);
  });
});

describe('generatePlan — periodization', () => {
  it('builds a phase timeline for every excerpt', () => {
    for (const e of EXCERPTS) {
      expect(plan.phaseMap[e.excerptId]?.length).toBeGreaterThan(0);
    }
  });

  it('tapers immediately before the audition', () => {
    const windows = plan.phaseMap[NUTCRACKER];
    expect(phaseOn(windows, '2026-10-04')).toBe('taper');
    expect(phaseOn(windows, '2026-10-03')).toBe('taper');
  });

  it('starts a not_started excerpt in learn and a performance_ready one past learn', () => {
    expect(phaseOn(plan.phaseMap[LUCIA], '2026-08-10')).toBe('learn');
    expect(phaseOn(plan.phaseMap[DANSES], '2026-08-10')).toBe('consolidate');
  });

  it('holds shared rep in maintain between auditions', () => {
    expect(phaseOn(plan.phaseMap[SYMPH_FANTASTIQUE], '2026-10-15')).toBe('maintain');
  });

  it('schedules mock runs during simulate weeks', () => {
    const mockBlocks = plan.sessions
      .flatMap((s) => s.blocks)
      .filter((b) => b.kind === 'mock_run');
    expect(mockBlocks.length).toBeGreaterThan(0);
    for (const b of mockBlocks) {
      expect(b.auditionId).toBeTruthy();
      expect(b.mockOrder!.length).toBeGreaterThan(0);
    }
  });
});

describe('buildMinimumViableSession (the bad-day plan)', () => {
  it('is short and spine-only', () => {
    const mvs = buildMinimumViableSession('2026-09-01', baseInputs());
    expect(mvs.plannedMinutes).toBeLessThanOrEqual(PROFILE.minimumViableSessionMinutes + 5);
    const ids = mvs.blocks.filter((b) => b.excerptId).map((b) => b.excerptId);
    const overlapSpine = new Set(plan.overlap.spine.map((s) => s.excerptId));
    for (const id of ids) {
      expect(overlapSpine.has(id!)).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('same inputs → identical plan', () => {
    const a = generatePlan(baseInputs());
    const b = generatePlan(baseInputs());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seededShuffle is stable for a given seed and differs across seeds', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(seededShuffle(items, 'x')).toEqual(seededShuffle(items, 'x'));
    const shuffles = new Set(
      ['s1', 's2', 's3', 's4'].map((s) => seededShuffle(items, s).join(',')),
    );
    expect(shuffles.size).toBeGreaterThan(1);
  });
});
