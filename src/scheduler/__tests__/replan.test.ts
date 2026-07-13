import { describe, expect, it } from 'vitest';

import { replan } from '../replan.ts';
import type { AdherenceEvent } from '../types.ts';
import { FIREBIRD, LUCIA, baseInputs } from './fixtures.ts';

const threeMisses: AdherenceEvent[] = [
  { date: '2026-09-01', status: 'skipped' },
  { date: '2026-09-02', status: 'skipped' },
  { date: '2026-09-04', status: 'skipped' },
];

describe('replan (acceptance criterion #5)', () => {
  const result = replan(baseInputs(), threeMisses, '2026-09-05');

  it('three misses trigger a rebalance that pulls back far-out orphans', () => {
    // Lucia (KC, Nov 20) and Firebird (Des Moines, Dec 12) are both >21 days
    // out on Sept 5 — they get deprioritized; the spine is protected.
    expect(result.changes.deprioritizedExcerptIds).toContain(LUCIA);
    expect(result.changes.deprioritizedExcerptIds).toContain(FIREBIRD);
    expect(result.changes.protectedSpineExcerptIds.length).toBeGreaterThan(0);
  });

  it('replans from today, not from the original horizon', () => {
    expect(result.plan.sessions[0].date >= '2026-09-05').toBe(true);
  });

  it('explains itself in plain language with concrete audition status', () => {
    expect(result.message).toContain('rough week');
    expect(result.message).toMatch(/on track|tight|conversation/);
  });

  it('never shames', () => {
    const banned = [
      'fail', 'failure', 'behind', 'lazy', 'should have', "shouldn't",
      'streak', 'missed your', 'disappoint', 'excuse', 'slacking', 'guilt',
    ];
    const lower = result.message.toLowerCase();
    for (const word of banned) {
      expect(lower).not.toContain(word);
    }
  });

  it('fewer than three misses refreshes without deprioritizing anything', () => {
    const light = replan(
      baseInputs(),
      [{ date: '2026-09-01', status: 'skipped' }],
      '2026-09-05',
    );
    expect(light.changes.deprioritizedExcerptIds).toHaveLength(0);
    expect(light.message).toContain('refreshed');
  });

  it('re-rating an excerpt changes its rotation share (freed time reallocates)', () => {
    const before = replan(baseInputs(), [], '2026-09-05');
    const upgraded = baseInputs();
    upgraded.excerpts = upgraded.excerpts.map((e) =>
      e.excerptId === 'tchaikovsky-nutcracker-waltz-of-the-flowers-cadenza'
        ? { ...e, readiness: 'performance_ready' as const }
        : e,
    );
    const after = replan(upgraded, [], '2026-09-05');

    const minutesFor = (planResult: typeof before, id: string) =>
      planResult.plan.sessions
        .flatMap((s) => s.blocks)
        .filter((b) => b.excerptId === id)
        .reduce((s, b) => s + b.minutes, 0);

    const id = 'tchaikovsky-nutcracker-waltz-of-the-flowers-cadenza';
    expect(minutesFor(after, id)).toBeLessThan(minutesFor(before, id));
  });
});
