import { describe, expect, it } from 'vitest';

import { weekKey } from '../dates.ts';
import { MAX_DAILY_MINUTES, applyVolumeCaps } from '../guardrails.ts';

describe('applyVolumeCaps (spec §8 physical guardrails)', () => {
  it('clamps week-over-week ramp to the cap', () => {
    // Week 1: 3×60 = 180. Week 2 requests 3×120 = 360 (a 100% jump).
    const days = [
      { date: '2026-08-10', minutes: 60 },
      { date: '2026-08-12', minutes: 60 },
      { date: '2026-08-14', minutes: 60 },
      { date: '2026-08-17', minutes: 120 },
      { date: '2026-08-19', minutes: 120 },
      { date: '2026-08-21', minutes: 120 },
    ];
    const capped = applyVolumeCaps(days, 0.1);
    const weekTotals = new Map<string, number>();
    for (const d of capped) {
      weekTotals.set(weekKey(d.date), (weekTotals.get(weekKey(d.date)) ?? 0) + d.minutes);
    }
    expect(weekTotals.get('2026-08-10')).toBe(180);
    expect(weekTotals.get('2026-08-17')).toBeLessThanOrEqual(198); // 180 × 1.1
  });

  it('never lets a jump from 45 min/day to four hours through', () => {
    const days = [
      { date: '2026-08-10', minutes: 45 },
      { date: '2026-08-11', minutes: 45 },
      { date: '2026-08-17', minutes: 240 },
      { date: '2026-08-18', minutes: 240 },
    ];
    const capped = applyVolumeCaps(days, 0.1);
    const week2 = capped
      .filter((d) => weekKey(d.date) === '2026-08-17')
      .reduce((s, d) => s + d.minutes, 0);
    expect(week2).toBeLessThanOrEqual(Math.round(90 * 1.1));
  });

  it('enforces the absolute daily ceiling', () => {
    const capped = applyVolumeCaps([{ date: '2026-08-10', minutes: 400 }]);
    expect(capped[0].minutes).toBeLessThanOrEqual(MAX_DAILY_MINUTES);
  });

  it('leaves reductions untouched — tapering down is always allowed', () => {
    const days = [
      { date: '2026-08-10', minutes: 90 },
      { date: '2026-08-17', minutes: 40 },
    ];
    const capped = applyVolumeCaps(days, 0.1);
    expect(capped.find((d) => d.date === '2026-08-17')?.minutes).toBe(40);
  });
});
